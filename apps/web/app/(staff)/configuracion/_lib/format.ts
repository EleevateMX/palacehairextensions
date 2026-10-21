import { TZ } from "@/lib/format";

/** "10:00:00" → "10:00" */
export const hhmm = (t: string | null | undefined) => (t ? t.slice(0, 5) : "");

export const dateTime = (iso: string) =>
  new Intl.DateTimeFormat("es-MX", { timeZone: TZ, dateStyle: "medium", timeStyle: "short", hourCycle: "h23" }).format(new Date(iso));

export const shortDate = (date: string) =>
  new Intl.DateTimeFormat("es-MX", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(
    new Date(`${date}T00:00:00Z`),
  );
