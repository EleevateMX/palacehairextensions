import { addDays, localToUtc } from "@palace/domain";
import { isIsoDate, TZ, todayLocal } from "./format";

/** Periodo de reporte en fechas locales del salón (ambos extremos incluidos). */
export interface Period {
  from: string;
  to: string;
}

export const MAX_PERIOD_DAYS = 366;

export function monthStart(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

export function monthEnd(date: string): string {
  const [y, m] = date.split("-").map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${date.slice(0, 7)}-${String(last).padStart(2, "0")}`;
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/**
 * Lee `desde`/`hasta` de la URL. Por omisión: el mes en curso (America/Mexico_City).
 * Si el rango es inválido o mayor a un año, regresa al mes en curso con un aviso.
 */
export function periodFromSearch(sp: { desde?: string | string[]; hasta?: string | string[] }): Period & { warning?: string } {
  const today = todayLocal();
  const def = { from: monthStart(today), to: monthEnd(today) };
  const desde = typeof sp.desde === "string" ? sp.desde : undefined;
  const hasta = typeof sp.hasta === "string" ? sp.hasta : undefined;
  if (!desde && !hasta) return def;
  const from = isIsoDate(desde) ? desde : def.from;
  const to = isIsoDate(hasta) ? hasta : def.to;
  if (Number.isNaN(Date.parse(from)) || Number.isNaN(Date.parse(to))) return { ...def, warning: "Fechas inválidas: se muestra el mes en curso." };
  if (from > to) return { ...def, warning: "La fecha inicial es posterior a la final: se muestra el mes en curso." };
  if (daysBetween(from, to) > MAX_PERIOD_DAYS) return { ...def, warning: "El periodo máximo es de un año: se muestra el mes en curso." };
  return { from, to };
}

/** Instantes UTC [inicio, fin) del periodo local. */
export function periodBounds(p: Period) {
  return {
    start: new Date(localToUtc(p.from, "00:00", TZ)).toISOString(),
    end: new Date(localToUtc(addDays(p.to, 1), "00:00", TZ)).toISOString(),
  };
}

export function presets(today = todayLocal()): { label: string; from: string; to: string }[] {
  const prevMonthDay = addDays(monthStart(today), -1);
  return [
    { label: "Este mes", from: monthStart(today), to: monthEnd(today) },
    { label: "Mes anterior", from: monthStart(prevMonthDay), to: monthEnd(prevMonthDay) },
    { label: "Últimos 30 días", from: addDays(today, -29), to: today },
    { label: "Hoy", from: today, to: today },
  ];
}

export const periodQuery = (p: Period) => new URLSearchParams({ desde: p.from, hasta: p.to }).toString();

export const shortDate = (date: string) =>
  new Intl.DateTimeFormat("es-MX", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" }).format(new Date(`${date}T00:00:00Z`));
