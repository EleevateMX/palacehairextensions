import type { Interval } from "./time";

/** Normaliza timestamps de PostgreSQL ("2030-01-05 16:00:00+00") a ISO 8601 parseable. */
export function parsePgTimestamp(s: string): number {
  let iso = s.trim().replace(" ", "T");
  if (/[+-]\d{2}$/.test(iso)) iso += ":00";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) throw new Error(`Timestamp inválido: ${s}`);
  return ms;
}

/** Parsea un tstzrange de texto, p. ej. ["2030-01-05 16:00:00+00","2030-01-05 18:20:00+00"). Solo rangos [) finitos. */
export function parsePgRange(r: string): Interval {
  const m = /^\[\s*"?([^",]+)"?\s*,\s*"?([^",)]+)"?\s*\)$/.exec(r.trim());
  if (!m) throw new Error(`Rango no soportado: ${r}`);
  return { start: parsePgTimestamp(m[1]!), end: parsePgTimestamp(m[2]!) };
}
