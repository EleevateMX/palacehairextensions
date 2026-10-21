-- =============================================================================
-- CRM de clientas: segmentos, alta atómica con consentimientos y registro de
-- consentimientos con sello del servidor (versión del aviso y quién registra).
-- No crea tablas nuevas: reutiliza clients, client_consents, appointments y
-- maintenance_reminders con sus políticas RLS vigentes.
-- =============================================================================

-- Fecha local de la sucursal principal (una sola empresa por ahora).
create or replace function app.business_today() returns date
language sql stable security definer set search_path = '' as $$
  select (now() at time zone coalesce(
    (select l.timezone from public.locations l where l.is_active order by l.name limit 1),
    'America/Mexico_City'))::date
$$;

-- ---------------------------------------------------------------------------
-- Actividad y segmentos por clienta.
-- security_invoker: RLS de clients, appointments y maintenance_reminders aplica a quien
-- consulta (una estilista solo ve sus clientas y sus citas; inventarios no ve ninguna).
-- Definiciones:
--   nueva       → su primera cita (no cancelada ni vencida) cae en los últimos 30 días o después
--   frecuente   → 3 o más visitas completadas en los últimos 180 días
--   inactiva    → sin cita futura y sin visita completada (o alta, si nunca vino) en 90+ días
--   mant. próx. → recordatorio pendiente/enviado con vencimiento en ≤ 14 días (incluye vencidos)
-- ---------------------------------------------------------------------------
create view public.v_client_activity with (security_invoker = true) as
select
  c.id as client_id, c.first_name, c.last_name, c.phone, c.email, c.hair_tone, c.extension_technique,
  c.extension_length_cm, c.next_visit_suggested, c.preferred_staff_id, c.acquisition_channel,
  c.is_anonymized, c.created_at,
  a.first_appointment_at, a.last_visit_at, a.next_appointment_at,
  coalesce(a.completed_visits_180d, 0)::int as completed_visits_180d,
  m.next_maintenance_due,
  coalesce(a.first_appointment_at >= now() - interval '30 days', false) as is_new,
  coalesce(a.completed_visits_180d, 0) >= 3 as is_frequent,
  (a.next_appointment_at is null and coalesce(a.last_visit_at, c.created_at) < now() - interval '90 days') as is_inactive,
  coalesce(m.next_maintenance_due <= app.business_today() + 14, false) as maintenance_due_soon
from public.clients c
left join lateral (
  select
    min(ap.starts_at) filter (where ap.booking_status not in ('cancelled', 'expired')) as first_appointment_at,
    max(ap.starts_at) filter (where ap.attendance_status = 'completed') as last_visit_at,
    min(ap.starts_at) filter (where ap.starts_at > now() and ap.booking_status in ('confirmed', 'hold')
                                and ap.attendance_status = 'scheduled') as next_appointment_at,
    count(*) filter (where ap.attendance_status = 'completed' and ap.starts_at >= now() - interval '180 days') as completed_visits_180d
  from public.appointments ap
  where ap.client_id = c.id
) a on true
left join lateral (
  select min(r.due_date) as next_maintenance_due
  from public.maintenance_reminders r
  where r.client_id = c.id and r.status in ('pending', 'sent')
) m on true;
revoke all on public.v_client_activity from anon;
grant select on public.v_client_activity to authenticated;

