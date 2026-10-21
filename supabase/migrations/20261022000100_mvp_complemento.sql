-- =============================================================================
-- Complemento del MVP: reglas de comisión, gastos, cotizador configurable, corte con
-- desglose, finanzas/rentabilidad, portal de reservas (solo servidor) y endurecimientos.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Endurecimiento: solo la propietaria asigna o retira el rol de propietaria.
-- ---------------------------------------------------------------------------
create or replace function app.guard_owner_role() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Servidor (service_role) o sesión directa a la BD sin JWT (migraciones, seed, consola): confiables.
  if app.is_service_role() or app.jwt_claims() = '{}'::jsonb then return new; end if;
  if (tg_op = 'INSERT' and new.role = 'owner')
     or (tg_op = 'UPDATE' and (new.role = 'owner' or old.role = 'owner') and new.role is distinct from old.role) then
    if not app.has_role('owner') then perform app.fail('FORBIDDEN', 'Solo la propietaria puede asignar ese rol'); end if;
  end if;
  if tg_op = 'UPDATE' and old.role = 'owner' and not app.has_role('owner') then
    perform app.fail('FORBIDDEN', 'Solo la propietaria puede editar su expediente');
  end if;
  return new;
end $$;
create trigger staff_members_guard_owner before insert or update on public.staff_members
  for each row execute function app.guard_owner_role();

-- Costo por omisión en salidas: permite calcular CMV y costo de materiales por servicio.
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
  if p_unit_cost is null then
    select cost_cents into p_unit_cost from public.product_variants where id = p_variant;
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

-- ---------------------------------------------------------------------------
-- Reglas de comisión (el cálculo vive en @palace/domain/commissions)
-- ---------------------------------------------------------------------------
create table public.commission_rules (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff_members (id) on delete cascade,
  rule jsonb not null check (rule ->> 'kind' in ('percent_service', 'fixed_service', 'percent_product', 'tiered', 'goal_bonus')),
  notes text,
  is_active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index on public.commission_rules (staff_id) where is_active;
alter table public.commission_rules enable row level security;
create policy commission_rules_admin on public.commission_rules for all to authenticated
  using (app.has_role('owner', 'admin')) with check (app.has_role('owner', 'admin'));
create policy commission_rules_own on public.commission_rules for select to authenticated
  using (staff_id = app.current_staff_id());
create trigger commission_rules_audit after insert or update or delete on public.commission_rules
  for each row execute function app.audit_row();

-- ---------------------------------------------------------------------------
-- Gastos
-- ---------------------------------------------------------------------------
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations (id),
  expense_date date not null,
  category text not null,                  -- renta, nómina, servicios, insumos, marketing…
  kind text not null check (kind in ('fixed', 'variable')),
  amount_cents int not null check (amount_cents > 0),
  description text,
  supplier_id uuid references public.suppliers (id),
  payment_method text check (payment_method in ('cash', 'card', 'transfer', 'other')),
  created_by uuid,
  created_at timestamptz not null default now()
);
create index on public.expenses (expense_date);
alter table public.expenses enable row level security;
create policy expenses_admin on public.expenses for all to authenticated
  using (app.has_role('owner', 'admin')) with check (app.has_role('owner', 'admin'));
create trigger expenses_audit after insert or update or delete on public.expenses for each row execute function app.audit_row();

-- ---------------------------------------------------------------------------
-- Cotizador de extensiones configurable (valores de EJEMPLO pendientes de validar con Palace)
-- ---------------------------------------------------------------------------
alter table public.business_settings add column quote_config jsonb not null default '{
  "rangeBps": 1500,
  "gramsTable": [
    {"lengthCm": 40, "grams": {"natural": 100, "medio": 125, "abundante": 150}},
    {"lengthCm": 50, "grams": {"natural": 125, "medio": 150, "abundante": 175}},
    {"lengthCm": 60, "grams": {"natural": 150, "medio": 175, "abundante": 200}},
    {"lengthCm": 70, "grams": {"natural": 175, "medio": 200, "abundante": 250}}
  ],
  "techniques": {
    "cinta": {"label": "Cinta adhesiva", "laborCents": 150000, "suppliesCents": 30000},
    "keratina": {"label": "Keratina", "laborCents": 250000, "suppliesCents": 40000, "alwaysConsult": true},
    "microlink": {"label": "Microlink", "laborCents": 200000, "suppliesCents": 25000},
    "cosida": {"label": "Cosida (cortina)", "laborCents": 220000, "suppliesCents": 20000, "alwaysConsult": true}
  },
  "example": true
}'::jsonb;
revoke select on public.business_settings from anon;
grant select (id, display_name, brand, booking_policy, cancellation_policy, privacy_notice_version, quote_config) on public.business_settings to anon;

