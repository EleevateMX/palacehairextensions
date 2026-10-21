-- =============================================================================
-- Punto de venta: cortes de caja, ventas combinadas (productos + servicios), pagos
-- divididos/parciales, propinas, anticipos aplicados, tarjetas de regalo, cupones,
-- devoluciones y cancelaciones. Precios con IVA incluido (16% informativo).
-- Nunca se almacenan datos de tarjeta: solo referencias del proveedor/terminal.
-- =============================================================================

create table public.cash_sessions (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations (id),
  opened_by uuid not null references public.staff_members (id),
  opened_at timestamptz not null default now(),
  opening_float_cents int not null default 0 check (opening_float_cents >= 0),
  closed_by uuid references public.staff_members (id),
  closed_at timestamptz,
  expected_cash_cents int,
  counted_cash_cents int,
  difference_cents int,
  notes text,
  status text not null default 'open' check (status in ('open', 'closed'))
);
create unique index cash_sessions_one_open on public.cash_sessions (location_id) where status = 'open';

create table public.coupons (
  id uuid primary key default gen_random_uuid(),
  code extensions.citext not null unique,
  kind text not null check (kind in ('percent', 'fixed')),
  value int not null check (value > 0),          -- puntos base o centavos
  valid_from timestamptz,
  valid_to timestamptz,
  max_uses int,
  used_count int not null default 0,
  is_active boolean not null default true
);

create table public.gift_cards (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  initial_cents int not null check (initial_cents > 0),
  balance_cents int not null check (balance_cents >= 0),
  client_id uuid references public.clients (id),
  expires_at timestamptz,
  status text not null default 'active' check (status in ('active', 'void')),
  created_at timestamptz not null default now()
);

create type public.sale_status as enum ('completed', 'voided', 'partially_refunded', 'refunded');
create type public.sale_line_kind as enum ('service', 'product', 'package', 'gift_card');
create type public.payment_method as enum ('cash', 'card', 'transfer', 'gift_card', 'deposit', 'online');

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  folio bigint generated always as identity unique,
  location_id uuid not null references public.locations (id),
  client_id uuid references public.clients (id),
  appointment_id uuid references public.appointments (id),
  cash_session_id uuid references public.cash_sessions (id),
  channel text not null default 'pos' check (channel in ('pos', 'online')),
  status public.sale_status not null default 'completed',
  subtotal_cents int not null,
  discount_cents int not null default 0,
  total_cents int not null,
  tax_cents int not null,                        -- IVA incluido (informativo)
  tip_cents int not null default 0,
  paid_cents int not null,
  balance_due_cents int not null default 0,      -- cuentas pendientes
  coupon_id uuid references public.coupons (id),
  discount_authorized_by uuid references public.staff_members (id),
  idempotency_key text unique,
  created_by uuid,
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  void_reason text,
  check (total_cents >= 0 and balance_due_cents >= 0)
);
create index on public.sales (created_at desc);
create index on public.sales (client_id);
create trigger sales_audit after insert or update on public.sales for each row execute function app.audit_row();

alter table public.appointment_deposits
  add constraint appointment_deposits_sale_fk foreign key (applied_sale_id) references public.sales (id);

create table public.sale_lines (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales (id) on delete cascade,
  kind public.sale_line_kind not null,
  variant_id uuid references public.product_variants (id),
  service_id uuid references public.services (id),
  appointment_service_id uuid references public.appointment_services (id),
  staff_id uuid references public.staff_members (id),
  description text not null,
  quantity numeric(12,3) not null check (quantity > 0),
  unit_price_cents int not null check (unit_price_cents >= 0),
  unit_cost_cents int,                            -- costo al momento de la venta (CMV)
  discount_cents int not null default 0 check (discount_cents >= 0),
  total_cents int not null check (total_cents >= 0),
  refunded_qty numeric(12,3) not null default 0,
  refunded_cents int not null default 0,
  gift_card_id uuid references public.gift_cards (id)
);
create index on public.sale_lines (sale_id);
create index on public.sale_lines (staff_id);

