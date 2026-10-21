-- =============================================================================
-- Agenda inteligente y control de capacidad.
--
-- Garantía contra doble reserva: cada ocupación de personal o recurso es una fila en
-- appointment_allocations con un rango tstzrange. Dos restricciones EXCLUDE impiden que
-- dos filas activas del mismo empleado o del mismo recurso se traslapen. PostgreSQL
-- serializa las inserciones concurrentes: si dos transacciones compiten por el último
-- hueco, una confirma y la otra recibe exclusion_violation → SLOT_TAKEN.
-- =============================================================================

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations (id),
  client_id uuid references public.clients (id),
  booking_status public.booking_status not null default 'confirmed',
  attendance_status public.attendance_status not null default 'scheduled',
  payment_status public.payment_status not null default 'not_required',
  materials_status public.materials_status not null default 'not_required',
  hold_expires_at timestamptz,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  deposit_required_cents int not null default 0,
  source text not null default 'reception' check (source in ('reception', 'online', 'whatsapp', 'messenger', 'phone', 'walk_in')),
  notes text,
  idempotency_key text unique,
  rescheduled_from uuid references public.appointments (id),
  cancelled_at timestamptz,
  cancel_reason text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (booking_status <> 'hold' or hold_expires_at is not null)
);
create index appointments_starts_idx on public.appointments (location_id, starts_at);
create index appointments_client_idx on public.appointments (client_id, starts_at desc);
create index appointments_hold_idx on public.appointments (hold_expires_at) where booking_status = 'hold';
create trigger appointments_touch before update on public.appointments for each row execute function app.touch_updated_at();
create trigger appointments_audit after insert or update or delete on public.appointments for each row execute function app.audit_row();

alter table public.stock_reservations
  add constraint stock_reservations_appointment_fk foreign key (appointment_id) references public.appointments (id);
alter table public.client_photos
  add constraint client_photos_appointment_fk foreign key (appointment_id) references public.appointments (id);

create table public.appointment_services (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments (id) on delete cascade,
  service_id uuid not null references public.services (id),
  staff_id uuid references public.staff_members (id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  price_cents int not null,
  position int not null default 0,
  check (ends_at > starts_at)
);
create index on public.appointment_services (appointment_id);
create index on public.appointment_services (staff_id, starts_at);

create table public.appointment_allocations (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('appointment', 'block', 'time_off')),
  appointment_id uuid references public.appointments (id) on delete cascade,
  appointment_service_id uuid references public.appointment_services (id) on delete cascade,
  time_off_id uuid references public.staff_time_off (id) on delete cascade,
  staff_id uuid references public.staff_members (id),
  resource_id uuid references public.resources (id),
  occupied tstzrange not null,
  active boolean not null default true,
  reason text,
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint allocation_one_target check ((staff_id is null) <> (resource_id is null)),
  constraint allocation_not_empty check (not isempty(occupied)),
  constraint no_staff_overlap exclude using gist (staff_id with =, occupied with &&) where (active and staff_id is not null),
  constraint no_resource_overlap exclude using gist (resource_id with =, occupied with &&) where (active and resource_id is not null)
);
create index on public.appointment_allocations (appointment_id);
create index on public.appointment_allocations using gist (occupied) where active;

create type public.deposit_status as enum ('received', 'applied', 'refunded', 'needs_refund', 'forfeited');

-- Anticipos: separados del estado de la reserva. Únicos por referencia del proveedor (idempotencia).
create table public.appointment_deposits (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments (id),
  amount_cents int not null check (amount_cents > 0),
  method text not null check (method in ('cash', 'card', 'transfer', 'online')),
  provider text not null default 'manual',
  provider_ref text not null default gen_random_uuid()::text,
  status public.deposit_status not null default 'received',
  applied_sale_id uuid,
  received_at timestamptz not null default now(),
  recorded_by uuid,
  unique (provider, provider_ref)
);
create index on public.appointment_deposits (appointment_id);

