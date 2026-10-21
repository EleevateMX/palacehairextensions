-- =============================================================================
-- Organización, configuración del negocio, personal, roles y horarios.
-- Una sola empresa; `location_id` prepara el soporte de sucursales futuras.
-- =============================================================================

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  timezone text not null default 'America/Mexico_City',
  address text,
  phone text,
  maps_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Configuración singleton. La identidad visual es provisional y editable (ver docs/03).
create table public.business_settings (
  id smallint primary key default 1 check (id = 1),
  display_name text not null default 'Palace Hair Extensions',
  legal_name text,
  rfc text,
  brand jsonb not null default '{}'::jsonb,           -- colores, tipografías, logotipo (provisional)
  booking_policy jsonb not null default '{"hold_minutes": 15, "min_lead_minutes": 120, "max_advance_days": 90, "slot_step_minutes": 15}'::jsonb,
  cancellation_policy jsonb not null default '{"free_until_hours": 24}'::jsonb,
  privacy_notice_version text,
  updated_at timestamptz not null default now()
);

create table public.business_hours (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations (id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),  -- 0 = domingo
  opens_at time not null,
  closes_at time not null,
  check (closes_at > opens_at)
);
create index on public.business_hours (location_id, weekday);

-- Festivos y días especiales: is_closed o un horario distinto.
create table public.special_days (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations (id) on delete cascade,
  day date not null,
  label text,
  is_closed boolean not null default true,
  opens_at time,
  closes_at time,
  unique (location_id, day),
  check (is_closed or (opens_at is not null and closes_at is not null and closes_at > opens_at))
);

create table public.staff_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users (id) on delete set null,
  location_id uuid references public.locations (id),
  display_name text not null,
  email extensions.citext,
  phone text,
  role public.app_role not null,
  is_bookable boolean not null default false,       -- aparece en la agenda
  calendar_color text,
  hire_date date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger staff_members_touch before update on public.staff_members for each row execute function app.touch_updated_at();

-- Turnos semanales (permite turnos partidos: los huecos son descansos).
create table public.staff_schedules (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff_members (id) on delete cascade,
  location_id uuid not null references public.locations (id),
  weekday smallint not null check (weekday between 0 and 6),
  starts_at time not null,
  ends_at time not null,
  check (ends_at > starts_at)
);
create index on public.staff_schedules (staff_id, weekday);

create type public.time_off_kind as enum ('vacation', 'permit', 'sick', 'training', 'other');
create type public.time_off_status as enum ('requested', 'approved', 'rejected', 'cancelled');

create table public.staff_time_off (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff_members (id) on delete cascade,
  kind public.time_off_kind not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.time_off_status not null default 'requested',
  reason text,
  requested_by uuid references public.staff_members (id),
  decided_by uuid references public.staff_members (id),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index on public.staff_time_off (staff_id, starts_at);

-- ---------------------------------------------------------------------------
-- Helpers de identidad y roles (usados por RLS y RPC)
-- ---------------------------------------------------------------------------
create or replace function app.current_user_id() returns uuid
language sql stable set search_path = '' as $$
  select nullif(app.jwt_claims() ->> 'sub', '')::uuid
$$;

create or replace function app.current_staff_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select s.id from public.staff_members s
  where s.user_id = app.current_user_id() and s.is_active
$$;

create or replace function app.current_app_role() returns public.app_role
language sql stable security definer set search_path = '' as $$
  select s.role from public.staff_members s
  where s.user_id = app.current_user_id() and s.is_active
$$;

create or replace function app.has_role(variadic roles public.app_role[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(app.current_app_role() = any (roles), false)
$$;

create or replace function app.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select app.current_staff_id() is not null
$$;

-- Exige rol (o service_role del servidor) dentro de RPCs.
create or replace function app.require_role(variadic roles public.app_role[]) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if app.is_service_role() then return; end if;
  if not coalesce(app.current_app_role() = any (roles), false) then
    perform app.fail('FORBIDDEN', 'Rol sin permiso para esta operación');
  end if;
end $$;

create trigger staff_members_audit after insert or update or delete on public.staff_members
  for each row execute function app.audit_row();
create trigger staff_time_off_audit after insert or update or delete on public.staff_time_off
  for each row execute function app.audit_row();
