-- =============================================================================
-- Row Level Security y privilegios.
-- Principio: RLS activado en TODAS las tablas; lectura según rol; la mayoría de las
-- escrituras críticas solo a través de funciones RPC que validan rol y reglas.
-- =============================================================================

-- Activar RLS en todas las tablas del esquema public.
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ¿La persona actual atiende (o atendió) a esta clienta?
create or replace function app.staff_serves_client(p_client uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.appointment_services x join public.appointments a on a.id = x.appointment_id
    where a.client_id = p_client and x.staff_id = app.current_staff_id())
$$;

create or replace function app.staff_in_appointment(p_appointment uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.appointment_services x
                 where x.appointment_id = p_appointment and x.staff_id = app.current_staff_id())
$$;

create or replace function app.can_access_client(p_client uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.has_role('owner', 'admin', 'receptionist', 'sales')
      or (app.has_role('stylist') and app.staff_serves_client(p_client))
$$;

-- ---------------------------------------------------------------------------
-- Configuración y catálogo: lectura para todo el personal; escritura owner/admin
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['locations', 'business_settings', 'business_hours', 'special_days', 'service_categories', 'services',
                           'staff_services', 'resource_types', 'resources', 'service_resource_requirements', 'service_materials',
                           'staff_members', 'staff_schedules', 'coupons'] loop
    execute format('create policy staff_read on public.%I for select to authenticated using (app.is_staff())', t);
    execute format('create policy admin_write on public.%I for all to authenticated using (app.has_role(''owner'', ''admin'')) with check (app.has_role(''owner'', ''admin''))', t);
  end loop;
  foreach t in array array['brands', 'product_categories', 'products', 'product_variants', 'product_images'] loop
    execute format('create policy staff_read on public.%I for select to authenticated using (app.is_staff())', t);
    execute format('create policy catalog_write on public.%I for all to authenticated using (app.has_role(''owner'', ''admin'', ''inventory'')) with check (app.has_role(''owner'', ''admin'', ''inventory''))', t);
  end loop;
end $$;

-- Costos: información financiera.
create policy finance_read on public.service_cost_items for select to authenticated using (app.has_role('owner', 'admin'));
create policy finance_write on public.service_cost_items for all to authenticated using (app.has_role('owner', 'admin')) with check (app.has_role('owner', 'admin'));
create policy suppliers_access on public.suppliers for all to authenticated
  using (app.has_role('owner', 'admin', 'inventory')) with check (app.has_role('owner', 'admin', 'inventory'));

-- El costo unitario no es visible para todo el personal (protección por columna).
revoke select on public.product_variants from anon, authenticated;
grant select (id, product_id, sku, barcode, name, tone, length_cm, texture, presentation, unit, grams_per_unit,
              price_cents, promo_price_cents, promo_ends_at, min_stock, is_active, created_at, updated_at)
  on public.product_variants to anon, authenticated;

create view public.v_variant_costs as
select v.id as variant_id, v.sku, v.name, v.cost_cents, v.price_cents,
       case when v.price_cents > 0 then round(100.0 * (v.price_cents - v.cost_cents) / v.price_cents, 1) end as margin_pct
from public.product_variants v
where app.has_role('owner', 'admin', 'inventory');
revoke all on public.v_variant_costs from anon;
revoke all on public.v_commissionable_lines from anon;

-- Catálogo público (tienda en línea / portal de reservas).
create policy public_services on public.services for select to anon using (is_active and online_bookable);
create policy public_service_categories on public.service_categories for select to anon using (true);
create policy public_products on public.products for select to anon using (is_active and is_sellable_online);
create policy public_variants on public.product_variants for select to anon
  using (is_active and exists (select 1 from public.products p where p.id = product_id and p.is_active and p.is_sellable_online));
create policy public_images on public.product_images for select to anon
  using (exists (select 1 from public.products p where p.id = product_id and p.is_active and p.is_sellable_online));
create policy public_locations on public.locations for select to anon using (is_active);
create policy public_hours on public.business_hours for select to anon using (true);
create policy public_special_days on public.special_days for select to anon using (true);
create policy public_settings on public.business_settings for select to anon using (true);
revoke select on public.business_settings from anon;
grant select (id, display_name, brand, booking_policy, cancellation_policy, privacy_notice_version) on public.business_settings to anon;

-- ---------------------------------------------------------------------------
-- Personal
-- ---------------------------------------------------------------------------
create policy time_off_read on public.staff_time_off for select to authenticated
  using (staff_id = app.current_staff_id() or app.has_role('owner', 'admin', 'receptionist'));

-- ---------------------------------------------------------------------------
-- Inventario: lectura para el personal; escrituras solo vía RPC
-- ---------------------------------------------------------------------------
create policy staff_read on public.stock_levels for select to authenticated using (app.is_staff());
create policy staff_read on public.stock_movements for select to authenticated using (app.has_role('owner', 'admin', 'inventory'));
create policy staff_read on public.stock_reservations for select to authenticated using (app.is_staff());
create policy bin_update on public.stock_levels for update to authenticated
  using (app.has_role('owner', 'admin', 'inventory')) with check (app.has_role('owner', 'admin', 'inventory'));
revoke update on public.stock_levels from authenticated;
grant update (bin_location) on public.stock_levels to authenticated;

create policy po_read on public.purchase_orders for select to authenticated using (app.has_role('owner', 'admin', 'inventory'));
create policy po_insert on public.purchase_orders for insert to authenticated with check (app.has_role('owner', 'admin', 'inventory'));
create policy po_update_draft on public.purchase_orders for update to authenticated
  using (app.has_role('owner', 'admin', 'inventory') and status in ('draft', 'sent'))
  with check (app.has_role('owner', 'admin', 'inventory') and status in ('draft', 'sent', 'cancelled'));
create policy pol_read on public.purchase_order_lines for select to authenticated using (app.has_role('owner', 'admin', 'inventory'));
create policy pol_write on public.purchase_order_lines for insert to authenticated with check (
  app.has_role('owner', 'admin', 'inventory')
  and exists (select 1 from public.purchase_orders po where po.id = purchase_order_id and po.status = 'draft'));
revoke update (qty_received) on public.purchase_order_lines from authenticated;

create policy counts_access on public.stock_counts for select to authenticated using (app.has_role('owner', 'admin', 'inventory'));
create policy counts_insert on public.stock_counts for insert to authenticated with check (app.has_role('owner', 'admin', 'inventory') and status = 'open');
create policy count_lines_read on public.stock_count_lines for select to authenticated using (app.has_role('owner', 'admin', 'inventory'));
create policy count_lines_write on public.stock_count_lines for all to authenticated
  using (app.has_role('owner', 'admin', 'inventory') and exists (select 1 from public.stock_counts c where c.id = stock_count_id and c.status = 'open'))
  with check (app.has_role('owner', 'admin', 'inventory') and exists (select 1 from public.stock_counts c where c.id = stock_count_id and c.status = 'open'));

-- ---------------------------------------------------------------------------
-- CRM (información comercial vs sensible)
-- ---------------------------------------------------------------------------
create policy clients_read on public.clients for select to authenticated using (app.can_access_client(id));
create policy clients_insert on public.clients for insert to authenticated with check (app.has_role('owner', 'admin', 'receptionist', 'sales'));
create policy clients_update on public.clients for update to authenticated
  using (app.has_role('owner', 'admin', 'receptionist', 'sales')) with check (app.has_role('owner', 'admin', 'receptionist', 'sales'));

create policy consents_read on public.client_consents for select to authenticated using (app.can_access_client(client_id));
create policy consents_insert on public.client_consents for insert to authenticated with check (app.has_role('owner', 'admin', 'receptionist', 'sales'));

create policy notes_read on public.client_notes for select to authenticated using (
  case when sensitivity = 'sensitive' then app.has_role('owner', 'admin') else app.can_access_client(client_id) end);
create policy notes_insert on public.client_notes for insert to authenticated with check (
  author_staff_id = app.current_staff_id()
  and case when sensitivity = 'sensitive' then app.has_role('owner', 'admin') else app.can_access_client(client_id) end);

create policy photos_read on public.client_photos for select to authenticated using (
  app.has_role('owner', 'admin') or (app.has_role('stylist') and app.staff_serves_client(client_id)));
create policy photos_insert on public.client_photos for insert to authenticated with check (
  uploaded_by = app.current_staff_id()
  and (app.has_role('owner', 'admin', 'receptionist') or (app.has_role('stylist') and app.staff_serves_client(client_id))));

-- ---------------------------------------------------------------------------
-- Agenda: lectura según rol; escrituras vía RPC
-- ---------------------------------------------------------------------------
create policy appt_read on public.appointments for select to authenticated using (
  app.has_role('owner', 'admin', 'receptionist', 'sales') or (app.has_role('stylist') and app.staff_in_appointment(id)));
create policy appt_services_read on public.appointment_services for select to authenticated using (
  app.has_role('owner', 'admin', 'receptionist', 'sales') or (app.has_role('stylist') and app.staff_in_appointment(appointment_id)));
-- Ocupación sin datos de clienta: visible para todo el personal (agenda compartida).
create policy allocations_read on public.appointment_allocations for select to authenticated using (app.is_staff());
create policy deposits_read on public.appointment_deposits for select to authenticated using (app.has_role('owner', 'admin', 'receptionist', 'sales'));
create policy waitlist_access on public.waitlist_entries for all to authenticated
  using (app.has_role('owner', 'admin', 'receptionist')) with check (app.has_role('owner', 'admin', 'receptionist'));
create policy reminders_access on public.maintenance_reminders for select to authenticated using (app.has_role('owner', 'admin', 'receptionist'));
create policy reminders_update on public.maintenance_reminders for update to authenticated
  using (app.has_role('owner', 'admin', 'receptionist')) with check (app.has_role('owner', 'admin', 'receptionist'));
create policy alerts_read on public.ops_alerts for select to authenticated using (app.has_role('owner', 'admin', 'receptionist'));
create policy alerts_resolve on public.ops_alerts for update to authenticated
  using (app.has_role('owner', 'admin', 'receptionist')) with check (app.has_role('owner', 'admin', 'receptionist'));

-- ---------------------------------------------------------------------------
-- POS y finanzas
-- ---------------------------------------------------------------------------
create policy cash_read on public.cash_sessions for select to authenticated using (
  app.has_role('owner', 'admin') or opened_by = app.current_staff_id());
create policy sales_read on public.sales for select to authenticated using (app.has_role('owner', 'admin', 'receptionist', 'sales'));
create policy sale_lines_read on public.sale_lines for select to authenticated using (
  app.has_role('owner', 'admin', 'receptionist', 'sales') or staff_id = app.current_staff_id());
create policy sale_payments_read on public.sale_payments for select to authenticated using (app.has_role('owner', 'admin', 'receptionist', 'sales'));
create policy refunds_read on public.refunds for select to authenticated using (app.has_role('owner', 'admin'));
create policy gift_cards_read on public.gift_cards for select to authenticated using (app.has_role('owner', 'admin', 'receptionist', 'sales'));
create policy audit_read on public.audit_log for select to authenticated using (app.has_role('owner'));

-- ---------------------------------------------------------------------------
-- Mensajería
-- ---------------------------------------------------------------------------
create policy conv_read on public.conversations for select to authenticated using (app.has_role('owner', 'admin', 'receptionist'));
create policy conv_update on public.conversations for update to authenticated
  using (app.has_role('owner', 'admin', 'receptionist')) with check (app.has_role('owner', 'admin', 'receptionist') and state <> 'automatic');
create policy msg_read on public.messages for select to authenticated using (app.has_role('owner', 'admin', 'receptionist'));
create policy msg_insert_agent on public.messages for insert to authenticated with check (
  app.has_role('owner', 'admin', 'receptionist') and sender_type = 'agent' and sender_staff_id = app.current_staff_id());
create policy notes_conv on public.internal_notes for all to authenticated
  using (app.has_role('owner', 'admin', 'receptionist')) with check (app.has_role('owner', 'admin', 'receptionist'));
-- webhook_events: sin políticas → solo service_role.

-- ---------------------------------------------------------------------------
-- Ejecución de funciones
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;

grant usage on schema app to authenticated, service_role;
revoke execute on all functions in schema app from public;
grant execute on function app.jwt_claims(), app.is_service_role(), app.current_user_id(), app.current_staff_id(),
  app.current_app_role(), app.has_role(public.app_role[]), app.is_staff(), app.staff_serves_client(uuid),
  app.staff_in_appointment(uuid), app.can_access_client(uuid), app.client_has_consent(uuid, public.consent_purpose)
  to authenticated, service_role;

-- TRUNCATE no respeta RLS ni triggers por fila: nunca disponible para roles de la API.
revoke truncate on all tables in schema public from anon, authenticated;
-- Libros mayores: sin UPDATE/DELETE desde la API aunque existiera una política.
revoke update, delete on public.stock_movements, public.audit_log, public.client_consents from anon, authenticated;