-- ---------------------------------------------------------------------------
-- Alta de clienta + consentimientos iniciales en una sola transacción.
-- p: {first_name, last_name, phone (E.164), email, birth_date, acquisition_channel,
--     preferred_staff_id, hair_tone, extension_technique, extension_length_cm,
--     consents: {privacy_notice: bool, appointment_reminders: bool, marketing_whatsapp: bool,
--                marketing_email: bool, photos_internal: bool, photos_marketing: bool}}
-- Sin aviso de privacidad aceptado no se registra (PRIVACY_REQUIRED).
-- ---------------------------------------------------------------------------
create or replace function public.create_client_with_consents(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_version text;
  v_staff uuid := app.current_staff_id();
  v_purpose public.consent_purpose;
  v_phone text := nullif(btrim(p ->> 'phone'), '');
begin
  perform app.require_role('owner', 'admin', 'receptionist', 'sales');
  if nullif(btrim(p ->> 'first_name'), '') is null then perform app.fail('NAME_REQUIRED'); end if;
  if not coalesce((p -> 'consents' ->> 'privacy_notice')::boolean, false) then perform app.fail('PRIVACY_REQUIRED'); end if;
  if v_phone is not null and v_phone !~ '^\+[1-9][0-9]{9,14}$' then perform app.fail('INVALID_PHONE'); end if;
  if v_phone is not null and exists (select 1 from public.clients where phone = v_phone) then perform app.fail('PHONE_TAKEN'); end if;

  select privacy_notice_version into v_version from public.business_settings where id = 1;

  insert into public.clients (first_name, last_name, phone, email, birth_date, acquisition_channel, preferred_staff_id,
                              hair_tone, extension_technique, extension_length_cm)
  values (btrim(p ->> 'first_name'), nullif(btrim(p ->> 'last_name'), ''), v_phone, nullif(btrim(p ->> 'email'), ''),
          nullif(p ->> 'birth_date', '')::date, nullif(p ->> 'acquisition_channel', ''), nullif(p ->> 'preferred_staff_id', '')::uuid,
          nullif(btrim(p ->> 'hair_tone'), ''), nullif(btrim(p ->> 'extension_technique'), ''), nullif(p ->> 'extension_length_cm', '')::numeric)
  returning id into v_id;

  -- Se registran todas las finalidades (otorgadas o no) para dejar constancia de lo elegido en el alta.
  foreach v_purpose in array array['privacy_notice', 'appointment_reminders', 'marketing_whatsapp', 'marketing_email',
                                   'photos_internal', 'photos_marketing']::public.consent_purpose[] loop
    insert into public.client_consents (client_id, purpose, granted, source, privacy_notice_version, recorded_by)
    values (v_id, v_purpose, coalesce((p -> 'consents' ->> v_purpose::text)::boolean, false), 'recepcion', v_version, v_staff);
  end loop;

  perform app.audit_event('clients', v_id::text, jsonb_build_object('action', 'create_with_consents'));
  return v_id;
exception
  when unique_violation then perform app.fail('PHONE_TAKEN'); return null;
end $$;

-- ---------------------------------------------------------------------------
-- Otorgar o revocar un consentimiento: SIEMPRE inserta una fila nueva (historial inmutable).
-- La versión del aviso y quién registra los pone el servidor.
-- ---------------------------------------------------------------------------
create or replace function public.record_client_consent(
  p_client uuid, p_purpose public.consent_purpose, p_granted boolean, p_evidence text default null, p_source text default 'recepcion'
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  perform app.require_role('owner', 'admin', 'receptionist', 'sales');
  if not exists (select 1 from public.clients where id = p_client and not is_anonymized) then perform app.fail('NOT_FOUND'); end if;
  insert into public.client_consents (client_id, purpose, granted, source, evidence, privacy_notice_version, recorded_by)
  values (p_client, p_purpose, p_granted, coalesce(nullif(btrim(p_source), ''), 'recepcion'), nullif(btrim(p_evidence), ''),
          (select privacy_notice_version from public.business_settings where id = 1), app.current_staff_id())
  returning id into v_id;
  return v_id;
end $$;

-- Ejecución: solo personal autenticado (cada función valida el rol).
revoke execute on function public.create_client_with_consents(jsonb) from public, anon;
revoke execute on function public.record_client_consent(uuid, public.consent_purpose, boolean, text, text) from public, anon;
grant execute on function public.create_client_with_consents(jsonb) to authenticated, service_role;
grant execute on function public.record_client_consent(uuid, public.consent_purpose, boolean, text, text) to authenticated, service_role;
revoke execute on function app.business_today() from public;
grant execute on function app.business_today() to authenticated, service_role;
