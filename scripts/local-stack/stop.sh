#!/usr/bin/env bash
OFF="${STACK_OFFSET:-0}"
RUN="${PALACE_RUN_DIR:-/tmp/palace-local-run$([ "$OFF" = 0 ] || echo "-$OFF")}"
for p in gateway postgrest auth; do [ -f "$RUN/$p.pid" ] && kill "$(cat "$RUN/$p.pid")" 2>/dev/null; rm -f "$RUN/$p.pid"; done
echo "Stack local detenido"
