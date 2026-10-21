/**
 * Utilidades de tiempo. Internamente todo se maneja en milisegundos UTC.
 * Los horarios del negocio se configuran en hora local (zona IANA, p. ej. America/Mexico_City).
 */
export const MINUTE = 60_000;

export interface Interval {
  start: number; // ms UTC, inclusivo
  end: number; // ms UTC, exclusivo
}

export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

export function contains(outer: Interval, inner: Interval): boolean {
  return outer.start <= inner.start && inner.end <= outer.end;
}

/** Une intervalos que se tocan o traslapan. Devuelve una lista ordenada. */
export function mergeIntervals(list: Interval[]): Interval[] {
  const sorted = [...list].filter((i) => i.end > i.start).sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const cur of sorted) {
    const last = out[out.length - 1];
    if (last && cur.start <= last.end) last.end = Math.max(last.end, cur.end);
    else out.push({ ...cur });
  }
  return out;
}

/** Resta `cuts` de `base`. */
export function subtractIntervals(base: Interval[], cuts: Interval[]): Interval[] {
  let result = mergeIntervals(base);
  for (const cut of mergeIntervals(cuts)) {
    const next: Interval[] = [];
    for (const b of result) {
      if (!overlaps(b, cut)) {
        next.push(b);
        continue;
      }
      if (b.start < cut.start) next.push({ start: b.start, end: cut.start });
      if (cut.end < b.end) next.push({ start: cut.end, end: b.end });
    }
    result = next;
  }
  return result;
}

/** Intersección de dos listas de intervalos. */
export function intersectIntervals(a: Interval[], b: Interval[]): Interval[] {
  const A = mergeIntervals(a);
  const B = mergeIntervals(b);
  const out: Interval[] = [];
  let i = 0;
  let j = 0;
  while (i < A.length && j < B.length) {
    const x = A[i]!;
    const y = B[j]!;
    const start = Math.max(x.start, y.start);
    const end = Math.min(x.end, y.end);
    if (start < end) out.push({ start, end });
    if (x.end < y.end) i++;
    else j++;
  }
  return out;
}

/** Desfase (ms) de la zona `timeZone` respecto a UTC en el instante `utcMs`. */
export function tzOffsetMs(utcMs: number, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(dtf.formatToParts(new Date(utcMs)).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/**
 * Convierte una fecha local (YYYY-MM-DD) y hora local (HH:MM) de `timeZone` a ms UTC.
 * Maneja cambios de horario iterando sobre el desfase.
 */
export function localToUtc(date: string, time: string, timeZone: string): number {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const [hh, mm] = time.split(":").map(Number) as [number, number];
  const naive = Date.UTC(y, m - 1, d, hh, mm);
  let guess = naive - tzOffsetMs(naive, timeZone);
  const offset2 = tzOffsetMs(guess, timeZone);
  guess = naive - offset2;
  return guess;
}

/** Fecha local YYYY-MM-DD de un instante UTC en la zona indicada. */
export function utcToLocalDate(utcMs: number, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(utcMs),
  );
}

/** Día de la semana local (0 = domingo … 6 = sábado). */
export function localWeekday(date: string): number {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}
