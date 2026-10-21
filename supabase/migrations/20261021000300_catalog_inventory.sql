-- =============================================================================
-- Catálogo, variantes e inventario.
-- Una sola fuente de existencias (stock_levels) para POS, servicios y tienda en línea.
-- disponible = on_hand − reserved. Todas las mutaciones pasan por funciones atómicas.
-- =============================================================================

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_name text,
  phone text,
  email extensions.citext,
  rfc text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.brands (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table public.product_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  parent_id uuid references public.product_categories (id),
  sort_order int not null default 0
);

create type public.product_kind as enum ('hair_extension', 'retail', 'supply', 'tool');
create type public.unit_of_measure as enum ('piece', 'pack', 'gram', 'ml', 'bundle', 'strand', 'meter');

create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  kind public.product_kind not null,
  category_id uuid references public.product_categories (id),
  brand_id uuid references public.brands (id),
  supplier_id uuid references public.suppliers (id),
  technique text,                -- cinta, keratina, microlink, cosida… (catálogo configurable)
  is_sellable_pos boolean not null default true,
  is_sellable_online boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger products_touch before update on public.products for each row execute function app.touch_updated_at();

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  sku text not null unique,
  barcode text unique,
  name text not null,
  tone text,                      -- tono / color
  length_cm numeric(5,1),
  texture text,                   -- lacio, ondulado, rizado…
  presentation text,              -- paquete 50 g, 20 piezas…
  unit public.unit_of_measure not null default 'piece',
  grams_per_unit numeric(8,2),
  cost_cents integer not null default 0 check (cost_cents >= 0),
  price_cents integer not null default 0 check (price_cents >= 0),
  promo_price_cents integer check (promo_price_cents >= 0),
  promo_ends_at timestamptz,
  min_stock numeric(12,3) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.product_variants (product_id);
create index on public.product_variants (tone, length_cm);
create trigger product_variants_touch before update on public.product_variants for each row execute function app.touch_updated_at();
create trigger product_variants_audit after insert or update or delete on public.product_variants for each row execute function app.audit_row();

create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  variant_id uuid references public.product_variants (id) on delete cascade,
  storage_path text not null,        -- bucket "catalog" (público)
  alt_text text,
  sort_order int not null default 0
);

-- ---------------------------------------------------------------------------
-- Existencias
-- ---------------------------------------------------------------------------
create table public.stock_levels (
  variant_id uuid not null references public.product_variants (id) on delete restrict,
  location_id uuid not null references public.locations (id) on delete restrict,
  on_hand numeric(12,3) not null default 0,
  reserved numeric(12,3) not null default 0,
  bin_location text,                 -- ubicación física (anaquel, cajón)
  updated_at timestamptz not null default now(),
  primary key (variant_id, location_id),
  -- Respaldo final contra sobreventa, además de los bloqueos en las funciones.
  constraint stock_non_negative check (on_hand >= 0 and reserved >= 0),
  constraint stock_reserved_le_on_hand check (reserved <= on_hand)
);

create table public.stock_movements (
  id bigint generated always as identity primary key,
  variant_id uuid not null references public.product_variants (id),
  location_id uuid not null references public.locations (id),
  movement_type public.movement_type not null,
  quantity numeric(12,3) not null check (quantity <> 0),   -- con signo: + entra, − sale
  on_hand_after numeric(12,3) not null,
  unit_cost_cents integer,
  reference_type text,              -- sale, appointment, purchase_order, stock_count, transfer…
  reference_id text,
  note text,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index on public.stock_movements (variant_id, created_at desc);
create index on public.stock_movements (reference_type, reference_id);
create trigger stock_movements_immutable before update or delete on public.stock_movements
  for each row execute function app.forbid_mutation();

create table public.stock_reservations (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references public.product_variants (id),
  location_id uuid not null references public.locations (id),
  quantity numeric(12,3) not null check (quantity > 0),
  source public.reservation_source not null,
  appointment_id uuid,              -- FK añadida en la migración de agenda
  client_id uuid,                   -- inventario asignado por clienta
  status public.reservation_status not null default 'active',
  expires_at timestamptz,
  note text,
  created_by uuid,
  created_at timestamptz not null default now(),
  closed_at timestamptz
);
create index on public.stock_reservations (variant_id) where status = 'active';
create index on public.stock_reservations (appointment_id);

create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers (id),
  location_id uuid not null references public.locations (id),
  status text not null default 'draft' check (status in ('draft', 'sent', 'partial', 'received', 'cancelled')),
  expected_at date,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now()
);
create table public.purchase_order_lines (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders (id) on delete cascade,
  variant_id uuid not null references public.product_variants (id),
  qty_ordered numeric(12,3) not null check (qty_ordered > 0),
  qty_received numeric(12,3) not null default 0 check (qty_received >= 0),
  unit_cost_cents integer not null check (unit_cost_cents >= 0)
);