create table public.sale_payments (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales (id) on delete cascade,
  method public.payment_method not null,
  amount_cents int not null check (amount_cents >= 0),
  tip_cents int not null default 0 check (tip_cents >= 0),
  tip_staff_id uuid references public.staff_members (id),
  provider text,
  provider_ref text,
  gift_card_id uuid references public.gift_cards (id),
  deposit_id uuid references public.appointment_deposits (id),
  created_at timestamptz not null default now()
);
create unique index sale_payments_provider_ref_uq on public.sale_payments (provider, provider_ref) where provider_ref is not null;

create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales (id),
  sale_line_id uuid references public.sale_lines (id),
  quantity numeric(12,3),
  amount_cents int not null check (amount_cents > 0),
  method public.payment_method not null,
  restocked boolean not null default false,
  reason text not null,
  cash_session_id uuid references public.cash_sessions (id),
  created_by uuid,
  created_at timestamptz not null default now()
);
create trigger refunds_audit after insert on public.refunds for each row execute function app.audit_row();

-- ---------------------------------------------------------------------------
-- Caja
-- ---------------------------------------------------------------------------
create or replace function public.open_cash_session(p_location uuid, p_float_cents int) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  perform app.require_role('owner', 'admin', 'receptionist', 'sales');
  begin
    insert into public.cash_sessions (location_id, opened_by, opening_float_cents)
    values (p_location, app.current_staff_id(), p_float_cents) returning id into v;
  exception when unique_violation then
    perform app.fail('CASH_SESSION_ALREADY_OPEN');
  end;
  return v;
end $$;

