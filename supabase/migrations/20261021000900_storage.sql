-- =============================================================================
-- Supabase Storage: catálogo público y fotografías de clientas privadas.
-- Se omite si el esquema storage no existe (entorno de pruebas sin Supabase).
-- =============================================================================
do $$
begin
  if not exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    raise notice 'storage no disponible: se omiten buckets';
    return;
  end if;

  insert into storage.buckets (id, name, public) values ('catalog', 'catalog', true) on conflict (id) do nothing;
  insert into storage.buckets (id, name, public) values ('client-photos', 'client-photos', false) on conflict (id) do nothing;

  execute $p$create policy catalog_write on storage.objects for all to authenticated
    using (bucket_id = 'catalog' and app.has_role('owner', 'admin', 'inventory'))
    with check (bucket_id = 'catalog' and app.has_role('owner', 'admin', 'inventory'))$p$;

  -- Ruta: client-photos/<client_id>/<archivo>. Acceso alineado con public.client_photos.
  execute $p$create policy client_photos_read on storage.objects for select to authenticated
    using (bucket_id = 'client-photos' and (app.has_role('owner', 'admin')
           or (app.has_role('stylist') and app.staff_serves_client(((storage.foldername(name))[1])::uuid))))$p$;
  execute $p$create policy client_photos_write on storage.objects for insert to authenticated
    with check (bucket_id = 'client-photos'
      and app.client_has_consent(((storage.foldername(name))[1])::uuid, 'photos_internal')
      and (app.has_role('owner', 'admin', 'receptionist')
           or (app.has_role('stylist') and app.staff_serves_client(((storage.foldername(name))[1])::uuid))))$p$;
end $$;
