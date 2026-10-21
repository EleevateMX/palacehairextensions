#!/usr/bin/env bash
# Levanta un Supabase mínimo LOCAL (PostgreSQL + Auth + PostgREST + puerta) para desarrollo y pruebas E2E.
# No usa Docker. La base indicada se BORRA y recrea. Nunca apuntar a un proyecto real.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HERE="$ROOT/scripts/local-stack"
BIN="${PALACE_BIN:-/opt/palace-local}"
export PGHOST="${PGHOST:-/tmp}" PGPORT="${PGPORT:-54329}" PGUSER="${PGUSER:-postgres}"
DB="${PALACE_LOCAL_DB:-palace_local}"
RUN="${PALACE_RUN_DIR:-/tmp/palace-local-run}"
JWT_SECRET="super-secret-jwt-token-with-at-least-32-characters-long"   # solo local
PGTCP="postgres://%s@127.0.0.1:$PGPORT/$DB"

case "$DB" in *local*|*e2e*|*test*) ;; *) echo "Nombre de BD no permitido: $DB" >&2; exit 1;; esac
mkdir -p "$RUN"
"$HERE/stop.sh" >/dev/null 2>&1 || true
bash "$HERE/download.sh" >/dev/null

psql -q -d postgres -c "drop database if exists $DB" -c "create database $DB"
psql -q -v ON_ERROR_STOP=1 -d "$DB" <<SQL
do \$\$ begin
  if not exists (select 1 from pg_roles where rolname='supabase_auth_admin') then create role supabase_auth_admin login createrole noinherit; end if;
  if not exists (select 1 from pg_roles where rolname='authenticator') then create role authenticator login noinherit; end if;
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin noinherit bypassrls; end if;
end \$\$;
grant anon, authenticated, service_role to authenticator;
create schema if not exists auth authorization supabase_auth_admin;
grant create on database $DB to supabase_auth_admin;
SQL

# Esquema de Auth con las migraciones oficiales del servicio.
export GOTRUE_DB_DRIVER=postgres
export DATABASE_URL="$(printf "$PGTCP" supabase_auth_admin)?search_path=auth"
export GOTRUE_DB_MIGRATIONS_PATH="$BIN/migrations"
export GOTRUE_SITE_URL="${SITE_URL:-http://127.0.0.1:3000}" API_EXTERNAL_URL="http://127.0.0.1:54321/auth/v1"
export GOTRUE_JWT_SECRET="$JWT_SECRET" GOTRUE_JWT_EXP=3600 GOTRUE_JWT_AUD=authenticated
export GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated GOTRUE_JWT_ADMIN_ROLES=service_role
export GOTRUE_DISABLE_SIGNUP=true GOTRUE_MAILER_AUTOCONFIRM=true GOTRUE_EXTERNAL_EMAIL_ENABLED=true
export GOTRUE_API_HOST=127.0.0.1 PORT=9999 GOTRUE_LOG_LEVEL=warn
"$BIN/auth" migrate >"$RUN/auth-migrate.log" 2>&1 || { cat "$RUN/auth-migrate.log"; exit 1; }

psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$ROOT/supabase/tests/shim/supabase_shim.sql" >/dev/null
for f in "$ROOT"/supabase/migrations/*.sql; do
  psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$f" >/dev/null 2>&1 || { echo "Falló $f" >&2; psql -v ON_ERROR_STOP=1 -d "$DB" -f "$f"; exit 1; }
done
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$ROOT/supabase/seed.sql" >/dev/null

nohup "$BIN/auth" serve >"$RUN/auth.log" 2>&1 & echo $! >"$RUN/auth.pid"
cat >"$RUN/postgrest.conf" <<CONF
db-uri = "$(printf "$PGTCP" authenticator)"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "$JWT_SECRET"
server-host = "127.0.0.1"
server-port = 3001
CONF
nohup "$BIN/postgrest" "$RUN/postgrest.conf" >"$RUN/postgrest.log" 2>&1 & echo $! >"$RUN/postgrest.pid"
nohup node "$HERE/gateway.mjs" >"$RUN/gateway.log" 2>&1 & echo $! >"$RUN/gateway.pid"

ANON=$(node "$HERE/jwt.mjs" anon "$JWT_SECRET")
SERVICE=$(node "$HERE/jwt.mjs" service_role "$JWT_SECRET")
for i in $(seq 1 40); do curl -sf http://127.0.0.1:54321/auth/v1/health >/dev/null && curl -sf -H "apikey: $ANON" http://127.0.0.1:54321/rest/v1/ >/dev/null && break; sleep 0.5; done

cat >"$RUN/env" <<ENV
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$ANON
SUPABASE_SECRET_KEY=$SERVICE
ENV
node "$HERE/create-users.mjs" "$RUN/env"
echo "Stack local listo. Variables en $RUN/env"
