-- =============================================================================
-- Punto de venta (UI): caja vigente compartida, resumen del corte, abonos ligados a la
-- caja donde se cobran y apertura con desglose por denominación.
--
-- Cambios:
--   · sale_payments.cash_session_id: el abono a una cuenta pendiente cuenta en la caja
--     donde se recibió (antes contaba en la caja original de la venta, quizá ya cerrada).
--   · app.cash_expected(): un solo cálculo del efectivo esperado para el resumen y el corte.
--     Los anticipos en efectivo se limitan a la sucursal y a la ventana de la caja.
--   · open_cash_session(p_location, p_float_cents, p_breakdown): desglose opcional.
--   · pay_sale_balance(..., p_cash_session): registra la caja del abono.
--   · current_cash_session(): caja abierta de la sucursal aunque la haya abierto otra
--     persona (RLS de cash_sessions solo deja ver las propias a recepción).
--   · cash_session_summary(): ventas por método y efectivo esperado hasta el momento.
-- =============================================================================

alter table public.sale_payments add column cash_session_id uuid references public.cash_sessions (id);
create index on public.sale_payments (cash_session_id) where cash_session_id is not null;

-- Valida un desglose {"<denominación en centavos>": piezas} y devuelve su suma en centavos.
create function app.breakdown_total(p_breakdown jsonb) returns bigint
language plpgsql immutable set search_path = '' as $$
declare v_total bigint;
begin
  if p_breakdown is null then return null; end if;
  if jsonb_typeof(p_breakdown) <> 'object'
     or exists (select 1 from jsonb_each_text(p_breakdown) t(k, v) where k !~ '^[1-9][0-9]{0,6}$' or v !~ '^[0-9]{1,6}$') then
    perform app.fail('BREAKDOWN_INVALID');
  end if;
  select coalesce(sum(k::bigint * v::bigint), 0) into v_total from jsonb_each_text(p_breakdown) t(k, v);
  return v_total;
end $$;

-- Efectivo esperado en caja: fondo + cobros en efectivo (con propinas) + anticipos en efectivo
-- recibidos en la sucursal durante la caja − devoluciones en efectivo de la caja.
create function app.cash_expected(p_session uuid) returns int
language sql stable security definer set search_path = '' as $$
  select c.opening_float_cents
       + coalesce((select sum(p.amount_cents + p.tip_cents)::int from public.sale_payments p join public.sales s on s.id = p.sale_id
                    where coalesce(p.cash_session_id, s.cash_session_id) = c.id and p.method = 'cash' and s.status <> 'voided'), 0)
       + coalesce((select sum(d.amount_cents)::int from public.appointment_deposits d join public.appointments a on a.id = d.appointment_id
                    where a.location_id = c.location_id and d.method = 'cash' and d.status <> 'needs_refund'
                      and d.received_at >= c.opened_at and (c.closed_at is null or d.received_at < c.closed_at)), 0)
       - coalesce((select sum(r.amount_cents)::int from public.refunds r where r.cash_session_id = c.id and r.method = 'cash'), 0)
    from public.cash_sessions c where c.id = p_session
$$;

