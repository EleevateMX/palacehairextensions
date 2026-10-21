#!/usr/bin/env bash
# Descarga los binarios oficiales del servicio de Auth de Supabase y de PostgREST (solo desarrollo/E2E).
set -euo pipefail
BIN="${PALACE_BIN:-/opt/palace-local}"
AUTH_VERSION="${AUTH_VERSION:-v2.185.0}"
PGRST_VERSION="${PGRST_VERSION:-v13.0.7}"
mkdir -p "$BIN" && cd "$BIN"
[ -x auth ] || { curl -sSfL -o auth.tgz "https://github.com/supabase/auth/releases/download/$AUTH_VERSION/auth-$AUTH_VERSION-x86.tar.gz" && tar xzf auth.tgz && rm auth.tgz; }
[ -x postgrest ] || { curl -sSfL -o pgrst.tar.xz "https://github.com/PostgREST/postgrest/releases/download/$PGRST_VERSION/postgrest-$PGRST_VERSION-linux-static-x86-64.tar.xz" && tar xJf pgrst.tar.xz && rm pgrst.tar.xz; }
echo "Binarios listos en $BIN"
