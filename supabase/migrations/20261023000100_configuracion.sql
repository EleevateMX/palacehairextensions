-- =============================================================================
-- Configuración y Personal: reemplazo atómico de horarios del negocio y turnos del
-- personal (permiten varios rangos por día = turnos partidos) y cancelación de ausencias.
-- Las RPC validan rangos y traslapes en la BD; la app solo replica la validación para UX.
-- =============================================================================

-- Valida una lista [{weekday, starts, ends}] (horas locales "HH:MM"): día 0–6, fin > inicio y
-- sin traslapes dentro del mismo día. Devuelve las filas normalizadas.
create or replace function app.parse_weekly_ranges(p_ranges jsonb)
returns table (weekday smallint, starts_at time, ends_at time)
language plpgsql stable set search_path = '' as $$
declare
  r jsonb;
  v_day int;
  v_start time;
  v_end time;
  d smallint[] := '{}';
  s time[] := '{}';
  e time[] := '{}';
begin
  if p_ranges is null or jsonb_typeof(p_ranges) <> 'array' then perform app.fail('INVALID_RANGE'); end if;
  for r in select * from jsonb_array_elements(p_ranges) loop
    begin
      v_day := (r ->> 'weekday')::int;
      v_start := (r ->> 'starts')::time;
      v_end := (r ->> 'ends')::time;
    exception when others then
      perform app.fail('INVALID_RANGE', 'Rango con formato inválido');
    end;
    if v_day is null or v_day < 0 or v_day > 6 then perform app.fail('INVALID_WEEKDAY'); end if;
    if v_start is null or v_end is null or v_end <= v_start then
      perform app.fail('INVALID_RANGE', 'El fin debe ser posterior al inicio');
    end if;
    d := d || v_day::smallint;
    s := s || v_start;
    e := e || v_end;
  end loop;
  if exists (select 1 from generate_subscripts(d, 1) i, generate_subscripts(d, 1) j
              where i < j and d[i] = d[j] and s[i] < e[j] and s[j] < e[i]) then
    perform app.fail('OVERLAPPING_RANGES', 'Hay rangos que se traslapan el mismo día');
  end if;
  return query select d[i], s[i], e[i] from generate_subscripts(d, 1) i order by 1, 2;
end $$;

-- Reemplaza el horario semanal de una sucursal en una sola transacción.
create or replace function public.replace_business_hours(p_location uuid, p_hours jsonb) returns int
language plpgsql security definer set search_path = '' as $$
declare
  n int;
begin
  perform app.require_role('owner', 'admin');
  if not exists (select 1 from public.locations where id = p_location) then perform app.fail('NOT_FOUND'); end if;
  -- Todo ocurre en la misma transacción: si un rango es inválido no se borra nada.
  delete from public.business_hours where location_id = p_location;
  insert into public.business_hours (location_id, weekday, opens_at, closes_at)
  select p_location, h.weekday, h.starts_at, h.ends_at from app.parse_weekly_ranges(p_hours) h;
  get diagnostics n = row_count;
  perform app.audit_event('business_hours', p_location::text, jsonb_build_object('action', 'replace', 'hours', p_hours));
  return n;
end $$;

-- Reemplaza los turnos semanales de una persona en una sucursal (turnos partidos permitidos).
create or replace function public.replace_staff_schedule(p_staff uuid, p_location uuid, p_shifts jsonb) returns int
language plpgsql security definer set search_path = '' as $$
declare
  n int;
begin
  perform app.require_role('owner', 'admin');
  if not exists (select 1 from public.staff_members where id = p_staff) then perform app.fail('NOT_FOUND'); end if;
  if not exists (select 1 from public.locations where id = p_location) then perform app.fail('NOT_FOUND'); end if;
  delete from public.staff_schedules where staff_id = p_staff and location_id = p_location;
  insert into public.staff_schedules (staff_id, location_id, weekday, starts_at, ends_at)
  select p_staff, p_location, s.weekday, s.starts_at, s.ends_at from app.parse_weekly_ranges(p_shifts) s;
  get diagnostics n = row_count;
  perform app.audit_event('staff_schedules', p_staff::text, jsonb_build_object('action', 'replace', 'location', p_location, 'shifts', p_shifts));
  return n;
end $$;

-- Cancela una ausencia. La persona puede cancelar su propia solicitud pendiente; owner/admin
-- pueden cancelar cualquiera, incluso aprobada (libera el bloqueo de agenda).
create or replace function public.cancel_time_off(p_time_off uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  t public.staff_time_off;
  v_admin boolean := app.has_role('owner', 'admin') or app.is_service_role();
begin
  if app.current_staff_id() is null and not app.is_service_role() then perform app.fail('FORBIDDEN'); end if;
  select * into t from public.staff_time_off where id = p_time_off for update;
  if not found then perform app.fail('NOT_FOUND'); end if;
  if not v_admin then
    if t.staff_id <> app.current_staff_id() then perform app.fail('FORBIDDEN'); end if;
    if t.status <> 'requested' then perform app.fail('TIME_OFF_NOT_PENDING'); end if;
  elsif t.status not in ('requested', 'approved') then
    perform app.fail('TIME_OFF_NOT_PENDING');
  end if;
  update public.appointment_allocations set active = false where time_off_id = t.id and active;
  update public.staff_time_off set status = 'cancelled', decided_by = app.current_staff_id(), decided_at = now() where id = t.id;
end $$;

-- Ejecución: solo personal autenticado (las funciones validan rol).
revoke execute on function public.replace_business_hours(uuid, jsonb), public.replace_staff_schedule(uuid, uuid, jsonb),
  public.cancel_time_off(uuid) from public, anon;
grant execute on function public.replace_business_hours(uuid, jsonb), public.replace_staff_schedule(uuid, uuid, jsonb),
  public.cancel_time_off(uuid) to authenticated, service_role;
revoke execute on function app.parse_weekly_ranges(jsonb) from public;
