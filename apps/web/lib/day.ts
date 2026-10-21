import { addDays, localToUtc } from "@palace/domain";
import { TZ } from "./format";

/** Rango UTC [inicio, fin) del día local. */
export function dayRange(date: string) {
  return {
    start: new Date(localToUtc(date, "00:00", TZ)).toISOString(),
    end: new Date(localToUtc(addDays(date, 1), "00:00", TZ)).toISOString(),
  };
}
