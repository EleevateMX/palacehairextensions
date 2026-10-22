-- =============================================================================
-- DATOS DE DESARROLLO FICTICIOS (solo `supabase db reset` local).
-- No contiene datos reales de Palace ni de otros negocios. Precios y tiempos son ejemplos
-- pendientes de validar con la propietaria.
-- =============================================================================
insert into public.business_settings (id, display_name) values (1, 'Palace Hair Extensions')
on conflict (id) do update set display_name = excluded.display_name;

insert into public.locations (id, name) values ('00000000-0000-4000-8000-000000000001', 'Sucursal Mérida');
insert into public.business_hours (location_id, weekday, opens_at, closes_at)
select '00000000-0000-4000-8000-000000000001', d, '10:00', '19:00' from generate_series(1, 6) d;   -- lunes a sábado

insert into public.resource_types (id, code, name) values
  ('00000000-0000-4000-8000-000000000101', 'estacion', 'Estación de trabajo'),
  ('00000000-0000-4000-8000-000000000102', 'lavacabezas', 'Lavacabezas');
insert into public.resources (resource_type_id, location_id, name)
select '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000001', 'Estación ' || n from generate_series(1, 3) n;
insert into public.resources (resource_type_id, location_id, name)
values ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000001', 'Lavacabezas 1');

insert into public.service_categories (id, name) values
  ('00000000-0000-4000-8000-000000000201', 'Extensiones'), ('00000000-0000-4000-8000-000000000202', 'Cuidado');
insert into public.services (id, category_id, name, price_cents, price_is_from, duration_min, prep_min, cleanup_min,
                             requires_consultation, deposit_type, deposit_value, online_bookable, maintenance_interval_days, technique)
values
  ('00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-000000000201', 'Valoración de extensiones', 0, false, 30, 0, 10, false, 'none', 0, true, null, null),
  ('00000000-0000-4000-8000-000000000302', '00000000-0000-4000-8000-000000000201', 'Instalación de extensiones de cinta', 450000, true, 150, 15, 20, true, 'fixed', 100000, false, 42, 'cinta'),
  ('00000000-0000-4000-8000-000000000303', '00000000-0000-4000-8000-000000000201', 'Mantenimiento de cinta', 120000, false, 90, 0, 15, false, 'none', 0, true, 42, 'cinta'),
  ('00000000-0000-4000-8000-000000000304', '00000000-0000-4000-8000-000000000202', 'Lavado y peinado', 45000, false, 45, 0, 10, false, 'none', 0, true, null, null);
insert into public.service_resource_requirements (service_id, resource_type_id) values
  ('00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-000000000101'),
  ('00000000-0000-4000-8000-000000000302', '00000000-0000-4000-8000-000000000101'),
  ('00000000-0000-4000-8000-000000000303', '00000000-0000-4000-8000-000000000101'),
  ('00000000-0000-4000-8000-000000000304', '00000000-0000-4000-8000-000000000102');

insert into public.products (id, name, kind, technique, is_sellable_online) values
  ('00000000-0000-4000-8000-000000000401', 'Extensión de cinta 55 cm', 'hair_extension', 'cinta', true),
  ('00000000-0000-4000-8000-000000000402', 'Cinta adhesiva de repuesto', 'supply', 'cinta', false);
insert into public.product_variants (id, product_id, sku, name, tone, length_cm, texture, unit, grams_per_unit, cost_cents, price_cents, min_stock) values
  ('00000000-0000-4000-8000-000000000411', '00000000-0000-4000-8000-000000000401', 'CIN-55-04', 'Cinta 55 cm · tono 4', '4', 55, 'lacio', 'pack', 50, 70000, 140000, 2),
  ('00000000-0000-4000-8000-000000000412', '00000000-0000-4000-8000-000000000401', 'CIN-55-613', 'Cinta 55 cm · tono 613', '613', 55, 'lacio', 'pack', 50, 75000, 150000, 2),
  ('00000000-0000-4000-8000-000000000421', '00000000-0000-4000-8000-000000000402', 'CINTA-REP', 'Cinta de repuesto (40 pzas)', null, null, null, 'pack', null, 8000, 25000, 3);
insert into public.service_materials (service_id, variant_id, material_role, quantity, is_variable) values
  ('00000000-0000-4000-8000-000000000302', '00000000-0000-4000-8000-000000000421', 'tape', 1, false),
  ('00000000-0000-4000-8000-000000000302', null, 'hair', 3, true),
  ('00000000-0000-4000-8000-000000000303', '00000000-0000-4000-8000-000000000421', 'tape', 1, false);

select app.apply_movement('00000000-0000-4000-8000-000000000411', '00000000-0000-4000-8000-000000000001', 'initial', 6);
select app.apply_movement('00000000-0000-4000-8000-000000000412', '00000000-0000-4000-8000-000000000001', 'initial', 2);
select app.apply_movement('00000000-0000-4000-8000-000000000421', '00000000-0000-4000-8000-000000000001', 'initial', 10);

insert into public.clients (first_name, last_name, phone, acquisition_channel, hair_tone) values
  ('Clienta', 'Demo Uno', '+520000000001', 'instagram', '4'),
  ('Clienta', 'Demo Dos', '+520000000002', 'whatsapp', '613');

-- Personal: crea primero las cuentas en Supabase Studio (Authentication → Users) y luego vincula:
--   insert into public.staff_members (user_id, location_id, display_name, role, is_bookable)
--   values ('<uuid de auth.users>', '00000000-0000-4000-8000-000000000001', 'Propietaria', 'owner', false);
-- Para estilistas: is_bookable = true, más staff_schedules y staff_services.