drop function public.open_cash_session(uuid, int);
create function public.open_cash_session(p_location uuid, p_float_cents int, p_breakdown jsonb default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  perform app.require_role('owner', 'admin', 'receptionist', 'sales');
  if p_float_cents is null or p_float_cents < 0 then perform app.fail('INVALID_AMOUNT'); end if;
  if p_breakdown is not null and app.breakdown_total(p_breakdown) <> p_float_cents then
    perform app.fail('BREAKDOWN_MISMATCH', 'El desglose no suma el fondo inicial');
  end if;
  begin
    insert into public.cash_sessions (location_id, opened_by, opening_float_cents, opening_breakdown)
    values (p_location, app.current_staff_id(), p_float_cents, p_breakdown) returning id into v;
  exception when unique_violation then
    perform app.fail('CASH_SESSION_ALREADY_OPEN');
  end;
  return v;
end $$;

-- Misma firma que la versión anterior: se reemplaza.
create or replace function public.close_cash_session(p_session uuid, p_counted_cents int, p_notes text default null, p_breakdown jsonb default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c public.cash_sessions;
  v_expected int;
begin
  perform app.require_role('owner', 'admin', 'receptionist', 'sales');
  select * into c from public.cash_sessions where id = p_session for update;
  if not found or c.status <> 'open' then perform app.fail('CASH_SESSION_NOT_OPEN'); end if;
  if p_counted_cents is null or p_counted_cents < 0 then perform app.fail('INVALID_AMOUNT'); end if;
  if p_breakdown is not null and app.breakdown_total(p_breakdown) <> p_counted_cents then
    perform app.fail('BREAKDOWN_MISMATCH', 'El desglose no suma el efectivo contado');
  end if;
  v_expected := app.cash_expected(c.id);
  update public.cash_sessions set status = 'closed', closed_at = now(), closed_by = app.current_staff_id(),
         expected_cash_cents = v_expected, counted_cash_cents = p_counted_cents, difference_cents = p_counted_cents - v_expected,
         notes = p_notes, counted_breakdown = p_breakdown
   where id = c.id;
  return jsonb_build_object('expected_cents', v_expected, 'counted_cents', p_counted_cents, 'difference_cents', p_counted_cents - v_expected);
end $$;

drop function public.pay_sale_balance(uuid, public.payment_method, int, text);
create function public.pay_sale_balance(
  p_sale uuid, p_method public.payment_method, p_amount int, p_provider_ref text default null, p_cash_session uuid default null
) returns int
language plpgsql security definer set search_path = '' as $$
declare s public.sales;
begin
  perform app.require_role('owner', 'admin', 'receptionist', 'sales');
  if p_method in ('gift_card', 'deposit') then perform app.fail('UNSUPPORTED_METHOD'); end if;
  select * into s from public.sales where id = p_sale for update;
  if not found then perform app.fail('NOT_FOUND'); end if;
  if s.status = 'voided' then perform app.fail('SALE_VOIDED'); end if;
  if p_amount is null or p_amount <= 0 or p_amount > s.balance_due_cents then perform app.fail('INVALID_AMOUNT'); end if;
  if p_cash_session is not null and not exists (
    select 1 from public.cash_sessions where id = p_cash_session and status = 'open' and location_id = s.location_id) then
    perform app.fail('CASH_SESSION_NOT_OPEN');
  end if;
  begin
    insert into public.sale_payments (sale_id, method, amount_cents, provider, provider_ref, cash_session_id)
    values (s.id, p_method, p_amount, case when nullif(p_provider_ref, '') is not null then 'terminal' end, nullif(p_provider_ref, ''), p_cash_session);
  exception when unique_violation then
    perform app.fail('DUPLICATE_PAYMENT', 'La referencia de pago ya fue registrada');
  end;
  update public.sales set paid_cents = paid_cents + p_amount, balance_due_cents = balance_due_cents - p_amount where id = s.id;
  if s.appointment_id is not null and s.balance_due_cents - p_amount = 0 then
    update public.appointments set payment_status = 'paid' where id = s.appointment_id;
  end if;
  return s.balance_due_cents - p_amount;
end $$;

-- Caja abierta de la sucursal (o null). Visible para quien cobra aunque la abriera otra persona.
create function public.current_cash_session(p_location uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare r jsonb;
begin
  perform app.require_role('owner', 'admin', 'receptionist', 'sales');
  select jsonb_build_object('id', c.id, 'opened_at', c.opened_at, 'opening_float_cents', c.opening_float_cents,
                            'opened_by', c.opened_by, 'opened_by_name', m.display_name)
    into r
    from public.cash_sessions c join public.staff_members m on m.id = c.opened_by
   where c.location_id = p_location and c.status = 'open';
  return r;
end $$;

-- Resumen de una caja: cobros por método, anticipos y devoluciones en efectivo, esperado.
-- Caja abierta: cualquier persona que cobra. Cerrada: owner/admin o quien la abrió/cerró.
create function public.cash_session_summary(p_session uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  c public.cash_sessions;
  r jsonb;
begin
  perform app.require_role('owner', 'admin', 'receptionist', 'sales');
  select * into c from public.cash_sessions where id = p_session;
  if not found then perform app.fail('NOT_FOUND'); end if;
  if not (c.status = 'open' or app.has_role('owner', 'admin')
          or c.opened_by = app.current_staff_id() or c.closed_by = app.current_staff_id()) then
    perform app.fail('FORBIDDEN');
  end if;
  select jsonb_build_object(
    'id', c.id, 'status', c.status, 'location_id', c.location_id,
    'opened_at', c.opened_at, 'closed_at', c.closed_at,
    'opened_by_name', (select display_name from public.staff_members where id = c.opened_by),
    'closed_by_name', (select display_name from public.staff_members where id = c.closed_by),
    'opening_float_cents', c.opening_float_cents,
    'opening_breakdown', c.opening_breakdown,
    'counted_breakdown', c.counted_breakdown,
    'sales_count', (select count(*) from public.sales s where s.cash_session_id = c.id and s.status <> 'voided'),
    'voided_count', (select count(*) from public.sales s where s.cash_session_id = c.id and s.status = 'voided'),
    'by_method', coalesce((
        select jsonb_object_agg(x.method, jsonb_build_object('amount_cents', x.amount, 'tip_cents', x.tips, 'count', x.n))
          from (select p.method, sum(p.amount_cents)::int amount, sum(p.tip_cents)::int tips, count(*) n
                  from public.sale_payments p join public.sales s on s.id = p.sale_id
                 where coalesce(p.cash_session_id, s.cash_session_id) = c.id and s.status <> 'voided'
                 group by p.method) x), '{}'::jsonb),
    'cash_deposits_cents', coalesce((select sum(d.amount_cents)::int from public.appointment_deposits d join public.appointments a on a.id = d.appointment_id
                                      where a.location_id = c.location_id and d.method = 'cash' and d.status <> 'needs_refund'
                                        and d.received_at >= c.opened_at and (c.closed_at is null or d.received_at < c.closed_at)), 0),
    'cash_refunds_cents', coalesce((select sum(r.amount_cents)::int from public.refunds r where r.cash_session_id = c.id and r.method = 'cash'), 0),
    'expected_cash_cents', coalesce(c.expected_cash_cents, app.cash_expected(c.id)),
    'counted_cash_cents', c.counted_cash_cents,
    'difference_cents', c.difference_cents,
    'notes', c.notes
  ) into r;
  return r;
end $$;

-- Ejecución: solo personal autenticado (las funciones validan rol con app.require_role).
revoke execute on function public.open_cash_session(uuid, int, jsonb), public.close_cash_session(uuid, int, text, jsonb),
  public.pay_sale_balance(uuid, public.payment_method, int, text, uuid), public.current_cash_session(uuid),
  public.cash_session_summary(uuid) from public, anon;
grant execute on function public.open_cash_session(uuid, int, jsonb), public.close_cash_session(uuid, int, text, jsonb),
  public.pay_sale_balance(uuid, public.payment_method, int, text, uuid), public.current_cash_session(uuid),
  public.cash_session_summary(uuid) to authenticated, service_role;
revoke execute on function app.breakdown_total(jsonb), app.cash_expected(uuid) from public;

-- ---------------------------------------------------------------------------
-- Corrección: con search_path = '' el operador "=" de citext (esquema extensions) no se
-- resuelve y la comparación cae a texto, así que el cupón distinguía mayúsculas.
-- Parche quirúrgico de pos_checkout: el ancla debe aparecer exactamente una vez.
-- ---------------------------------------------------------------------------
do $$
declare
  d text := pg_get_functiondef('public.pos_checkout(jsonb)'::regprocedure);
  anchor text := 'where code = (p ->> ''coupon_code'')::extensions.citext';
  n int;
begin
  n := (length(d) - length(replace(d, anchor, ''))) / length(anchor);
  if n <> 1 then raise exception 'pos_checkout: ancla del cupón encontrada % veces (se esperaba 1)', n; end if;
  execute replace(d, anchor, 'where code operator(extensions.=) (p ->> ''coupon_code'')::extensions.citext');
end $$;
