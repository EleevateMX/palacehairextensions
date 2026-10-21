-- =============================================================================
-- Módulo de Inventario: operaciones que no podían hacerse de forma segura o atómica
-- con las políticas existentes.
--   * create_purchase_order: orden de compra + partidas en una sola transacción.
--   * set_bin_location: ubicación física aunque la variante aún no tenga existencias.
--   * cancel_stock_count: cancelar un conteo abierto (no hay política de UPDATE).
-- No se crean tablas nuevas.
-- =============================================================================

-- Orden de compra con sus partidas. p_lines: [{variant_id, qty, unit_cost_cents}, ...]
create or replace function public.create_purchase_order(
  p_supplier uuid, p_location uuid, p_expected date, p_notes text, p_lines jsonb
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_po uuid;
  l jsonb;
  v_qty numeric;
  v_cost integer;
begin
  perform app.require_role('owner', 'admin', 'inventory');
  if not exists (select 1 from public.suppliers where id = p_supplier and is_active) then
    perform app.fail('SUPPLIER_NOT_FOUND');
  end if;
  if not exists (select 1 from public.locations where id = p_location and is_active) then
    perform app.fail('LOCATION_NOT_FOUND');
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    perform app.fail('PO_EMPTY');
  end if;

  insert into public.purchase_orders (supplier_id, location_id, status, expected_at, notes, created_by)
  values (p_supplier, p_location, 'draft', p_expected, nullif(trim(p_notes), ''), app.current_user_id())
  returning id into v_po;

  for l in select * from jsonb_array_elements(p_lines) loop
    v_qty := (l ->> 'qty')::numeric;
    v_cost := (l ->> 'unit_cost_cents')::integer;
    if v_qty is null or v_qty <= 0 then perform app.fail('INVALID_QUANTITY'); end if;
    if v_cost is null or v_cost < 0 then perform app.fail('INVALID_AMOUNT'); end if;
    if not exists (select 1 from public.product_variants where id = (l ->> 'variant_id')::uuid) then
      perform app.fail('PRODUCT_NOT_FOUND');
    end if;
    insert into public.purchase_order_lines (purchase_order_id, variant_id, qty_ordered, unit_cost_cents)
    values (v_po, (l ->> 'variant_id')::uuid, v_qty, v_cost);
  end loop;

  perform app.audit_event('purchase_orders', v_po::text, jsonb_build_object('action', 'create', 'lines', p_lines));
  return v_po;
end $$;

-- Ubicación física (anaquel, cajón). Crea la fila de existencias en cero si no existía.
create or replace function public.set_bin_location(p_variant uuid, p_location uuid, p_bin text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_role('owner', 'admin', 'inventory');
  if not exists (select 1 from public.product_variants where id = p_variant) then perform app.fail('PRODUCT_NOT_FOUND'); end if;
  if not exists (select 1 from public.locations where id = p_location) then perform app.fail('LOCATION_NOT_FOUND'); end if;
  perform app.lock_stock(p_variant, p_location);
  update public.stock_levels set bin_location = nullif(trim(p_bin), ''), updated_at = now()
   where variant_id = p_variant and location_id = p_location;
end $$;

-- Cancela un conteo abierto (sus partidas se conservan como registro, sin aplicar).
create or replace function public.cancel_stock_count(p_count uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  c public.stock_counts;
begin
  perform app.require_role('owner', 'admin', 'inventory');
  select * into c from public.stock_counts where id = p_count for update;
  if not found or c.status <> 'open' then perform app.fail('COUNT_NOT_OPEN'); end if;
  update public.stock_counts set status = 'cancelled' where id = p_count;
  perform app.audit_event('stock_counts', p_count::text, jsonb_build_object('action', 'cancel'));
end $$;

revoke execute on function public.create_purchase_order(uuid, uuid, date, text, jsonb) from public, anon;
revoke execute on function public.set_bin_location(uuid, uuid, text) from public, anon;
revoke execute on function public.cancel_stock_count(uuid) from public, anon;
grant execute on function public.create_purchase_order(uuid, uuid, date, text, jsonb) to authenticated, service_role;
grant execute on function public.set_bin_location(uuid, uuid, text) to authenticated, service_role;
grant execute on function public.cancel_stock_count(uuid) to authenticated, service_role;