create table public.stock_counts (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations (id),
  status text not null default 'open' check (status in ('open', 'applied', 'cancelled')),
  started_by uuid,
  started_at timestamptz not null default now(),
  applied_at timestamptz
);
create table public.stock_count_lines (
  stock_count_id uuid not null references public.stock_counts (id) on delete cascade,
  variant_id uuid not null references public.product_variants (id),
  counted_qty numeric(12,3) not null check (counted_qty >= 0),
  primary key (stock_count_id, variant_id)
);

create view public.v_stock_availability with (security_invoker = true) as
select
  sl.variant_id, sl.location_id, v.sku, v.name as variant_name, p.name as product_name, p.kind,
  v.tone, v.length_cm, v.texture, sl.on_hand, sl.reserved,
  sl.on_hand - sl.reserved as available, v.min_stock,
  (sl.on_hand - sl.reserved) <= v.min_stock as is_low, sl.bin_location, v.price_cents
from public.stock_levels sl
join public.product_variants v on v.id = sl.variant_id
join public.products p on p.id = v.product_id;

-- ---------------------------------------------------------------------------
-- Funciones atómicas de inventario
-- ---------------------------------------------------------------------------

-- Bloquea (y crea si no existe) la fila de existencias.
create or replace function app.lock_stock(p_variant uuid, p_location uuid) returns public.stock_levels
language plpgsql security definer set search_path = '' as $$
declare
  r public.stock_levels;
begin
  insert into public.stock_levels (variant_id, location_id) values (p_variant, p_location)
  on conflict do nothing;
  select * into r from public.stock_levels
   where variant_id = p_variant and location_id = p_location
   for update;
  return r;
end $$;

-- Aplica un movimiento con signo. Si es salida, valida contra lo DISPONIBLE (no reservado),
-- salvo que p_from_reserved indique que consume una reserva propia.
create or replace function app.apply_movement(
  p_variant uuid, p_location uuid, p_type public.movement_type, p_qty numeric,
  p_ref_type text default null, p_ref_id text default null, p_note text default null,
  p_unit_cost integer default null, p_from_reserved numeric default 0
) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  s public.stock_levels;
  mid bigint;
begin
  s := app.lock_stock(p_variant, p_location);
  if p_qty < 0 and (s.on_hand - s.reserved + p_from_reserved) < -p_qty then
    perform app.fail('INSUFFICIENT_STOCK', format('Disponible %s, requerido %s', s.on_hand - s.reserved, -p_qty));
  end if;
  update public.stock_levels
     set on_hand = on_hand + p_qty, reserved = reserved - p_from_reserved, updated_at = now()
   where variant_id = p_variant and location_id = p_location
  returning on_hand into s.on_hand;
  insert into public.stock_movements (variant_id, location_id, movement_type, quantity, on_hand_after,
                                      unit_cost_cents, reference_type, reference_id, note, created_by)
  values (p_variant, p_location, p_type, p_qty, s.on_hand, p_unit_cost, p_ref_type, p_ref_id, p_note, app.current_user_id())
  returning id into mid;
  return mid;
end $$;

