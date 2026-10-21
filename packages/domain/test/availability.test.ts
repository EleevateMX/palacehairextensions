import { describe, expect, it } from "vitest";
import {
  type AvailabilityRequest,
  findAvailableSlots,
  localToUtc,
  resolveDaySchedule,
  type ServiceSpec,
} from "../src";

const TZ = "America/Mexico_City";
const DAY = "2026-11-07"; // sábado
const at = (hhmm: string) => localToUtc(DAY, hhmm, TZ);
const fmt = (ms: number) =>
  new Intl.DateTimeFormat("es-MX", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(ms);

const install: ServiceSpec = {
  serviceId: "instalacion",
  durationMin: 120,
  cleanupMin: 20,
  eligibleStaffIds: ["ana", "bea"],
  requiredResourceTypes: ["estacion"],
};

function baseRequest(overrides: Partial<AvailabilityRequest> = {}): AvailabilityRequest {
  return {
    services: [install],
    businessHours: [{ start: at("10:00"), end: at("19:00") }],
    staff: [
      { staffId: "ana", working: [{ start: at("10:00"), end: at("19:00") }], busy: [] },
      { staffId: "bea", working: [{ start: at("10:00"), end: at("19:00") }], busy: [] },
    ],
    resources: [{ resourceId: "est-1", type: "estacion", available: [{ start: at("10:00"), end: at("19:00") }], busy: [] }],
    now: at("08:00"),
    window: { start: at("10:00"), end: at("19:00") },
    stepMin: 15,
    ...overrides,
  };
}

describe("motor de disponibilidad", () => {
  it("convierte hora local de Ciudad de México a UTC (UTC-6, sin horario de verano)", () => {
    expect(new Date(at("10:00")).toISOString()).toBe("2026-11-07T16:00:00.000Z");
  });

  it("no permite usar la estación antes de terminar la limpieza (ejemplo 15:00 → 15:20)", () => {
    // Otra estilista termina una instalación en est-1 a las 15:00; limpieza hasta 15:20.
    const req = baseRequest({
      resources: [
        { resourceId: "est-1", type: "estacion", available: [{ start: at("10:00"), end: at("19:00") }], busy: [{ start: at("13:00"), end: at("15:20") }] },
      ],
    });
    const starts = findAvailableSlots(req).map((s) => fmt(s.start));
    expect(starts).not.toContain("15:00");
    expect(starts).not.toContain("15:15");
    expect(starts).toContain("15:30");
    // 120 min + 20 limpieza debe caber antes de las 13:00 → último inicio 10:40 → con paso 15: 10:30
    expect(starts).toContain("10:30");
    expect(starts).not.toContain("10:45");
  });

  it("la cita visible debe terminar dentro del horario del negocio (fuera de horario no se ofrece)", () => {
    // Recurso disponible hasta las 20:00 para aislar la regla del horario del negocio (cierra 19:00).
    const req = baseRequest({
      resources: [{ resourceId: "est-1", type: "estacion", available: [{ start: at("10:00"), end: at("20:00") }], busy: [] }],
    });
    const starts = findAvailableSlots(req).map((s) => fmt(s.start));
    expect(starts[0]).toBe("10:00");
    expect(starts).toContain("17:00"); // 17:00–19:00 visible; limpieza 19:00–19:20 fuera de la vista de la clienta
    expect(starts).not.toContain("17:15"); // terminaría 19:15, después del cierre
  });

  it("respeta la disponibilidad del recurso incluyendo la limpieza", () => {
    const starts = findAvailableSlots(baseRequest()).map((s) => fmt(s.start));
    // Recurso disponible hasta 19:00 → bloque de recurso (inicio … fin+20) debe terminar ≤ 19:00 → último inicio 16:40 → 16:30
    expect(starts[starts.length - 1]).toBe("16:30");
  });

  it("respeta descansos y ausencias del personal", () => {
    const anaWorking = resolveDaySchedule({
      date: DAY,
      timeZone: TZ,
      weekly: { 6: [{ start: "10:00", end: "19:00" }] },
      exclusions: [{ start: at("14:00"), end: at("15:00") }], // comida
    });
    const req = baseRequest({
      preferredStaffId: "ana",
      staff: [{ staffId: "ana", working: anaWorking, busy: [] }],
      resources: [{ resourceId: "est-1", type: "estacion", available: [{ start: at("10:00"), end: at("20:00") }], busy: [] }],
    });
    const starts = findAvailableSlots(req).map((s) => fmt(s.start));
    expect(starts).toContain("12:00");
    expect(starts).not.toContain("12:15"); // invadiría la comida
    expect(starts).toContain("15:00");
  });

  it("festivo: sin horario no hay disponibilidad", () => {
    const hours = resolveDaySchedule({
      date: DAY,
      timeZone: TZ,
      weekly: { 6: [{ start: "10:00", end: "19:00" }] },
      specialDays: [{ date: DAY, ranges: null }],
    });
    expect(hours).toEqual([]);
    expect(findAvailableSlots(baseRequest({ businessHours: hours }))).toEqual([]);
  });

  it("si una estilista está ocupada asigna a otra capacitada", () => {
    const req = baseRequest({
      staff: [
        { staffId: "ana", working: [{ start: at("10:00"), end: at("19:00") }], busy: [{ start: at("10:00"), end: at("13:00") }] },
        { staffId: "bea", working: [{ start: at("10:00"), end: at("19:00") }], busy: [] },
      ],
    });
    const first = findAvailableSlots(req)[0]!;
    expect(fmt(first.start)).toBe("10:00");
    expect(first.assignments[0]!.staffId).toBe("bea");
  });

  it("duración variable por empleada", () => {
    const req = baseRequest({
      services: [{ ...install, durationByStaff: { bea: 90 } }],
      preferredStaffId: "bea",
    });
    const slot = findAvailableSlots(req)[0]!;
    expect((slot.end - slot.start) / 60000).toBe(90);
  });

  it("múltiples servicios consecutivos en la misma visita usan recursos distintos", () => {
    const wash: ServiceSpec = { serviceId: "lavado", durationMin: 30, eligibleStaffIds: ["bea"], requiredResourceTypes: ["lavacabezas"] };
    const req = baseRequest({
      services: [wash, install],
      resources: [
        { resourceId: "est-1", type: "estacion", available: [{ start: at("10:00"), end: at("19:00") }], busy: [] },
        { resourceId: "lava-1", type: "lavacabezas", available: [{ start: at("10:00"), end: at("19:00") }], busy: [] },
      ],
    });
    const slot = findAvailableSlots(req)[0]!;
    expect(slot.assignments.map((a) => a.serviceId)).toEqual(["lavado", "instalacion"]);
    expect(slot.assignments[1]!.start).toBe(slot.assignments[0]!.end);
    expect(fmt(slot.end)).toBe("12:30");
  });

  it("no ofrece horarios en el pasado ni antes del tiempo mínimo de anticipación", () => {
    const starts = findAvailableSlots(baseRequest({ now: at("11:05"), minLeadMin: 60 })).map((s) => fmt(s.start));
    expect(starts[0]).toBe("12:15");
  });

  it("dos unidades del mismo tipo de recurso permiten dos citas simultáneas", () => {
    const req = baseRequest({
      resources: [
        { resourceId: "est-1", type: "estacion", available: [{ start: at("10:00"), end: at("19:00") }], busy: [{ start: at("10:00"), end: at("12:20") }] },
        { resourceId: "est-2", type: "estacion", available: [{ start: at("10:00"), end: at("19:00") }], busy: [] },
      ],
    });
    const first = findAvailableSlots(req)[0]!;
    expect(first.assignments[0]!.resourceIds).toEqual(["est-2"]);
  });
});
