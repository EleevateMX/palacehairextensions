-- La API (PostgREST) solo expone public y graphql_public. Un ajuste heredado del proyecto anterior
-- en el rol authenticator exponía un esquema que ya no existe y dejaba la API en 503 (PGRST002).
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticator') then
    execute $q$alter role authenticator set pgrst.db_schemas = 'public, graphql_public'$q$;
    perform pg_notify('pgrst', 'reload config');
  end if;
end $$;