create or replace function app.reserve_stock_internal(
  p_variant uuid, p_location uuid, p_qty numeric, p_source public.reservation_source,
  p_appointment uuid default null, p_client uuid default null, p_expires timestamptz default null, p_note text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  s public.stock_levels;
  rid uuid;
begin
  if p_qty <= 0 then perform app.fail('INVALID_QUANTITY'); end if;
  s := app.lock_stock(p_variant, p_location);
  if s.on_hand - s.reserved < p_qty then
    perform app.fail('INSUFFICIENT_STOCK', format('Disponible %s, requerido %s', s.on_hand - s.reserved, p_qty));
  end if;
  update public.stock_levels set reserved = reserved + p_qty, updated_at = now()
   where variant_id = p_variant and location_id = p_location;
  insert into public.stock_reservations (variant_id, location_id, quantity, source, appointment_id, client_id, expires_at, note, created_by)
  values (p_variant, p_location, p_qty, p_source, p_appointment, p_client, p_expires, p_note, app.current_user_id())
  returning id into rid;
  return rid;
end $$;

create or replace function app.release_reservation_internal(p_reservation uuid, p_status public.reservation_status default 'released')
returns void
language plpgsql security definer set search_path = '' as $$
declare
  r public.stock_reservations;
begin
  select * into r from public.stock_reservations where id = p_reservation for update;
  if not found or r.status <> 'active' then return; end if;   -- idempotente
  perform app.lock_stock(r.variant_id, r.location_id);
  update public.stock_levels set reserved = reserved - r.quantity, updated_at = now()
   where variant_id = r.variant_id and location_id = r.location_id;
  update public.stock_reservations set status = p_status, closed_at = now() where id = r.id;
end $$;

-- API pública (con verificación de rol) --------------------------------------

create or replace function public.reserve_stock(
  p_variant uuid, p_location uuid, p_qty numeric, p_client uuid default null, p_note text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_role('owner', 'admin', 'receptionist', 'inventory', 'sales');
  return app.reserve_stock_internal(p_variant, p_location, p_qty, 'manual', null, p_client, null, p_note);
end $$;

create or replace function public.release_reservation(p_reservation uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_role('owner', 'admin', 'receptionist', 'inventory', 'sales');
  perform app.release_reservation_internal(p_reservation, 'released');
end $$;

-- Entradas, mermas y ajustes manuales.
create or replace function public.record_stock_movement(
  p_variant uuid, p_location uuid, p_type public.movement_type, p_qty numeric,
  p_note text default null, p_unit_cost integer default null
) returns bigint
language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_role('owner', 'admin', 'inventory');
  if p_type not in ('initial', 'purchase', 'adjustment', 'waste', 'supplier_return') then
    perform app.fail('INVALID_MOVEMENT_TYPE', 'Use las funciones de venta, servicio o transferencia para este tipo');
  end if;
  if p_type in ('waste', 'supplier_return') and p_qty > 0 then p_qty := -p_qty; end if;
  if p_type in ('initial', 'purchase') and p_qty < 0 then perform app.fail('INVALID_QUANTITY'); end if;
  if p_type = 'adjustment' and coalesce(trim(p_note), '') = '' then
    perform app.fail('NOTE_REQUIRED', 'Los ajustes requieren motivo');
  end if;
  return app.apply_movement(p_variant, p_location, p_type, p_qty, 'manual', null, p_note, p_unit_cost);
end $$;

create or replace function public.transfer_stock(
  p_variant uuid, p_from uuid, p_to uuid, p_qty numeric, p_note text default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  ref text := gen_random_uuid()::text;
begin
  perform app.require_role('owner', 'admin', 'inventory');
  if p_from = p_to or p_qty <= 0 then perform app.fail('INVALID_TRANSFER'); end if;
  -- Orden determinista de bloqueo para evitar interbloqueos.
  if p_from < p_to then
    perform app.lock_stock(p_variant, p_from); perform app.lock_stock(p_variant, p_to);
  else
    perform app.lock_stock(p_variant, p_to); perform app.lock_stock(p_variant, p_from);
  end if;
  perform app.apply_movement(p_variant, p_from, 'transfer_out', -p_qty, 'transfer', ref, p_note);
  perform app.apply_movement(p_variant, p_to, 'transfer_in', p_qty, 'transfer', ref, p_note);
end $$;

-- Conteo físico: aplica diferencias como movimientos auditables.
create or replace function public.apply_stock_count(p_count uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare
  c public.stock_counts;
  l record;
  s public.stock_levels;
  n int := 0;
begin
  perform app.require_role('owner', 'admin', 'inventory');
  select * into c from public.stock_counts where id = p_count for update;
  if not found or c.status <> 'open' then perform app.fail('COUNT_NOT_OPEN'); end if;
  for l in select * from public.stock_count_lines where stock_count_id = p_count order by variant_id loop
    s := app.lock_stock(l.variant_id, c.location_id);
    if l.counted_qty < s.reserved then
      perform app.fail('COUNT_BELOW_RESERVED', format('Variante %s: contado %s < reservado %s', l.variant_id, l.counted_qty, s.reserved));
    end if;
    if l.counted_qty <> s.on_hand then
      perform app.apply_movement(l.variant_id, c.location_id, 'count_adjustment', l.counted_qty - s.on_hand,
                                 'stock_count', p_count::text, null, null, 0);
      n := n + 1;
    end if;
  end loop;
  update public.stock_counts set status = 'applied', applied_at = now() where id = p_count;
  return n;
end $$;

-- Recepción de orden de compra.
create or replace function public.receive_purchase_order_line(p_line uuid, p_qty numeric) returns void
language plpgsql security definer set search_path = '' as $$
declare
  l public.purchase_order_lines;
  po public.purchase_orders;
begin
  perform app.require_role('owner', 'admin', 'inventory');
  select * into l from public.purchase_order_lines where id = p_line for update;
  select * into po from public.purchase_orders where id = l.purchase_order_id for update;
  if po.status in ('received', 'cancelled') then perform app.fail('PO_CLOSED'); end if;
  if p_qty <= 0 or l.qty_received + p_qty > l.qty_ordered then perform app.fail('INVALID_QUANTITY'); end if;
  perform app.apply_movement(l.variant_id, po.location_id, 'purchase', p_qty, 'purchase_order', po.id::text, null, l.unit_cost_cents);
  update public.purchase_order_lines set qty_received = qty_received + p_qty where id = p_line;
  update public.purchase_orders set status = case
      when not exists (select 1 from public.purchase_order_lines where purchase_order_id = po.id and qty_received < qty_ordered)
      then 'received' else 'partial' end
   where id = po.id;
end $$;
