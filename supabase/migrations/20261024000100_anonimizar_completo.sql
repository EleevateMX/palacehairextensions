-- =============================================================================
-- Anonimización completa: además de borrar datos personales, libera el inventario
-- apartado para la clienta y cierra recordatorios y lista de espera pendientes.
-- =============================================================================
create or replace function public.anonymize_client(p_client uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r record;
begin
  perform app.require_role('owner', 'admin');
  -- Apartados manuales (no ligados a una cita futura): se liberan.
  for r in select id from public.stock_reservations
            where client_id = p_client and status = 'active' and appointment_id is null loop
    perform app.release_reservation_internal(r.id, 'released');
  end loop;
  update public.maintenance_reminders set status = 'dismissed' where client_id = p_client and status in ('pending', 'sent');
  update public.waitlist_entries set status = 'cancelled' where client_id = p_client and status in ('waiting', 'offered');
  update public.clients set
    first_name = 'Anonimizada', last_name = null, phone = null, email = null, birth_date = null,
    style_preferences = null, maintenance_notes = null, hair_tone = null, auth_user_id = null,
    is_anonymized = true
  where id = p_client;
  delete from public.client_notes where client_id = p_client;
  -- Las fotos deben borrarse también del bucket (Edge Function de mantenimiento; ver docs/06).
  delete from public.client_photos where client_id = p_client;
  perform app.audit_event('clients', p_client::text, jsonb_build_object('action', 'anonymize'));
end $$;
revoke execute on function public.anonymize_client(uuid) from public, anon;
grant execute on function public.anonymize_client(uuid) to authenticated, service_role;