-- ---------------------------------------------------------------------------
-- Corte de caja con desglose por denominación
-- ---------------------------------------------------------------------------
alter table public.cash_sessions add column counted_breakdown jsonb, add column opening_breakdown jsonb;
drop function public.close_cash_session(uuid, int, text);
create function public.close_cash_session(p_session uuid, p_counted_cents int, p_notes text default null, p_breakdown jsonb default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c public.cash_sessions;
  v_expected int;
  v_from_breakdown int;
begin
  perform app.require_role('owner', 'admin', 'receptionist', 'sales');
  select * into c from public.cash_sessions where id = p_session for update;
  if not found or c.status <> 'open' then perform app.fail('CASH_SESSION_NOT_OPEN'); end if;
  if p_breakdown is not null then
    -- {"50000": 2, "20000": 1, "1000": 5} = denominación en centavos → piezas
    select coalesce(sum((k)::int * (v)::int), 0) into v_from_breakdown from jsonb_each_text(p_breakdown) as t(k, v);
    if v_from_breakdown <> p_counted_cents then perform app.fail('BREAKDOWN_MISMATCH', 'El desglose no suma el efectivo contado'); end if;
  end if;
  select c.opening_float_cents
       + coalesce((select sum(p.amount_cents + p.tip_cents) from public.sale_payments p join public.sales s on s.id = p.sale_id
                    where s.cash_session_id = c.id and p.method = 'cash' and s.status <> 'voided'), 0)
       + coalesce((select sum(d.amount_cents) from public.appointment_deposits d
                    where d.method = 'cash' and d.received_at >= c.opened_at and d.status <> 'needs_refund'), 0)
       - coalesce((select sum(r.amount_cents) from public.refunds r where r.cash_session_id = c.id and r.method = 'cash'), 0)
    into v_expected;
  update public.cash_sessions set status = 'closed', closed_at = now(), closed_by = app.current_staff_id(),
         expected_cash_cents = v_expected, counted_cash_cents = p_counted_cents, difference_cents = p_counted_cents - v_expected,
         notes = p_notes, counted_breakdown = p_breakdown
   where id = c.id;
  return jsonb_build_object('expected_cents', v_expected, 'counted_cents', p_counted_cents, 'difference_cents', p_counted_cents - v_expected);
end $$;

-- ---------------------------------------------------------------------------
-- Agenda: quitar bloqueos y notas de la cita
-- ---------------------------------------------------------------------------
create or replace function public.remove_block(p_allocation uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_role('owner', 'admin', 'receptionist');
  update public.appointment_allocations set active = false where id = p_allocation and kind = 'block';
  if not found then perform app.fail('NOT_FOUND'); end if;
end $$;

create or replace function public.update_appointment_notes(p_appointment uuid, p_notes text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_role('owner', 'admin', 'receptionist');
  update public.appointments set notes = p_notes where id = p_appointment;
end $$;

-- ---------------------------------------------------------------------------
-- Finanzas: resumen del periodo y rentabilidad por servicio (owner/admin)
-- Fechas locales de la sucursal; importes en centavos con IVA incluido.
-- ---------------------------------------------------------------------------
create or replace function public.finance_summary(p_location uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  tz text := app.location_tz(p_location);
  t0 timestamptz := (p_from::timestamp) at time zone tz;
  t1 timestamptz := ((p_to + 1)::timestamp) at time zone tz;
  r jsonb;
begin
  perform app.require_role('owner', 'admin');
  with sl as (
    select l.* from public.sale_lines l join public.sales s on s.id = l.sale_id
     where s.location_id = p_location and s.status <> 'voided' and s.created_at >= t0 and s.created_at < t1
  ), ss as (
    select * from public.sales where location_id = p_location and status <> 'voided' and created_at >= t0 and created_at < t1
  )
  select jsonb_build_object(
    'sales_count', (select count(*) from ss),
    'gross_services_cents', coalesce((select sum(round(unit_price_cents * quantity)) from sl where kind in ('service', 'package')), 0),
    'gross_products_cents', coalesce((select sum(round(unit_price_cents * quantity)) from sl where kind = 'product'), 0),
    'gift_cards_sold_cents', coalesce((select sum(total_cents) from sl where kind = 'gift_card'), 0),
    'discounts_cents', coalesce((select sum(discount_cents) from ss), 0),
    'total_sales_cents', coalesce((select sum(total_cents) from ss), 0),
    'tips_cents', coalesce((select sum(tip_cents) from ss), 0),
    'balance_due_cents', coalesce((select sum(balance_due_cents) from ss), 0),
    'refunds_cents', coalesce((select sum(r.amount_cents) from public.refunds r join public.sales s on s.id = r.sale_id
                                 where s.location_id = p_location and r.created_at >= t0 and r.created_at < t1), 0),
    'cogs_products_cents', coalesce((select sum(round(coalesce(unit_cost_cents, 0) * (quantity - refunded_qty))) from sl where kind = 'product'), 0),
    'service_materials_cents', coalesce((select sum(round(-m.quantity * coalesce(m.unit_cost_cents, 0))) from public.stock_movements m
                                          where m.location_id = p_location and m.movement_type = 'service_consumption'
                                            and m.created_at >= t0 and m.created_at < t1), 0),
    'waste_cents', coalesce((select sum(round(-m.quantity * coalesce(m.unit_cost_cents, 0))) from public.stock_movements m
                              where m.location_id = p_location and m.movement_type = 'waste' and m.created_at >= t0 and m.created_at < t1), 0),
    'deposits_received_cents', coalesce((select sum(d.amount_cents) from public.appointment_deposits d join public.appointments a on a.id = d.appointment_id
                                          where a.location_id = p_location and d.received_at >= t0 and d.received_at < t1 and d.status <> 'needs_refund'), 0),
    'expenses_fixed_cents', coalesce((select sum(amount_cents) from public.expenses where location_id = p_location and kind = 'fixed' and expense_date between p_from and p_to), 0),
    'expenses_variable_cents', coalesce((select sum(amount_cents) from public.expenses where location_id = p_location and kind = 'variable' and expense_date between p_from and p_to), 0),
    'payments_by_method', coalesce((select jsonb_object_agg(method, total) from (
        select p.method, sum(p.amount_cents) total from public.sale_payments p join ss on ss.id = p.sale_id group by p.method) x), '{}'::jsonb)
  ) into r;
  -- Utilidad: ventas netas (sin tarjetas de regalo, que son pasivo) − devoluciones − CMV − materiales − mermas − gastos.
  r := r || jsonb_build_object(
    'net_revenue_cents', (r ->> 'total_sales_cents')::bigint - (r ->> 'gift_cards_sold_cents')::bigint - (r ->> 'refunds_cents')::bigint);
  r := r || jsonb_build_object(
    'gross_profit_cents', (r ->> 'net_revenue_cents')::bigint - (r ->> 'cogs_products_cents')::bigint
                          - (r ->> 'service_materials_cents')::bigint - (r ->> 'waste_cents')::bigint);
  r := r || jsonb_build_object(
    'operating_profit_cents', (r ->> 'gross_profit_cents')::bigint - (r ->> 'expenses_fixed_cents')::bigint - (r ->> 'expenses_variable_cents')::bigint);
  return r;
end $$;

create or replace function public.service_profitability(p_location uuid, p_from date, p_to date)
returns table (service_id uuid, service_name text, services_count bigint, revenue_cents bigint,
               materials_cents bigint, configured_costs_cents bigint, margin_cents bigint, avg_minutes numeric)
language plpgsql stable security definer set search_path = '' as $$
declare
  tz text := app.location_tz(p_location);
  t0 timestamptz := (p_from::timestamp) at time zone tz;
  t1 timestamptz := ((p_to + 1)::timestamp) at time zone tz;
begin
  perform app.require_role('owner', 'admin');
  return query
  with done as (
    select x.id as line_id, x.appointment_id, x.service_id, x.price_cents, extract(epoch from x.ends_at - x.starts_at) / 60 as minutes
      from public.appointment_services x join public.appointments a on a.id = x.appointment_id
     where a.location_id = p_location and a.attendance_status = 'completed' and x.starts_at >= t0 and x.starts_at < t1
  ), appt_materials as (
    select m.reference_id::uuid as appointment_id, sum(round(-m.quantity * coalesce(m.unit_cost_cents, 0)))::bigint as cost
      from public.stock_movements m
     where m.movement_type = 'service_consumption' and m.reference_type = 'appointment'
     group by 1
  ), weights as (
    select d.*, d.price_cents::numeric / nullif(sum(d.price_cents) over (partition by d.appointment_id), 0) as w from done d
  ), revenue as (
    select l.appointment_service_id, sum(l.total_cents - l.refunded_cents)::bigint as rev
      from public.sale_lines l join public.sales s on s.id = l.sale_id
     where s.status <> 'voided' and l.appointment_service_id is not null group by 1
  )
  select w.service_id, sv.name,
         count(*)::bigint,
         coalesce(sum(coalesce(rv.rev, w.price_cents)), 0)::bigint,
         coalesce(sum(round(coalesce(am.cost, 0) * coalesce(w.w, 1))), 0)::bigint,
         (count(*) * coalesce((select sum(ci.amount_cents) from public.service_cost_items ci where ci.service_id = w.service_id), 0))::bigint,
         0::bigint,
         round(avg(w.minutes), 1)
    from weights w
    join public.services sv on sv.id = w.service_id
    left join appt_materials am on am.appointment_id = w.appointment_id
    left join revenue rv on rv.appointment_service_id = w.line_id
   group by w.service_id, sv.name;
end $$;

-- ---------------------------------------------------------------------------
-- Portal público de reservas: SOLO servidor (service_role). Crea/encuentra la clienta por
-- teléfono, registra aviso de privacidad y recordatorios, y agenda (apartado si hay anticipo).
-- p: {location_id, first_name, last_name, phone, email, accept_privacy, accept_reminders,
--     privacy_notice_version, items:[...], idempotency_key}
-- ---------------------------------------------------------------------------
create or replace function public.portal_book(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_client uuid;
  v_appt uuid;
  v_deposit int;
  v_hold int;
begin
  if not app.is_service_role() then perform app.fail('FORBIDDEN'); end if;
  if not coalesce((p ->> 'accept_privacy')::boolean, false) then perform app.fail('PRIVACY_REQUIRED'); end if;
  if coalesce(p ->> 'phone', '') !~ '^\+[1-9][0-9]{9,14}$' then perform app.fail('INVALID_PHONE'); end if;
  -- Servicios no reservables en línea se rechazan (p. ej. instalaciones que exigen valoración).
  if exists (select 1 from jsonb_array_elements(p -> 'items') it join public.services s on s.id = (it ->> 'service_id')::uuid
              where not s.online_bookable or not s.is_active) then
    perform app.fail('SERVICE_NOT_BOOKABLE_ONLINE');
  end if;

  select id into v_client from public.clients where phone = p ->> 'phone';
  if v_client is null then
    insert into public.clients (first_name, last_name, phone, email, acquisition_channel)
    values (p ->> 'first_name', nullif(p ->> 'last_name', ''), p ->> 'phone', nullif(p ->> 'email', ''), 'portal')
    returning id into v_client;
  end if;
  insert into public.client_consents (client_id, purpose, granted, source, privacy_notice_version)
  values (v_client, 'privacy_notice', true, 'portal', p ->> 'privacy_notice_version');
  insert into public.client_consents (client_id, purpose, granted, source, privacy_notice_version)
  values (v_client, 'appointment_reminders', coalesce((p ->> 'accept_reminders')::boolean, false), 'portal', p ->> 'privacy_notice_version');

  select coalesce(sum(case s.deposit_type when 'fixed' then s.deposit_value when 'percent' then s.price_cents * s.deposit_value / 10000 else 0 end), 0)
    into v_deposit
    from jsonb_array_elements(p -> 'items') it join public.services s on s.id = (it ->> 'service_id')::uuid;
  select coalesce((booking_policy ->> 'hold_minutes')::int, 15) into v_hold from public.business_settings where id = 1;

  v_appt := public.create_appointment((p ->> 'location_id')::uuid, v_client, p -> 'items',
                                      case when v_deposit > 0 then v_hold end, 'online', p ->> 'idempotency_key', false, null);
  return jsonb_build_object('appointment_id', v_appt, 'client_id', v_client, 'deposit_cents', v_deposit,
                            'status', (select booking_status from public.appointments where id = v_appt),
                            'hold_expires_at', (select hold_expires_at from public.appointments where id = v_appt));
end $$;

-- Ejecución de funciones nuevas.
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
revoke execute on all functions in schema app from public;
grant execute on function app.jwt_claims(), app.is_service_role(), app.current_user_id(), app.current_staff_id(),
  app.current_app_role(), app.has_role(public.app_role[]), app.is_staff(), app.staff_serves_client(uuid),
  app.staff_in_appointment(uuid), app.can_access_client(uuid), app.client_has_consent(uuid, public.consent_purpose)
  to authenticated, service_role;
revoke truncate on public.commission_rules, public.expenses from anon, authenticated;