create or replace function public.close_cash_session(p_session uuid, p_counted_cents int, p_notes text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c public.cash_sessions;
  v_expected int;
begin
  perform app.require_role('owner', 'admin', 'receptionist', 'sales');
  select * into c from public.cash_sessions where id = p_session for update;
  if not found or c.status <> 'open' then perform app.fail('CASH_SESSION_NOT_OPEN'); end if;
  select c.opening_float_cents
       + coalesce((select sum(p.amount_cents + p.tip_cents) from public.sale_payments p join public.sales s on s.id = p.sale_id
                    where s.cash_session_id = c.id and p.method = 'cash' and s.status <> 'voided'), 0)
       + coalesce((select sum(d.amount_cents) from public.appointment_deposits d
                    where d.method = 'cash' and d.received_at >= c.opened_at and d.status <> 'needs_refund'), 0)
       - coalesce((select sum(r.amount_cents) from public.refunds r where r.cash_session_id = c.id and r.method = 'cash'), 0)
    into v_expected;
  update public.cash_sessions set status = 'closed', closed_at = now(), closed_by = app.current_staff_id(),
         expected_cash_cents = v_expected, counted_cash_cents = p_counted_cents, difference_cents = p_counted_cents - v_expected, notes = p_notes
   where id = c.id;
  return jsonb_build_object('expected_cents', v_expected, 'counted_cents', p_counted_cents, 'difference_cents', p_counted_cents - v_expected);
end $$;

-- ---------------------------------------------------------------------------
-- Cobro atómico
-- p: {location_id, client_id, appointment_id, cash_session_id, idempotency_key, coupon_code, allow_balance,
--     lines: [{kind, variant_id, service_id, appointment_service_id, staff_id, quantity, unit_price_cents?, discount_cents, reservation_id}],
--     payments: [{method, amount_cents, tip_cents, tip_staff_id, provider, provider_ref, gift_card_code, deposit_id}]}
-- Precios se recalculan en el servidor; solo owner/admin pueden sobrescribir precio o dar descuento manual.
-- ---------------------------------------------------------------------------
create or replace function public.pos_checkout(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_sale uuid;
  v_loc uuid := (p ->> 'location_id')::uuid;
  v_privileged boolean := app.is_service_role() or app.has_role('owner', 'admin');
  l jsonb;
  pay jsonb;
  v_var public.product_variants;
  v_svc public.services;
  v_res public.stock_reservations;
  v_unit int;
  v_cost int;
  v_desc text;
  v_qty numeric;
  v_disc int;
  v_line_total int;
  v_subtotal int := 0;
  v_line_disc int := 0;
  v_coupon public.coupons;
  v_coupon_disc int := 0;
  v_total int;
  v_paid int := 0;
  v_tips int := 0;
  v_gc public.gift_cards;
  v_dep public.appointment_deposits;
  v_line_id uuid;
  v_existing uuid;
  v_new_gc uuid;
begin
  perform app.require_role('owner', 'admin', 'receptionist', 'sales');

  if p ->> 'idempotency_key' is not null then
    select id into v_existing from public.sales where idempotency_key = p ->> 'idempotency_key';
    if found then
      return jsonb_build_object('sale_id', v_existing, 'duplicate', true);
    end if;
  end if;
  if jsonb_array_length(coalesce(p -> 'lines', '[]')) = 0 then perform app.fail('EMPTY_CART'); end if;

  insert into public.sales (location_id, client_id, appointment_id, cash_session_id, channel, subtotal_cents, total_cents, tax_cents,
                            paid_cents, idempotency_key, created_by)
  values (v_loc, nullif(p ->> 'client_id', '')::uuid, nullif(p ->> 'appointment_id', '')::uuid, nullif(p ->> 'cash_session_id', '')::uuid,
          coalesce(p ->> 'channel', 'pos'), 0, 0, 0, 0, p ->> 'idempotency_key', app.current_user_id())
  returning id into v_sale;

  for l in select * from jsonb_array_elements(p -> 'lines') loop
    v_qty := coalesce((l ->> 'quantity')::numeric, 1);
    v_disc := coalesce((l ->> 'discount_cents')::int, 0);
    v_cost := null;
    if v_disc > 0 and not v_privileged then perform app.fail('DISCOUNT_NOT_AUTHORIZED'); end if;

    if l ->> 'kind' = 'product' then
      select * into v_var from public.product_variants where id = (l ->> 'variant_id')::uuid and is_active;
      if not found then perform app.fail('PRODUCT_NOT_FOUND'); end if;
      v_unit := case when v_var.promo_price_cents is not null and (v_var.promo_ends_at is null or v_var.promo_ends_at > now())
                     then v_var.promo_price_cents else v_var.price_cents end;
      v_cost := v_var.cost_cents;
      v_desc := v_var.name;
    elsif l ->> 'kind' in ('service', 'package') then
      select * into v_svc from public.services where id = (l ->> 'service_id')::uuid;
      if not found then perform app.fail('SERVICE_NOT_FOUND'); end if;
      v_unit := coalesce((select price_cents from public.appointment_services where id = nullif(l ->> 'appointment_service_id', '')::uuid),
                         v_svc.price_cents);
      v_desc := v_svc.name;
      -- Servicios "desde": recepción captura el precio final tras la valoración.
      if l ? 'unit_price_cents' and v_svc.price_is_from then v_unit := (l ->> 'unit_price_cents')::int; end if;
    elsif l ->> 'kind' = 'gift_card' then
      v_unit := (l ->> 'unit_price_cents')::int;
      v_desc := 'Tarjeta de regalo';
      if v_unit is null or v_unit <= 0 then perform app.fail('INVALID_AMOUNT'); end if;
    else
      perform app.fail('INVALID_LINE_KIND');
    end if;

    if l ? 'unit_price_cents' and l ->> 'kind' in ('product', 'service', 'package') and v_unit <> (l ->> 'unit_price_cents')::int then
      if not v_privileged then perform app.fail('PRICE_OVERRIDE_NOT_AUTHORIZED'); end if;
      v_unit := (l ->> 'unit_price_cents')::int;
    end if;

    v_line_total := round(v_unit * v_qty)::int - v_disc;
    if v_line_total < 0 then perform app.fail('DISCOUNT_EXCEEDS_LINE'); end if;

    insert into public.sale_lines (sale_id, kind, variant_id, service_id, appointment_service_id, staff_id, description, quantity,
                                   unit_price_cents, unit_cost_cents, discount_cents, total_cents)
    values (v_sale, (l ->> 'kind')::public.sale_line_kind, nullif(l ->> 'variant_id', '')::uuid, nullif(l ->> 'service_id', '')::uuid,
            nullif(l ->> 'appointment_service_id', '')::uuid, nullif(l ->> 'staff_id', '')::uuid, v_desc, v_qty, v_unit, v_cost, v_disc, v_line_total)
    returning id into v_line_id;

    -- Inventario: descuenta del disponible o consume una reserva propia.
    if l ->> 'kind' = 'product' then
      if l ? 'reservation_id' then
        select * into v_res from public.stock_reservations where id = (l ->> 'reservation_id')::uuid and status = 'active' for update;
        if not found or v_res.variant_id <> v_var.id then perform app.fail('RESERVATION_INVALID'); end if;
        perform app.apply_movement(v_var.id, v_loc, 'sale', -v_qty, 'sale', v_sale::text, null, v_cost, least(v_res.quantity, v_qty));
        if v_res.quantity > v_qty then
          -- libera el sobrante de la reserva
          update public.stock_levels set reserved = reserved - (v_res.quantity - v_qty) where variant_id = v_res.variant_id and location_id = v_res.location_id;
        end if;
        update public.stock_reservations set status = 'consumed', closed_at = now() where id = v_res.id;
      else
        perform app.apply_movement(v_var.id, v_loc, 'sale', -v_qty, 'sale', v_sale::text, null, v_cost);
      end if;
    elsif l ->> 'kind' = 'gift_card' then
      insert into public.gift_cards (code, initial_cents, balance_cents, client_id)
      values (upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)), v_line_total, v_line_total, nullif(p ->> 'client_id', '')::uuid)
      returning id into v_new_gc;
      update public.sale_lines set gift_card_id = v_new_gc where id = v_line_id;
    end if;

    v_subtotal := v_subtotal + round(v_unit * v_qty)::int;
    v_line_disc := v_line_disc + v_disc;
  end loop;

  -- Cupón a nivel venta.
  if coalesce(p ->> 'coupon_code', '') <> '' then
    select * into v_coupon from public.coupons where code = (p ->> 'coupon_code')::extensions.citext for update;
    if not found or not v_coupon.is_active or (v_coupon.valid_from is not null and v_coupon.valid_from > now())
       or (v_coupon.valid_to is not null and v_coupon.valid_to < now())
       or (v_coupon.max_uses is not null and v_coupon.used_count >= v_coupon.max_uses) then
      perform app.fail('COUPON_INVALID');
    end if;
    v_coupon_disc := case v_coupon.kind
      when 'percent' then ((v_subtotal - v_line_disc) * v_coupon.value / 10000)
      else least(v_coupon.value, v_subtotal - v_line_disc) end;
    update public.coupons set used_count = used_count + 1 where id = v_coupon.id;
  end if;

  v_total := v_subtotal - v_line_disc - v_coupon_disc;

  for pay in select * from jsonb_array_elements(coalesce(p -> 'payments', '[]')) loop
    v_gc := null; v_dep := null;
    if pay ->> 'method' = 'gift_card' then
      select * into v_gc from public.gift_cards where code = pay ->> 'gift_card_code' for update;
      if not found or v_gc.status <> 'active' or (v_gc.expires_at is not null and v_gc.expires_at < now()) then
        perform app.fail('GIFT_CARD_INVALID');
      end if;
      if v_gc.balance_cents < (pay ->> 'amount_cents')::int then perform app.fail('GIFT_CARD_INSUFFICIENT'); end if;
      update public.gift_cards set balance_cents = balance_cents - (pay ->> 'amount_cents')::int where id = v_gc.id;
    elsif pay ->> 'method' = 'deposit' then
      select * into v_dep from public.appointment_deposits where id = (pay ->> 'deposit_id')::uuid for update;
      if not found or v_dep.status <> 'received' then perform app.fail('DEPOSIT_NOT_AVAILABLE'); end if;
      if (pay ->> 'amount_cents')::int <> v_dep.amount_cents then perform app.fail('DEPOSIT_AMOUNT_MISMATCH'); end if;
      update public.appointment_deposits set status = 'applied', applied_sale_id = v_sale where id = v_dep.id;
    end if;
    begin
      insert into public.sale_payments (sale_id, method, amount_cents, tip_cents, tip_staff_id, provider, provider_ref, gift_card_id, deposit_id)
      values (v_sale, (pay ->> 'method')::public.payment_method, (pay ->> 'amount_cents')::int, coalesce((pay ->> 'tip_cents')::int, 0),
              nullif(pay ->> 'tip_staff_id', '')::uuid, pay ->> 'provider', pay ->> 'provider_ref', v_gc.id, v_dep.id);
    exception when unique_violation then
      perform app.fail('DUPLICATE_PAYMENT', 'La referencia de pago ya fue registrada');
    end;
    v_paid := v_paid + (pay ->> 'amount_cents')::int;
    v_tips := v_tips + coalesce((pay ->> 'tip_cents')::int, 0);
  end loop;

  if v_paid > v_total then perform app.fail('OVERPAYMENT'); end if;
  if v_paid < v_total and not coalesce((p ->> 'allow_balance')::boolean, false) then perform app.fail('PAYMENT_INCOMPLETE'); end if;
  if v_paid < v_total and nullif(p ->> 'client_id', '') is null then perform app.fail('CLIENT_REQUIRED_FOR_BALANCE'); end if;

  update public.sales set subtotal_cents = v_subtotal, discount_cents = v_line_disc + v_coupon_disc, total_cents = v_total,
         tax_cents = v_total - round(v_total / 1.16)::int, tip_cents = v_tips, paid_cents = v_paid,
         balance_due_cents = v_total - v_paid, coupon_id = v_coupon.id
   where id = v_sale;

  if nullif(p ->> 'appointment_id', '') is not null and v_paid = v_total then
    update public.appointments set payment_status = 'paid' where id = (p ->> 'appointment_id')::uuid;
  end if;

  return jsonb_build_object('sale_id', v_sale, 'total_cents', v_total, 'paid_cents', v_paid, 'balance_due_cents', v_total - v_paid);
