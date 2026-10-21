-- =============================================================================
-- Reportes operativos: ventas por día y método, artículos más vendidos, ocupación y
-- productividad por estilista, cancelaciones/no-show, clientas nuevas vs recurrentes y
-- propinas. Sin tablas nuevas: solo funciones de lectura.
--
-- Fechas locales de la sucursal (locations.timezone); importes en centavos con IVA incluido.
-- Todas validan rol (owner/admin) salvo:
--   * report_occupancy: minutos sin datos de clienta → todo el personal (matriz de docs/06).
--   * report_booking_kpis: solo conteos → también recepción.
--   * report_tips_by_staff: owner/admin ven todo; el resto, únicamente sus propias propinas.
-- =============================================================================

-- Valida el rango y lo convierte a instantes [t0, t1) de la zona de la sucursal.
create or replace function app.report_window(p_location uuid, p_from date, p_to date, out t0 timestamptz, out t1 timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare
  tz text := app.location_tz(p_location);
begin
  if tz is null then perform app.fail('NOT_FOUND', 'Sucursal no encontrada'); end if;
  if p_from is null or p_to is null or p_from > p_to or p_to - p_from > 366 then
    perform app.fail('INVALID_RANGE', 'El periodo debe ser válido y de máximo un año');
  end if;
  t0 := (p_from::timestamp) at time zone tz;
  t1 := ((p_to + 1)::timestamp) at time zone tz;
end $$;

-- Ocupación por estilista reservable: minutos de turno, no disponibles (ausencias/bloqueos)
-- y reservados (citas confirmadas o apartados vigentes), todo recortado al turno.
-- Ocupación % = reservados / (turno − no disponibles).
create or replace function app.staff_occupancy(p_location uuid, p_from date, p_to date)
returns table (staff_id uuid, display_name text, scheduled_minutes bigint, unavailable_minutes bigint, booked_minutes bigint)
language sql stable security definer set search_path = '' as $$
  with tz as (
    select app.location_tz(p_location) as tz
  ), days as (
    select d::date as day from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') d
  ), sched as (
    select s.staff_id,
           tstzrange((dd.day + s.starts_at) at time zone tz.tz, (dd.day + s.ends_at) at time zone tz.tz, '[)')
           * coalesce(case when sd.id is not null and not sd.is_closed
                           then tstzrange((dd.day + sd.opens_at) at time zone tz.tz, (dd.day + sd.closes_at) at time zone tz.tz, '[)') end,
                      '(,)'::tstzrange) as r
      from days dd
      cross join tz
      join public.staff_schedules s on s.location_id = p_location and s.weekday = extract(dow from dd.day)
      left join public.special_days sd on sd.location_id = p_location and sd.day = dd.day
     where not coalesce(sd.is_closed, false)
  ), per_block as (
    select sc.staff_id,
           extract(epoch from upper(sc.r) - lower(sc.r)) as sched_s,
           coalesce((select sum(extract(epoch from upper(sc.r * al.occupied) - lower(sc.r * al.occupied)))
                       from public.appointment_allocations al
                      where al.staff_id = sc.staff_id and al.active and al.kind in ('time_off', 'block') and al.occupied && sc.r), 0) as unavailable_s,
           coalesce((select sum(extract(epoch from upper(sc.r * al.occupied) - lower(sc.r * al.occupied)))
                       from public.appointment_allocations al
                       join public.appointments a on a.id = al.appointment_id
                      where al.staff_id = sc.staff_id and al.active and al.kind = 'appointment' and al.occupied && sc.r
                        and (a.booking_status = 'confirmed' or (a.booking_status = 'hold' and a.hold_expires_at > now()))), 0) as booked_s
      from sched sc
     where not isempty(sc.r)
  ), agg as (
    select pb.staff_id, sum(pb.sched_s) as sched_s, sum(pb.unavailable_s) as unavailable_s, sum(pb.booked_s) as booked_s
      from per_block pb group by pb.staff_id
  )
  select m.id, m.display_name,
         round(coalesce(g.sched_s, 0) / 60)::bigint,
         round(coalesce(g.unavailable_s, 0) / 60)::bigint,
         round(coalesce(g.booked_s, 0) / 60)::bigint
    from public.staff_members m
    left join agg g on g.staff_id = m.id
   where m.is_active and m.is_bookable and (m.location_id = p_location or m.location_id is null)
   order by m.display_name;
$$;

create or replace function public.report_occupancy(p_location uuid, p_from date, p_to date)
returns table (staff_id uuid, display_name text, scheduled_minutes bigint, unavailable_minutes bigint, booked_minutes bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.require_role('owner', 'admin', 'receptionist', 'stylist', 'inventory', 'sales');
  perform app.report_window(p_location, p_from, p_to);
  return query select * from app.staff_occupancy(p_location, p_from, p_to);
end $$;

-- Productividad: citas completadas, servicios realizados, ingresos netos por estilista y ocupación.
create or replace function public.report_staff_productivity(p_location uuid, p_from date, p_to date)
returns table (staff_id uuid, display_name text, completed_appointments bigint, services_count bigint,
               services_revenue_cents bigint, products_revenue_cents bigint,
               scheduled_minutes bigint, unavailable_minutes bigint, booked_minutes bigint)
language plpgsql stable security definer set search_path = '' as $$
declare
  w record;
begin
  perform app.require_role('owner', 'admin');
  w := app.report_window(p_location, p_from, p_to);
  return query
  with done as (
    select x.staff_id, count(distinct x.appointment_id)::bigint as appts, count(*)::bigint as lines
      from public.appointment_services x join public.appointments a on a.id = x.appointment_id
     where a.location_id = p_location and a.attendance_status = 'completed' and a.booking_status = 'confirmed'
       and x.starts_at >= w.t0 and x.starts_at < w.t1 and x.staff_id is not null
     group by x.staff_id
  ), rev as (
    select l.staff_id,
           sum(l.total_cents - l.refunded_cents) filter (where l.kind in ('service', 'package'))::bigint as svc,
           sum(l.total_cents - l.refunded_cents) filter (where l.kind = 'product')::bigint as prod
      from public.sale_lines l join public.sales s on s.id = l.sale_id
     where s.location_id = p_location and s.status <> 'voided' and s.created_at >= w.t0 and s.created_at < w.t1
       and l.staff_id is not null
     group by l.staff_id
  )
  select o.staff_id, o.display_name,
         coalesce(d.appts, 0), coalesce(d.lines, 0), coalesce(r.svc, 0), coalesce(r.prod, 0),
         o.scheduled_minutes, o.unavailable_minutes, o.booked_minutes
    from app.staff_occupancy(p_location, p_from, p_to) o
    left join done d on d.staff_id = o.staff_id
    left join rev r on r.staff_id = o.staff_id;
end $$;

-- Ventas por día local y por método de pago (por fecha de la venta, como finance_summary).
create or replace function public.report_sales_daily(p_location uuid, p_from date, p_to date)
returns table (day date, sales_count bigint, total_cents bigint, discounts_cents bigint, tips_cents bigint, refunds_cents bigint,
               cash_cents bigint, card_cents bigint, transfer_cents bigint, gift_card_cents bigint, deposit_cents bigint, online_cents bigint)
language plpgsql stable security definer set search_path = '' as $$
declare
  w record;
  tz text := app.location_tz(p_location);
begin
  perform app.require_role('owner', 'admin');
  w := app.report_window(p_location, p_from, p_to);
  return query
  with ss as (
    select s.*, (s.created_at at time zone tz)::date as d from public.sales s
     where s.location_id = p_location and s.status <> 'voided' and s.created_at >= w.t0 and s.created_at < w.t1
  ), pays as (
    select ss.d, p.method, sum(p.amount_cents)::bigint as amt from public.sale_payments p join ss on ss.id = p.sale_id group by 1, 2
  ), refs as (
    select (r.created_at at time zone tz)::date as d, sum(r.amount_cents)::bigint as amt
      from public.refunds r join public.sales s on s.id = r.sale_id
     where s.location_id = p_location and r.created_at >= w.t0 and r.created_at < w.t1 group by 1
  ), days as (
    select g::date as d from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') g
  )
  select dd.d,
         (select count(*) from ss where ss.d = dd.d)::bigint,
         coalesce((select sum(ss.total_cents) from ss where ss.d = dd.d), 0)::bigint,
         coalesce((select sum(ss.discount_cents) from ss where ss.d = dd.d), 0)::bigint,
         coalesce((select sum(ss.tip_cents) from ss where ss.d = dd.d), 0)::bigint,
         coalesce((select rf.amt from refs rf where rf.d = dd.d), 0)::bigint,
         coalesce((select pa.amt from pays pa where pa.d = dd.d and pa.method = 'cash'), 0)::bigint,
         coalesce((select pa.amt from pays pa where pa.d = dd.d and pa.method = 'card'), 0)::bigint,
         coalesce((select pa.amt from pays pa where pa.d = dd.d and pa.method = 'transfer'), 0)::bigint,
         coalesce((select pa.amt from pays pa where pa.d = dd.d and pa.method = 'gift_card'), 0)::bigint,
         coalesce((select pa.amt from pays pa where pa.d = dd.d and pa.method = 'deposit'), 0)::bigint,
         coalesce((select pa.amt from pays pa where pa.d = dd.d and pa.method = 'online'), 0)::bigint
    from days dd
   order by dd.d;
end $$;

-- Servicios y productos más vendidos (importe neto de descuentos y devoluciones).
create or replace function public.report_top_items(p_location uuid, p_from date, p_to date)
returns table (kind text, item_id uuid, name text, quantity numeric, sales_count bigint, net_cents bigint)
language plpgsql stable security definer set search_path = '' as $$
declare
  w record;
begin
  perform app.require_role('owner', 'admin');
  w := app.report_window(p_location, p_from, p_to);
  return query
  select case when l.kind = 'product' then 'product' else 'service' end,
         coalesce(l.service_id, l.variant_id),
         coalesce(sv.name, pv.name, min(l.description)),
         sum(l.quantity - l.refunded_qty),
         count(distinct l.sale_id)::bigint,
         sum(l.total_cents - l.refunded_cents)::bigint
    from public.sale_lines l
    join public.sales s on s.id = l.sale_id
    left join public.services sv on sv.id = l.service_id
    left join public.product_variants pv on pv.id = l.variant_id
   where s.location_id = p_location and s.status <> 'voided' and s.created_at >= w.t0 and s.created_at < w.t1
     and l.kind in ('service', 'package', 'product')
   group by 1, 2, sv.name, pv.name
   order by 6 desc;
end $$;

-- Cancelaciones, no-show y clientas nuevas vs recurrentes (solo conteos, sin datos personales).
-- Base de cancelación: citas del periodo confirmadas o canceladas (sin reprogramaciones ni apartados vencidos).
-- Base de no-show: citas con asistencia resuelta (completada o no-show).
-- Clienta atendida = cita completada o compra en el periodo; es nueva si su primera atención cae en el periodo.
create or replace function public.report_booking_kpis(p_location uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  w record;
  r jsonb;
begin
  perform app.require_role('owner', 'admin', 'receptionist');
  w := app.report_window(p_location, p_from, p_to);
  with ap as (
    select a.booking_status, a.attendance_status from public.appointments a
     where a.location_id = p_location and a.starts_at >= w.t0 and a.starts_at < w.t1
       and a.booking_status in ('confirmed', 'cancelled') and coalesce(a.cancel_reason, '') <> 'rescheduled'
  ), c as (
    select count(*) as total,
           count(*) filter (where booking_status = 'cancelled') as cancelled,
           count(*) filter (where booking_status = 'confirmed' and attendance_status = 'completed') as completed,
           count(*) filter (where booking_status = 'confirmed' and attendance_status = 'no_show') as no_show
      from ap
  ), activity as (
    select a.client_id, a.starts_at as at from public.appointments a
     where a.client_id is not null and a.location_id = p_location and a.booking_status = 'confirmed' and a.attendance_status = 'completed'
    union all
    select s.client_id, s.created_at from public.sales s
     where s.client_id is not null and s.location_id = p_location and s.status <> 'voided'
  ), firsts as (
    select client_id, min(at) as first_at, bool_or(at >= w.t0 and at < w.t1) as in_range from activity group by client_id
  )
  select jsonb_build_object(
    'appointments_total', c.total,
    'cancelled', c.cancelled,
    'completed', c.completed,
    'no_show', c.no_show,
    'cancellation_rate_pct', case when c.total > 0 then round(100.0 * c.cancelled / c.total, 1) end,
    'no_show_rate_pct', case when c.completed + c.no_show > 0 then round(100.0 * c.no_show / (c.completed + c.no_show), 1) end,
    'clients_new', (select count(*) from firsts f where f.in_range and f.first_at >= w.t0),
    'clients_returning', (select count(*) from firsts f where f.in_range and f.first_at < w.t0)
  ) into r from c;
  return r;
end $$;

-- Propinas por persona (se reportan aparte de la comisión, al 100% para quien atendió).
create or replace function public.report_tips_by_staff(p_location uuid, p_from date, p_to date)
returns table (staff_id uuid, tips_cents bigint)
language plpgsql stable security definer set search_path = '' as $$
declare
  w record;
  v_all boolean := app.is_service_role() or app.has_role('owner', 'admin');
  v_me uuid := app.current_staff_id();
begin
  if not v_all and v_me is null then perform app.fail('FORBIDDEN'); end if;
  w := app.report_window(p_location, p_from, p_to);
  return query
  select p.tip_staff_id, sum(p.tip_cents)::bigint
    from public.sale_payments p join public.sales s on s.id = p.sale_id
   where s.location_id = p_location and s.status <> 'voided' and s.created_at >= w.t0 and s.created_at < w.t1
     and p.tip_cents > 0 and (v_all or p.tip_staff_id = v_me)
   group by p.tip_staff_id;
end $$;

-- Ejecución: nunca para anon; funciones internas solo vía las públicas.
revoke execute on function app.report_window(uuid, date, date), app.staff_occupancy(uuid, date, date) from public;
revoke execute on function
  public.report_occupancy(uuid, date, date),
  public.report_staff_productivity(uuid, date, date),
  public.report_sales_daily(uuid, date, date),
  public.report_top_items(uuid, date, date),
  public.report_booking_kpis(uuid, date, date),
  public.report_tips_by_staff(uuid, date, date)
  from public, anon;
grant execute on function
  public.report_occupancy(uuid, date, date),
  public.report_staff_productivity(uuid, date, date),
  public.report_sales_daily(uuid, date, date),
  public.report_top_items(uuid, date, date),
  public.report_booking_kpis(uuid, date, date),
  public.report_tips_by_staff(uuid, date, date)
  to authenticated, service_role;