create table public.waitlist_entries (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id),
  service_id uuid not null references public.services (id),
  preferred_staff_id uuid references public.staff_members (id),
  desired_from date not null,
  desired_to date not null,
  notes text,
  status text not null default 'waiting' check (status in ('waiting', 'offered', 'booked', 'cancelled')),
  created_at timestamptz not null default now()
);

create table public.maintenance_reminders (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id),
  appointment_id uuid references public.appointments (id),
  technique text,
  due_date date not null,
  remind_on date not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'booked', 'dismissed')),
  created_at timestamptz not null default now()
);

-- Alertas operativas (p. ej. pago llegado tras expirar una reserva).
create table public.ops_alerts (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  severity text not null default 'warning' check (severity in ('info', 'warning', 'critical')),
  reference_type text,
  reference_id text,
  message text not null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

-- Ocupación vigente (excluye apartados vencidos aún no barridos).
create view public.v_busy_allocations with (security_invoker = true) as
select al.id, al.kind, al.staff_id, al.resource_id, al.occupied, al.appointment_id
from public.appointment_allocations al
left join public.appointments a on a.id = al.appointment_id
where al.active
  -- coalesce: si RLS oculta la cita (p. ej. a una estilista), la ocupación cuenta como ocupada (conservador).
  and not coalesce(a.booking_status = 'hold' and a.hold_expires_at <= now(), false);

-- ---------------------------------------------------------------------------
-- Validaciones de horario
-- ---------------------------------------------------------------------------
create or replace function app.location_tz(p_location uuid) returns text
language sql stable security definer set search_path = '' as $$
  select timezone from public.locations where id = p_location
$$;

-- ¿El negocio está abierto durante todo [p_start, p_end)? Considera festivos/días especiales.
create or replace function app.location_is_open(p_location uuid, p_start timestamptz, p_end timestamptz) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  tz text := app.location_tz(p_location);
  d date := (p_start at time zone tz)::date;
  sd public.special_days;
begin
  if (p_end at time zone tz)::date <> d and (p_end at time zone tz)::time <> '00:00' then return false; end if;
  select * into sd from public.special_days where location_id = p_location and day = d;
  if found then
    if sd.is_closed then return false; end if;
    return ((d + sd.opens_at) at time zone tz) <= p_start and ((d + sd.closes_at) at time zone tz) >= p_end;
  end if;
  return exists (
    select 1 from public.business_hours h
    where h.location_id = p_location and h.weekday = extract(dow from d)
      and ((d + h.opens_at) at time zone tz) <= p_start and ((d + h.closes_at) at time zone tz) >= p_end);
end $$;

-- ¿La persona tiene turno que cubra todo el bloque? (Ausencias aprobadas se validan por exclusión.)
create or replace function app.staff_is_working(p_staff uuid, p_location uuid, p_start timestamptz, p_end timestamptz) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  tz text := app.location_tz(p_location);
  d date := (p_start at time zone tz)::date;
begin
  return exists (
    select 1 from public.staff_schedules s
    join public.staff_members m on m.id = s.staff_id and m.is_active
    where s.staff_id = p_staff and s.location_id = p_location and s.weekday = extract(dow from d)
      and ((d + s.starts_at) at time zone tz) <= p_start and ((d + s.ends_at) at time zone tz) >= p_end);
end $$;

-- ---------------------------------------------------------------------------
-- Barrido de apartados vencidos (también programable con pg_cron)
-- ---------------------------------------------------------------------------
create or replace function app.expire_holds() returns int
language plpgsql security definer set search_path = '' as $$
declare
  a record;
  r record;
  n int := 0;
begin
  for a in
    select id from public.appointments
    where booking_status = 'hold' and hold_expires_at <= now()
    for update skip locked
  loop
    update public.appointments set booking_status = 'expired' where id = a.id;
    update public.appointment_allocations set active = false where appointment_id = a.id;
    for r in select id from public.stock_reservations where appointment_id = a.id and status = 'active' loop
      perform app.release_reservation_internal(r.id, 'expired');
    end loop;
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.expire_holds() returns int
language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_role('owner', 'admin', 'receptionist');
  return app.expire_holds();
end $$;

-- ---------------------------------------------------------------------------
-- Inserción de servicios de una cita (núcleo compartido por crear y reprogramar)
-- p_items: [{service_id, staff_id, resource_ids: [uuid], starts_at, materials: [{variant_id, quantity}]}]
-- ---------------------------------------------------------------------------
create or replace function app.insert_appointment_items(
  p_appointment uuid, p_location uuid, p_client uuid, p_items jsonb,
  p_reserve_materials boolean, p_reservation_expires timestamptz, p_allow_missing_materials boolean
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  it jsonb;
  pos int := 0;
  svc public.services;
  v_staff uuid;
  v_start timestamptz;
  v_end timestamptz;
  v_dur int;
  v_price int;
  v_service_line uuid;
  v_staff_block tstzrange;
  v_res_block tstzrange;
  v_res uuid;
  v_needs_staff boolean;
  req record;
  m record;
  v_min timestamptz;
  v_max timestamptz;
  v_deposit int := 0;
  v_mat_status public.materials_status := 'not_required';
begin
  for it in select * from jsonb_array_elements(p_items) loop
    select * into svc from public.services where id = (it ->> 'service_id')::uuid and is_active;
    if not found then perform app.fail('SERVICE_NOT_FOUND'); end if;
    v_staff := nullif(it ->> 'staff_id', '')::uuid;
    v_start := (it ->> 'starts_at')::timestamptz;
    v_needs_staff := exists (select 1 from public.staff_services where service_id = svc.id);
    v_dur := svc.duration_min;
    v_price := svc.price_cents;

    if v_staff is not null then
      select coalesce(ss.duration_min, svc.duration_min), coalesce(ss.price_cents, svc.price_cents)
        into v_dur, v_price
        from public.staff_services ss where ss.staff_id = v_staff and ss.service_id = svc.id;
      if not found then perform app.fail('STAFF_NOT_QUALIFIED', 'La persona no está autorizada para este servicio'); end if;
    elsif v_needs_staff then
      perform app.fail('STAFF_REQUIRED');
    end if;

    v_end := v_start + make_interval(mins => v_dur);
    if not app.location_is_open(p_location, v_start, v_end) then
      perform app.fail('OUTSIDE_BUSINESS_HOURS', 'El horario solicitado está fuera del horario del salón');
    end if;

    v_staff_block := tstzrange(v_start - make_interval(mins => svc.prep_min),
                               v_end + make_interval(mins => (case when svc.cleanup_occupies_staff then svc.cleanup_min else 0 end) + svc.buffer_min), '[)');
    v_res_block := tstzrange(v_start - make_interval(mins => svc.prep_min), v_end + make_interval(mins => svc.cleanup_min), '[)');

    if v_staff is not null and not app.staff_is_working(v_staff, p_location, lower(v_staff_block), upper(v_staff_block)) then
      perform app.fail('STAFF_NOT_WORKING', 'La persona no tiene turno en ese horario');
    end if;

    -- Recursos: deben cumplir exactamente los requerimientos del servicio.
    for req in select r.resource_type_id, r.quantity from public.service_resource_requirements r where r.service_id = svc.id loop
      if (select count(*) from jsonb_array_elements_text(coalesce(it -> 'resource_ids', '[]')) x
            join public.resources rs on rs.id = x::uuid
           where rs.resource_type_id = req.resource_type_id and rs.is_active and rs.location_id = p_location) < req.quantity then
        perform app.fail('RESOURCE_REQUIRED', 'Faltan recursos físicos requeridos por el servicio');
      end if;
    end loop;

    insert into public.appointment_services (appointment_id, service_id, staff_id, starts_at, ends_at, price_cents, position)
    values (p_appointment, svc.id, v_staff, v_start, v_end, v_price, pos)
    returning id into v_service_line;

    if v_staff is not null then
      insert into public.appointment_allocations (kind, appointment_id, appointment_service_id, staff_id, occupied, created_by)
      values ('appointment', p_appointment, v_service_line, v_staff, v_staff_block, app.current_user_id());
    end if;
    for v_res in select x::uuid from jsonb_array_elements_text(coalesce(it -> 'resource_ids', '[]')) x loop
      insert into public.appointment_allocations (kind, appointment_id, appointment_service_id, resource_id, occupied, created_by)
      values ('appointment', p_appointment, v_service_line, v_res, v_res_block, app.current_user_id());
    end loop;

    -- Materiales: receta fija + materiales elegidos (p. ej. extensiones del tono seleccionado).
    if p_reserve_materials then
      for m in
        select sm.variant_id, sm.quantity from public.service_materials sm
         where sm.service_id = svc.id and not sm.is_variable and sm.reserve_on_booking
        union all
        select (x ->> 'variant_id')::uuid, (x ->> 'quantity')::numeric
          from jsonb_array_elements(coalesce(it -> 'materials', '[]')) x
      loop
        begin
          perform app.reserve_stock_internal(m.variant_id, p_location, m.quantity, 'appointment', p_appointment, p_client, p_reservation_expires);
          if v_mat_status = 'not_required' then v_mat_status := 'reserved'; end if;
        exception when raise_exception then
          if sqlerrm = 'INSUFFICIENT_STOCK' and p_allow_missing_materials then
            v_mat_status := 'missing';
            insert into public.ops_alerts (kind, reference_type, reference_id, message)
            values ('materials_missing', 'appointment', p_appointment::text,
                    format('Material insuficiente para la cita (variante %s, cantidad %s)', m.variant_id, m.quantity));
          else
            raise;
          end if;
        end;
      end loop;
    end if;

    v_deposit := v_deposit + case svc.deposit_type
      when 'fixed' then svc.deposit_value
      when 'percent' then (v_price * svc.deposit_value / 10000)
      else 0 end;
    v_min := least(coalesce(v_min, v_start), v_start);
    v_max := greatest(coalesce(v_max, v_end), v_end);
    pos := pos + 1;
  end loop;

  if pos = 0 then perform app.fail('NO_SERVICES'); end if;
  return jsonb_build_object('starts_at', v_min, 'ends_at', v_max, 'deposit_cents', v_deposit, 'materials_status', v_mat_status);
end $$;

-- ---------------------------------------------------------------------------
-- Crear cita (recepción o servidor del portal público con service_role)
-- ---------------------------------------------------------------------------
create or replace function public.create_appointment(
  p_location uuid,
  p_client uuid,
  p_items jsonb,
  p_hold_minutes int default null,              -- null = confirmada; n = apartado provisional n minutos
  p_source text default 'reception',
  p_idempotency_key text default null,
  p_allow_missing_materials boolean default false,
  p_notes text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_hold timestamptz := case when p_hold_minutes is not null then now() + make_interval(mins => p_hold_minutes) end;
  v_info jsonb;
begin
  perform app.require_role('owner', 'admin', 'receptionist');

  if p_idempotency_key is not null then
    select id into v_id from public.appointments where idempotency_key = p_idempotency_key;
    if found then return v_id; end if;
  end if;

  perform app.expire_holds();

  begin
    insert into public.appointments (location_id, client_id, booking_status, hold_expires_at, starts_at, ends_at,
                                     source, notes, idempotency_key, created_by)
    values (p_location, p_client, case when v_hold is null then 'confirmed' else 'hold' end::public.booking_status,
            v_hold, now(), now() + interval '1 minute', p_source, p_notes, p_idempotency_key, app.current_user_id())
    returning id into v_id;

    v_info := app.insert_appointment_items(v_id, p_location, p_client, p_items, true, v_hold, p_allow_missing_materials);

    update public.appointments set
      starts_at = (v_info ->> 'starts_at')::timestamptz,
      ends_at = (v_info ->> 'ends_at')::timestamptz,
      deposit_required_cents = (v_info ->> 'deposit_cents')::int,
      materials_status = (v_info ->> 'materials_status')::public.materials_status,
      payment_status = case when (v_info ->> 'deposit_cents')::int > 0 then 'pending' else 'not_required' end::public.payment_status
    where id = v_id;
  exception
    when exclusion_violation then
      perform app.fail('SLOT_TAKEN', 'El horario ya no está disponible para la persona o el recurso seleccionado');
    when unique_violation then
      -- Carrera con la misma llave de idempotencia: devolver la cita ganadora.
      if p_idempotency_key is not null then
        select id into v_id from public.appointments where idempotency_key = p_idempotency_key;
        if found then return v_id; end if;
      end if;
      raise;
  end;
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- Cancelar: libera agenda y materiales reservados
-- ---------------------------------------------------------------------------
create or replace function public.cancel_appointment(p_appointment uuid, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  a public.appointments;
  r record;
  v_late boolean;
  v_hours int;
begin
  perform app.require_role('owner', 'admin', 'receptionist');
  select * into a from public.appointments where id = p_appointment for update;
  if not found then perform app.fail('APPOINTMENT_NOT_FOUND'); end if;
  if a.booking_status in ('cancelled', 'expired') then
    return jsonb_build_object('status', a.booking_status, 'already', true);
  end if;
  if a.attendance_status in ('in_service', 'completed') then perform app.fail('APPOINTMENT_IN_PROGRESS'); end if;

  update public.appointments set booking_status = 'cancelled', cancelled_at = now(), cancel_reason = p_reason where id = a.id;
  update public.appointment_allocations set active = false where appointment_id = a.id;
  for r in select id from public.stock_reservations where appointment_id = a.id and status = 'active' loop
    perform app.release_reservation_internal(r.id, 'released');
  end loop;
  update public.appointments set materials_status = 'released' where id = a.id and materials_status = 'reserved';

  select coalesce(min(s.cancellation_min_hours), (select (cancellation_policy ->> 'free_until_hours')::int from public.business_settings where id = 1), 24)
    into v_hours
    from public.appointment_services x join public.services s on s.id = x.service_id where x.appointment_id = a.id;
  v_late := a.starts_at - now() < make_interval(hours => v_hours);
  return jsonb_build_object('status', 'cancelled', 'late_cancellation', v_late, 'free_until_hours', v_hours);
end $$;

-- ---------------------------------------------------------------------------
-- Cambiar la estilista de un servicio
-- ---------------------------------------------------------------------------
create or replace function public.reassign_appointment_service(p_appointment_service uuid, p_new_staff uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  l public.appointment_services;
  a public.appointments;
  blk tstzrange;
begin
  perform app.require_role('owner', 'admin', 'receptionist');
  select * into l from public.appointment_services where id = p_appointment_service for update;
  if not found then perform app.fail('NOT_FOUND'); end if;
  select * into a from public.appointments where id = l.appointment_id for update;
  if a.booking_status not in ('hold', 'confirmed') or a.attendance_status in ('completed', 'no_show') then
    perform app.fail('APPOINTMENT_NOT_EDITABLE');
  end if;
  if not exists (select 1 from public.staff_services where staff_id = p_new_staff and service_id = l.service_id) then
    perform app.fail('STAFF_NOT_QUALIFIED');
  end if;
  select occupied into blk from public.appointment_allocations
   where appointment_service_id = l.id and staff_id is not null and active;
  if blk is null then perform app.fail('NO_STAFF_ALLOCATION'); end if;
  if not app.staff_is_working(p_new_staff, a.location_id, lower(blk), upper(blk)) then
    perform app.fail('STAFF_NOT_WORKING');
  end if;
  begin
    update public.appointment_allocations set staff_id = p_new_staff
     where appointment_service_id = l.id and staff_id is not null and active;
  exception when exclusion_violation then
    perform app.fail('SLOT_TAKEN', 'La nueva persona ya tiene ocupado ese horario');
  end;
  update public.appointment_services set staff_id = p_new_staff where id = l.id;
end $$;

-- ---------------------------------------------------------------------------
-- Reprogramar: nueva cita vinculada, conserva materiales y anticipos
-- ---------------------------------------------------------------------------
create or replace function public.reschedule_appointment(p_appointment uuid, p_items jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  a public.appointments;
  v_new uuid;
  v_info jsonb;
begin
  perform app.require_role('owner', 'admin', 'receptionist');
  select * into a from public.appointments where id = p_appointment for update;
  if not found or a.booking_status not in ('hold', 'confirmed') or a.attendance_status <> 'scheduled' then
    perform app.fail('APPOINTMENT_NOT_EDITABLE');
  end if;
  begin
    update public.appointment_allocations set active = false where appointment_id = a.id;
    insert into public.appointments (location_id, client_id, booking_status, hold_expires_at, payment_status, starts_at, ends_at,
                                     source, notes, rescheduled_from, created_by, materials_status, deposit_required_cents)
    values (a.location_id, a.client_id, a.booking_status, a.hold_expires_at, a.payment_status, now(), now() + interval '1 minute',
            a.source, a.notes, a.id, app.current_user_id(), a.materials_status, a.deposit_required_cents)
    returning id into v_new;
    v_info := app.insert_appointment_items(v_new, a.location_id, a.client_id, p_items, false, null, false);
    update public.appointments set starts_at = (v_info ->> 'starts_at')::timestamptz, ends_at = (v_info ->> 'ends_at')::timestamptz
     where id = v_new;
  exception when exclusion_violation then
    perform app.fail('SLOT_TAKEN');
  end;
  update public.stock_reservations set appointment_id = v_new where appointment_id = a.id and status = 'active';
  update public.appointment_deposits set appointment_id = v_new where appointment_id = a.id;
  update public.appointments set booking_status = 'cancelled', cancelled_at = now(), cancel_reason = 'rescheduled' where id = a.id;
  return v_new;
end $$;

-- ---------------------------------------------------------------------------
-- Anticipos y pago confirmado (incluye pago que llega después de expirar el apartado)
-- ---------------------------------------------------------------------------
create or replace function public.record_appointment_deposit(
  p_appointment uuid, p_amount_cents int, p_method text, p_provider text default 'manual', p_provider_ref text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  a public.appointments;
  d public.appointment_deposits;
  r record;
  v_ok boolean := true;
begin
  perform app.require_role('owner', 'admin', 'receptionist');
  select * into a from public.appointments where id = p_appointment for update;
  if not found then perform app.fail('APPOINTMENT_NOT_FOUND'); end if;

  -- Idempotencia: el mismo pago del proveedor nunca se registra dos veces.
  if p_provider_ref is not null then
    select * into d from public.appointment_deposits where provider = p_provider and provider_ref = p_provider_ref;
    if found then return jsonb_build_object('deposit_id', d.id, 'status', d.status, 'duplicate', true); end if;
  end if;

  if a.booking_status = 'hold' and a.hold_expires_at <= now() then
    perform app.expire_holds();
    select * into a from public.appointments where id = p_appointment;
  end if;

  if a.booking_status = 'expired' then
    -- Intentar recuperar el mismo horario y materiales.
    begin
      update public.appointment_allocations set active = true where appointment_id = a.id;
      for r in select variant_id, location_id, quantity from public.stock_reservations
                where appointment_id = a.id and status = 'expired' loop
        perform app.reserve_stock_internal(r.variant_id, r.location_id, r.quantity, 'appointment', a.id, a.client_id, null);
      end loop;
    exception
      when exclusion_violation then v_ok := false;
      when raise_exception then
        if sqlerrm = 'INSUFFICIENT_STOCK' then v_ok := false; else raise; end if;
    end;
  elsif a.booking_status = 'cancelled' then
    v_ok := false;
  end if;

  insert into public.appointment_deposits (appointment_id, amount_cents, method, provider, provider_ref, status, recorded_by)
  values (a.id, p_amount_cents, p_method, p_provider, coalesce(p_provider_ref, gen_random_uuid()::text),
          case when v_ok then 'received' else 'needs_refund' end::public.deposit_status, app.current_user_id())
  returning * into d;

  if v_ok then
    update public.appointments set booking_status = 'confirmed', hold_expires_at = null,
           payment_status = 'deposit_paid'
     where id = a.id;
    update public.stock_reservations set expires_at = null where appointment_id = a.id and status = 'active';
  else
    update public.appointments set payment_status = 'needs_refund' where id = a.id;
    insert into public.ops_alerts (kind, severity, reference_type, reference_id, message)
    values ('payment_after_expiry', 'critical', 'appointment', a.id::text,
            'Pago recibido después de expirar el apartado y el horario ya no está disponible: reubicar o reembolsar');
  end if;
  return jsonb_build_object('deposit_id', d.id, 'status', d.status, 'appointment_status',
                            (select booking_status from public.appointments where id = a.id));
end $$;

-- ---------------------------------------------------------------------------
-- Asistencia y consumo real de materiales
-- ---------------------------------------------------------------------------
create or replace function public.set_attendance(p_appointment uuid, p_status public.attendance_status) returns void
language plpgsql security definer set search_path = '' as $$
declare
  a public.appointments;
begin
  perform app.require_role('owner', 'admin', 'receptionist', 'stylist');
  select * into a from public.appointments where id = p_appointment for update;
  if a.booking_status <> 'confirmed' then perform app.fail('APPOINTMENT_NOT_CONFIRMED'); end if;
  if p_status = 'completed' then perform app.fail('USE_COMPLETE_APPOINTMENT'); end if;
  if app.has_role('stylist') and not exists (
       select 1 from public.appointment_services where appointment_id = a.id and staff_id = app.current_staff_id()) then
    perform app.fail('FORBIDDEN');
  end if;
  update public.appointments set attendance_status = p_status where id = a.id;
  if p_status = 'no_show' then
    update public.appointment_allocations set active = false where appointment_id = a.id and upper(occupied) > now();
  end if;
end $$;

-- p_consumption: [{reservation_id, actual_qty}] y p_extra: [{variant_id, quantity}]
create or replace function public.complete_appointment(
  p_appointment uuid, p_consumption jsonb default '[]', p_extra jsonb default '[]'
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  a public.appointments;
  r public.stock_reservations;
  v_actual numeric;
  x jsonb;
  s record;
begin
  perform app.require_role('owner', 'admin', 'receptionist', 'stylist');
  select * into a from public.appointments where id = p_appointment for update;
  if a.booking_status <> 'confirmed' or a.attendance_status = 'completed' then perform app.fail('APPOINTMENT_NOT_COMPLETABLE'); end if;
  if app.has_role('stylist') and not exists (
       select 1 from public.appointment_services where appointment_id = a.id and staff_id = app.current_staff_id()) then
    perform app.fail('FORBIDDEN');
  end if;

  for r in select * from public.stock_reservations where appointment_id = a.id and status = 'active' for update loop
    select (c ->> 'actual_qty')::numeric into v_actual
      from jsonb_array_elements(p_consumption) c where (c ->> 'reservation_id')::uuid = r.id;
    v_actual := coalesce(v_actual, r.quantity);
    if v_actual > 0 then
      perform app.apply_movement(r.variant_id, r.location_id, 'service_consumption', -v_actual,
                                 'appointment', a.id::text, null, null, r.quantity);
    else
      perform app.release_reservation_internal(r.id, 'released');
    end if;
    update public.stock_reservations set status = 'consumed', closed_at = now() where id = r.id and status = 'active';
  end loop;

  for x in select * from jsonb_array_elements(p_extra) loop
    perform app.apply_movement((x ->> 'variant_id')::uuid, a.location_id, 'service_consumption', -(x ->> 'quantity')::numeric,
                               'appointment', a.id::text, 'Consumo adicional');
  end loop;

  update public.appointments set attendance_status = 'completed',
         materials_status = case when materials_status in ('reserved', 'missing') then 'consumed' else materials_status end
   where id = a.id;

  -- Seguimiento de mantenimiento según el servicio realizado.
  for s in select sv.technique, sv.maintenance_interval_days from public.appointment_services x
             join public.services sv on sv.id = x.service_id
            where x.appointment_id = a.id and sv.maintenance_interval_days is not null loop
    if a.client_id is not null then
      insert into public.maintenance_reminders (client_id, appointment_id, technique, due_date, remind_on)
      values (a.client_id, a.id, s.technique,
              (a.starts_at at time zone app.location_tz(a.location_id))::date + s.maintenance_interval_days,
              (a.starts_at at time zone app.location_tz(a.location_id))::date + greatest(s.maintenance_interval_days - 7, 0));
      update public.clients set next_visit_suggested =
        (a.starts_at at time zone app.location_tz(a.location_id))::date + s.maintenance_interval_days
       where id = a.client_id;
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Ausencias y bloqueos
-- ---------------------------------------------------------------------------
create or replace function public.request_time_off(
  p_kind public.time_off_kind, p_starts timestamptz, p_ends timestamptz, p_reason text default null, p_staff uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_staff uuid := coalesce(p_staff, app.current_staff_id());
  v_id uuid;
begin
  if v_staff is null then perform app.fail('FORBIDDEN'); end if;
  if v_staff <> coalesce(app.current_staff_id(), '00000000-0000-0000-0000-000000000000') then
    perform app.require_role('owner', 'admin');
  end if;
  insert into public.staff_time_off (staff_id, kind, starts_at, ends_at, reason, requested_by)
  values (v_staff, p_kind, p_starts, p_ends, p_reason, app.current_staff_id())
  returning id into v_id;
  return v_id;
end $$;

-- Aprobar bloquea la agenda. Si hay citas en el periodo, falla y devuelve cuáles: deben reasignarse antes.
create or replace function public.decide_time_off(p_time_off uuid, p_approve boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  t public.staff_time_off;
  v_conflicts jsonb;
begin
  perform app.require_role('owner', 'admin');
  select * into t from public.staff_time_off where id = p_time_off for update;
  if not found or t.status <> 'requested' then perform app.fail('TIME_OFF_NOT_PENDING'); end if;
  if not p_approve then
    update public.staff_time_off set status = 'rejected', decided_by = app.current_staff_id(), decided_at = now() where id = t.id;
    return jsonb_build_object('status', 'rejected');
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('appointment_id', b.appointment_id, 'occupied', b.occupied)), '[]')
    into v_conflicts
    from public.v_busy_allocations b
   where b.staff_id = t.staff_id and b.occupied && tstzrange(t.starts_at, t.ends_at, '[)');
  if jsonb_array_length(v_conflicts) > 0 then
    return jsonb_build_object('status', 'conflicts', 'conflicts', v_conflicts);
  end if;
  begin
    insert into public.appointment_allocations (kind, time_off_id, staff_id, occupied, reason, created_by)
    values ('time_off', t.id, t.staff_id, tstzrange(t.starts_at, t.ends_at, '[)'), t.kind::text, app.current_user_id());
  exception when exclusion_violation then
    return jsonb_build_object('status', 'conflicts', 'conflicts', '[]'::jsonb);
  end;
  update public.staff_time_off set status = 'approved', decided_by = app.current_staff_id(), decided_at = now() where id = t.id;
  return jsonb_build_object('status', 'approved');
end $$;

create or replace function public.block_time(
  p_starts timestamptz, p_ends timestamptz, p_reason text, p_staff uuid default null, p_resource uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  perform app.require_role('owner', 'admin', 'receptionist');
  begin
    insert into public.appointment_allocations (kind, staff_id, resource_id, occupied, reason, created_by)
    values ('block', p_staff, p_resource, tstzrange(p_starts, p_ends, '[)'), p_reason, app.current_user_id())
    returning id into v_id;
  exception when exclusion_violation then
    perform app.fail('SLOT_TAKEN');
  end;
  return v_id;
end $$;

-- Programación opcional del barrido con pg_cron (solo si la extensión existe, p. ej. en Supabase).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    execute 'create extension if not exists pg_cron';
    perform cron.schedule('palace-expire-holds', '* * * * *', 'select app.expire_holds()');
  end if;
exception when others then
  raise notice 'pg_cron no disponible: %', sqlerrm;
end $$;
