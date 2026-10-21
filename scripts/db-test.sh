#!/usr/bin/env bash
# Pruebas de base de datos contra un PostgreSQL local desechable.
# Uso: DATABASE_URL=postgres://... pnpm test:db   (por defecto crea la BD palace_test en localhost)
# La BD indicada se BORRA y recrea: nunca apuntar a un proyecto real.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PGHOST="${PGHOST:-/tmp}"
PGPORT="${PGPORT:-54329}"
PGUSER="${PGUSER:-postgres}"
DB="${PALACE_TEST_DB:-palace_test}"

case "$DB" in *test*) ;; *) echo "La BD de pruebas debe contener 'test' en el nombre" >&2; exit 1;; esac

export PGHOST PGPORT PGUSER
psql -q -d postgres -c "drop database if exists $DB" -c "create database $DB"
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$ROOT/supabase/tests/shim/supabase_shim.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do
  psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$f" >/dev/null || { echo "Falló migración $f" >&2; exit 1; }
done
echo "Migraciones aplicadas en $DB"
if [[ "$PGHOST" == /* ]]; then
  export DATABASE_URL="postgres://$PGUSER@localhost:$PGPORT/$DB?host=$PGHOST"
else
  export DATABASE_URL="postgres://$PGUSER:${PGPASSWORD:-}@$PGHOST:$PGPORT/$DB"
fi
cd "$ROOT/supabase/tests" && npx vitest run "$@"
