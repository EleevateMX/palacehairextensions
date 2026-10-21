-- =============================================================================
-- Servicios, recursos físicos, consumo de materiales (BOM) y CRM de clientas.
-- =============================================================================

create table public.service_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order int not null default 0
);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.service_categories (id),
  name text not null,
  description text,
  price_cents integer not null check (price_cents >= 0),
  price_is_from boolean not null default false,       -- "desde $…": precio sujeto a valoración
  duration_min int not null check (duration_min > 0),
  prep_min int not null default 0 check (prep_min >= 0),
  cleanup_min int not null default 0 check (cleanup_min >= 0),
  cleanup_occupies_staff boolean not null default false,
  buffer_min int not null default 0 check (buffer_min >= 0),
  requires_consultation boolean not null default false,  -- instalaciones que exigen valoración previa
  deposit_type text not null default 'none' check (deposit_type in ('none', 'fixed', 'percent')),
  deposit_value int not null default 0 check (deposit_value >= 0),   -- centavos o puntos base
  cancellation_min_hours int,
  maintenance_interval_days int,
  technique text,
  online_bookable boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger services_touch before update on public.services for each row execute function app.touch_updated_at();
create trigger services_audit after insert or update or delete on public.services for each row execute function app.audit_row();

-- Personal capacitado; duración y precio pueden variar por persona.
create table public.staff_services (
  staff_id uuid not null references public.staff_members (id) on delete cascade,
  service_id uuid not null references public.services (id) on delete cascade,
  duration_min int check (duration_min > 0),
  price_cents int check (price_cents >= 0),
  primary key (staff_id, service_id)
);

create table public.resource_types (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,          -- silla, estacion, lavacabezas, cabina, equipo…
  name text not null
);

-- Cada unidad física es un recurso. "4 sillas" = 4 filas: así la exclusión garantiza capacidad.
create table public.resources (
  id uuid primary key default gen_random_uuid(),
  resource_type_id uuid not null references public.resource_types (id),
  location_id uuid not null references public.locations (id),
  name text not null,
  is_active boolean not null default true,
  sort_order int not null default 0
);

create table public.service_resource_requirements (
  service_id uuid not null references public.services (id) on delete cascade,
  resource_type_id uuid not null references public.resource_types (id),
  quantity int not null default 1 check (quantity > 0),
  primary key (service_id, resource_type_id)
);

-- "Receta" del servicio: insumos estimados. is_variable = se elige al reservar (p. ej. tono de extensión).
create table public.service_materials (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services (id) on delete cascade,
  variant_id uuid references public.product_variants (id),
  material_role text not null,        -- hair, adhesive, tape, prep, disposable…
  quantity numeric(12,3) not null check (quantity > 0),
  is_variable boolean not null default false,
  reserve_on_booking boolean not null default true,
  notes text,
  check (is_variable or variant_id is not null)
);

-- Costos configurables adicionales por servicio (mano de obra, energía, amortización).
create table public.service_cost_items (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services (id) on delete cascade,
  label text not null,
  amount_cents int not null check (amount_cents >= 0)
);

-- ---------------------------------------------------------------------------
-- CRM
-- ---------------------------------------------------------------------------
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text,
  phone text,                         -- E.164 normalizado
  email extensions.citext,
  birth_date date,
  acquisition_channel text,           -- instagram, whatsapp, referido, walk_in…
  preferred_staff_id uuid references public.staff_members (id),
  hair_tone text,
  extension_technique text,
  extension_length_cm numeric(5,1),
  style_preferences text,
  maintenance_notes text,
  next_visit_suggested date,
  is_anonymized boolean not null default false,
  auth_user_id uuid unique references auth.users (id) on delete set null,   -- portal de clientas (V2)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index clients_phone_uq on public.clients (phone) where phone is not null;
create index clients_name_idx on public.clients (lower(first_name), lower(last_name));
create trigger clients_touch before update on public.clients for each row execute function app.touch_updated_at();
create trigger clients_audit after insert or update or delete on public.clients for each row execute function app.audit_row();

create type public.consent_purpose as enum (
  'privacy_notice', 'appointment_reminders', 'marketing_whatsapp', 'marketing_email', 'marketing_sms', 'photos_internal', 'photos_marketing'
);

-- Registro histórico de consentimientos (nunca se sobrescribe; la vigente es la más reciente).
create table public.client_consents (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  purpose public.consent_purpose not null,
  granted boolean not null,
  source text not null,               -- portal, recepcion, whatsapp, formulario…
  evidence text,                      -- referencia a firma/mensaje
  privacy_notice_version text,
  recorded_by uuid,
  recorded_at timestamptz not null default now()
);
create index on public.client_consents (client_id, purpose, recorded_at desc);
create trigger client_consents_immutable before update or delete on public.client_consents
  for each row execute function app.forbid_mutation();

create view public.v_client_current_consents with (security_invoker = true) as
select distinct on (client_id, purpose) client_id, purpose, granted, recorded_at, source
from public.client_consents
order by client_id, purpose, recorded_at desc;

-- Notas: 'general' (operativa) vs 'sensitive' (solo propietaria/administración).
create table public.client_notes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  sensitivity text not null default 'general' check (sensitivity in ('general', 'sensitive')),
  body text not null,
  author_staff_id uuid references public.staff_members (id),
  created_at timestamptz not null default now()
);

-- Fotografías antes/después: bucket privado; requiere consentimiento vigente.
create table public.client_photos (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  appointment_id uuid,
  kind text not null check (kind in ('before', 'after', 'consultation', 'reference')),
  storage_path text not null,
  uploaded_by uuid references public.staff_members (id),
  created_at timestamptz not null default now()
);

create or replace function app.client_has_consent(p_client uuid, p_purpose public.consent_purpose) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select c.granted from public.client_consents c
    where c.client_id = p_client and c.purpose = p_purpose
    order by c.recorded_at desc limit 1), false)
$$;

create or replace function app.enforce_photo_consent() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not app.client_has_consent(new.client_id, 'photos_internal') then
    raise exception 'CONSENT_REQUIRED' using detail = 'La clienta no ha autorizado fotografías';
  end if;
  return new;
end $$;
create trigger client_photos_consent before insert on public.client_photos
  for each row execute function app.enforce_photo_consent();

-- Anonimización (derecho de cancelación). Conserva registros contables sin datos personales.
create or replace function public.anonymize_client(p_client uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_role('owner', 'admin');
  update public.clients set
    first_name = 'Anonimizada', last_name = null, phone = null, email = null, birth_date = null,
    style_preferences = null, maintenance_notes = null, hair_tone = null, auth_user_id = null,
    is_anonymized = true
  where id = p_client;
  delete from public.client_notes where client_id = p_client;
  -- Las fotos deben borrarse también del bucket (Edge Function de mantenimiento; ver docs/06).
  delete from public.client_photos where client_id = p_client;
  perform app.audit_event('clients', p_client::text, jsonb_build_object('action', 'anonymize'));
end $$;
