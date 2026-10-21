-- =============================================================================
-- Palace Hair Extensions OS — Migración base
-- Extensiones, esquemas, tipos enumerados, utilidades comunes y auditoría.
-- Compatible con Supabase (esquemas auth/extensions existentes).
-- =============================================================================

create schema if not exists extensions;
create extension if not exists btree_gist with schema extensions;
create extension if not exists citext with schema extensions;

-- Esquema privado para funciones auxiliares (no expuesto por la API REST).
create schema if not exists app;

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------
create type public.app_role as enum ('owner', 'admin', 'receptionist', 'stylist', 'inventory', 'sales');

-- Estados separados: reserva, asistencia y pago son dimensiones independientes.
create type public.booking_status as enum ('hold', 'confirmed', 'cancelled', 'expired');
create type public.attendance_status as enum ('scheduled', 'arrived', 'in_service', 'completed', 'no_show');
create type public.payment_status as enum ('not_required', 'pending', 'deposit_paid', 'paid', 'refunded', 'needs_refund');
create type public.materials_status as enum ('not_required', 'reserved', 'missing', 'consumed', 'released');

create type public.movement_type as enum (
  'initial', 'purchase', 'sale', 'service_consumption', 'adjustment', 'waste',
  'customer_return', 'supplier_return', 'transfer_out', 'transfer_in', 'count_adjustment'
);
create type public.reservation_status as enum ('active', 'consumed', 'released', 'expired');
create type public.reservation_source as enum ('appointment', 'pos_cart', 'online_order', 'manual');

-- ---------------------------------------------------------------------------
-- Utilidades
-- ---------------------------------------------------------------------------
create or replace function app.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- Claims del JWT de la petición (formato Supabase/PostgREST).
create or replace function app.jwt_claims() returns jsonb
language sql stable set search_path = '' as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;

create or replace function app.is_service_role() returns boolean
language sql stable set search_path = '' as $$
  select coalesce(app.jwt_claims() ->> 'role', '') = 'service_role'
$$;

-- Error de negocio con código legible para el cliente (SQLSTATE P0001 + prefijo).
create or replace function app.fail(code text, detail text default null) returns void
language plpgsql set search_path = '' as $$
begin
  raise exception '%', code using detail = coalesce(detail, code), hint = 'palace_business_error';
end $$;

-- ---------------------------------------------------------------------------
-- Auditoría (solo inserción)
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_user_id uuid,
  table_name text not null,
  record_id text,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE', 'RPC')),
  old_data jsonb,
  new_data jsonb
);
create index audit_log_table_record_idx on public.audit_log (table_name, record_id);
create index audit_log_occurred_idx on public.audit_log (occurred_at desc);

create or replace function app.audit_row() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  rec jsonb;
begin
  rec := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  insert into public.audit_log (actor_user_id, table_name, record_id, action, old_data, new_data)
  values (
    nullif(app.jwt_claims() ->> 'sub', '')::uuid,
    tg_table_name,
    rec ->> 'id',
    tg_op,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return null;
end $$;

create or replace function app.audit_event(p_table text, p_record text, p_payload jsonb) returns void
language sql security definer set search_path = '' as $$
  insert into public.audit_log (actor_user_id, table_name, record_id, action, new_data)
  values (nullif(app.jwt_claims() ->> 'sub', '')::uuid, p_table, p_record, 'RPC', p_payload);
$$;

-- Tablas de libro mayor: prohíbe UPDATE/DELETE.
create or replace function app.forbid_mutation() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'IMMUTABLE_LEDGER' using detail = tg_table_name || ' es de solo inserción';
end $$;
