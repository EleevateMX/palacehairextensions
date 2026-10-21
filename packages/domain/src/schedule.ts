import { type Interval, localToUtc, localWeekday, subtractIntervals, mergeIntervals } from "./time";

/** Franja local HH:MM–HH:MM. */
export interface LocalRange {
  start: string;
  end: string;
}

/** Plantilla semanal: índice 0 = domingo. Arreglo vacío = cerrado. */
export type WeeklyTemplate = Record<number, LocalRange[]>;

export interface SpecialDay {
  date: string; // YYYY-MM-DD
  /** null = cerrado todo el día (festivo); arreglo = horario especial. */
  ranges: LocalRange[] | null;
}

export interface DayScheduleInput {
  date: string;
  timeZone: string;
  weekly: WeeklyTemplate;
  specialDays?: SpecialDay[];
  /** Intervalos UTC a excluir: descansos, ausencias, vacaciones, bloqueos manuales. */
  exclusions?: Interval[];
}

/**
 * Resuelve los intervalos UTC disponibles de un día (negocio, empleado o recurso),
 * aplicando plantilla semanal, días especiales/festivos y exclusiones.
 */
export function resolveDaySchedule(input: DayScheduleInput): Interval[] {
  const special = input.specialDays?.find((s) => s.date === input.date);
  const ranges = special ? (special.ranges ?? []) : (input.weekly[localWeekday(input.date)] ?? []);
  const base = ranges.map((r) => ({
    start: localToUtc(input.date, r.start, input.timeZone),
    end: localToUtc(input.date, r.end, input.timeZone),
  }));
  return subtractIntervals(mergeIntervals(base), input.exclusions ?? []);
}