exception
  when unique_violation then
    -- Carrera con la misma llave de idempotencia.
    select id into v_existing from public.sales where idempotency_key = p ->> 'idempotency_key';
    if found then return jsonb_build_object('sale_id', v_existing, 'duplicate', true); end if;
    raise;
end $$;

-- Abono a cuenta pendiente.
create or replace function public.pay_sale_balance(p_sale uuid, p_method public.payment_method, p_amount int, p_provider_ref text default null) returns int
language plpgsql security definer set search_path = '' as $$
declare s public.sales;
begin
  perform app.require_role('owner', 'admin', 'receptionist', 'sales');
  if p_method in ('gift_card', 'deposit') then perform app.fail('UNSUPPORTED_METHOD'); end if;
  select * into s from public.sales where id = p_sale for update;
  if s.status = 'voided' or p_amount <= 0 or p_amount > s.balance_due_cents then perform app.fail('INVALID_AMOUNT'); end if;
  insert into public.sale_payments (sale_id, method, amount_cents, provider, provider_ref)
  values (s.id, p_method, p_amount, case when p_provider_ref is not null then 'terminal' end, p_provider_ref);
  update public.sales set paid_cents = paid_cents + p_amount, balance_due_cents = balance_due_cents - p_amount where id = s.id;
  return s.balance_due_cents - p_amount;
