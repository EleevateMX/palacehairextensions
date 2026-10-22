-- Funciones que solo debe llamar el servidor (service_role): ni anon ni personal autenticado.
-- Ya validaban app.is_service_role(); esto agrega una segunda barrera a nivel de permisos.
revoke execute on function public.portal_book(jsonb) from public, anon, authenticated;
revoke execute on function public.ingest_webhook_event(text, text, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.portal_book(jsonb) to service_role;
grant execute on function public.ingest_webhook_event(text, text, jsonb, boolean) to service_role;