end $$;

-- ---------------------------------------------------------------------------
-- Devolución parcial o total de una línea
-- ---------------------------------------------------------------------------
create or replace function public.refund_sale_line(
  p_line uuid, p_qty numeric, p_restock boolean, p_reason text, p_method public.payment_method, p_cash_session uuid default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  l public.sale_lines;
  s public.sales;
  v_amount int;
begin
  perform app.require_role('owner', 'admin');
  if coalesce(trim(p_reason), '') = '' then perform app.fail('REASON_REQUIRED'); end if;
  select * into l from public.sale_lines where id = p_line for update;
  if not found then perform app.fail('NOT_FOUND'); end if;
  select * into s from public.sales where id = l.sale_id for update;
  if s.status = 'voided' then perform app.fail('SALE_VOIDED'); end if;
  if p_qty <= 0 or l.refunded_qty + p_qty > l.quantity then perform app.fail('INVALID_QUANTITY'); end if;
  -- Último reembolso de la línea toma el remanente exacto (evita centavos perdidos por redondeo).
  v_amount := case when l.refunded_qty + p_qty = l.quantity then l.total_cents - l.refunded_cents
                   else round(l.total_cents * p_qty / l.quantity)::int end;
  if v_amount <= 0 then perform app.fail('NOTHING_TO_REFUND'); end if;

  insert into public.refunds (sale_id, sale_line_id, quantity, amount_cents, method, restocked, reason, cash_session_id, created_by)
  values (s.id, l.id, p_qty, v_amount, p_method, p_restock and l.kind = 'product', p_reason, p_cash_session, app.current_user_id());
  if p_restock and l.kind = 'product' then
    perform app.apply_movement(l.variant_id, s.location_id, 'customer_return', p_qty, 'refund', s.id::text, p_reason, l.unit_cost_cents);
  end if;
  update public.sale_lines set refunded_qty = refunded_qty + p_qty, refunded_cents = refunded_cents + v_amount where id = l.id;
  update public.sales set status = case
      when not exists (select 1 from public.sale_lines where sale_id = s.id and refunded_qty < quantity) then 'refunded'
      else 'partially_refunded' end::public.sale_status
   where id = s.id;
  return jsonb_build_object('refund_cents', v_amount);
end $$;

-- Cancelación completa (mismo día, sin devoluciones previas): revierte inventario, tarjetas y anticipos.
create or replace function public.void_sale(p_sale uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  s public.sales;
  l record;
  py record;
begin
  perform app.require_role('owner', 'admin');
  select * into s from public.sales where id = p_sale for update;
  if not found or s.status <> 'completed' then perform app.fail('SALE_NOT_VOIDABLE'); end if;
  if exists (select 1 from public.sale_lines where sale_id = s.id and refunded_qty > 0) then perform app.fail('SALE_HAS_REFUNDS'); end if;
  for l in select * from public.sale_lines where sale_id = s.id and kind = 'product' loop
    perform app.apply_movement(l.variant_id, s.location_id, 'customer_return', l.quantity, 'void', s.id::text, p_reason, l.unit_cost_cents);
  end loop;
  if exists (select 1 from public.sale_lines sl join public.gift_cards g on g.id = sl.gift_card_id
              where sl.sale_id = s.id and g.balance_cents < g.initial_cents) then
    perform app.fail('GIFT_CARD_ALREADY_USED');
  end if;
  update public.gift_cards set status = 'void' where id in (select gift_card_id from public.sale_lines where sale_id = s.id and gift_card_id is not null);
  for py in select * from public.sale_payments where sale_id = s.id loop
    if py.gift_card_id is not null then
      update public.gift_cards set balance_cents = balance_cents + py.amount_cents where id = py.gift_card_id;
    end if;
    if py.deposit_id is not null then
      update public.appointment_deposits set status = 'received', applied_sale_id = null where id = py.deposit_id;
    end if;
  end loop;
  update public.sales set status = 'voided', voided_at = now(), void_reason = p_reason where id = s.id;
end $$;

-- Base auditable para comisiones (el cálculo de reglas vive en @palace/domain).
-- Vista con privilegios del propietario: cada estilista ve solo SUS líneas; owner/admin ven todo.
create view public.v_commissionable_lines as
select sl.id as line_id, s.id as sale_id, s.created_at, s.location_id, sl.kind, sl.staff_id, sl.service_id,
       sl.quantity, sl.unit_price_cents * sl.quantity as gross_cents, sl.discount_cents, sl.refunded_cents,
       -- Prorrateo del cupón a nivel venta.
       case when s.subtotal_cents - (select coalesce(sum(x.discount_cents), 0) from public.sale_lines x where x.sale_id = s.id) > 0
            then round((s.discount_cents - (select coalesce(sum(x.discount_cents), 0) from public.sale_lines x where x.sale_id = s.id))::numeric
                       * sl.total_cents / (s.subtotal_cents - (select coalesce(sum(x.discount_cents), 0) from public.sale_lines x where x.sale_id = s.id)))
            else 0 end::int as coupon_share_cents
from public.sale_lines sl join public.sales s on s.id = sl.sale_id
where s.status <> 'voided'
  and (app.has_role('owner', 'admin') or sl.staff_id = app.current_staff_id());
