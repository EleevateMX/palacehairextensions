import { type Interval, MINUTE, contains, overlaps } from "./time";

/**
 * Motor de disponibilidad.
 *
 * Calcula horarios válidos para una visita de uno o más servicios consecutivos,
 * respetando horario del negocio, turnos y ausencias del personal, recursos físicos
 * (sillas, estaciones, lavacabezas), tiempos de preparación, limpieza y margen.
 *
 * Este motor SOLO propone horarios. La garantía contra doble reserva vive en la base
 * de datos (restricciones de exclusión sobre `appointment_allocations`); ver docs/07.
 */

export interface ServiceSpec {
  serviceId: string;
  /** Duración base visible para la clienta (min). */
  durationMin: number;
  /** Duración específica por empleado (p. ej. estilista senior más rápida). */
  durationByStaff?: Record<string, number>;
  /** Preparación previa: ocupa personal y recursos antes del inicio visible. */
  prepMin?: number;
  /** Limpieza posterior: ocupa recursos (y opcionalmente personal). */
  cleanupMin?: number;
  cleanupOccupiesStaff?: boolean;
  /** Margen adicional del personal entre citas. */
  bufferMin?: number;
  /** Personal capacitado. Vacío y requiresStaff=false => servicio sin personal (p. ej. procesado). */
  eligibleStaffIds: string[];
  requiresStaff?: boolean;
  /** Tipos de recurso requeridos; se asigna una unidad de cada tipo. */
  requiredResourceTypes?: string[];
}

export interface StaffAvailability {
  staffId: string;
  /** Intervalos de trabajo del día ya sin descansos/ausencias. */
  working: Interval[];
  /** Ocupación existente (citas, bloqueos). */
  busy: Interval[];
}

export interface ResourceUnit {
  resourceId: string;
  type: string;
  available: Interval[];
  busy: Interval[];
}

export interface AvailabilityRequest {
  services: ServiceSpec[];
  businessHours: Interval[];
  staff: StaffAvailability[];
  resources: ResourceUnit[];
  /** Restringe el primer servicio (o todos) a una especialista elegida por la clienta. */
  preferredStaffId?: string;
  /** Si true, todos los servicios deben ser con la misma persona. */
  sameStaffForAll?: boolean;
  stepMin?: number;
  now: number;
  minLeadMin?: number;
  /** Rango de búsqueda (normalmente un día). */
  window: Interval;
}

export interface Assignment {
  serviceId: string;
  staffId: string | null;
  resourceIds: string[];
  /** Ventana visible para la clienta. */
  start: number;
  end: number;
  /** Ocupación real del personal y de los recursos (incluye preparación/limpieza). */
  staffBlock: Interval | null;
  resourceBlock: Interval;
}

export interface Slot {
  start: number;
  end: number;
  assignments: Assignment[];
}

function isFree(block: Interval, available: Interval[], busy: Interval[]): boolean {
  return available.some((a) => contains(a, block)) && !busy.some((b) => overlaps(b, block));
}

function durationFor(spec: ServiceSpec, staffId: string | null): number {
  if (staffId && spec.durationByStaff?.[staffId] !== undefined) return spec.durationByStaff[staffId]!;
  return spec.durationMin;
}

export function computeBlocks(spec: ServiceSpec, staffId: string | null, start: number) {
  const dur = durationFor(spec, staffId) * MINUTE;
  const prep = (spec.prepMin ?? 0) * MINUTE;
  const cleanup = (spec.cleanupMin ?? 0) * MINUTE;
  const buffer = (spec.bufferMin ?? 0) * MINUTE;
  const end = start + dur;
  const staffEnd = end + (spec.cleanupOccupiesStaff ? cleanup : 0) + buffer;
  return {
    end,
    staffBlock: { start: start - prep, end: staffEnd },
    resourceBlock: { start: start - prep, end: end + cleanup },
  };
}

interface Ctx {
  req: AvailabilityRequest;
  staffMap: Map<string, StaffAvailability>;
  extraStaffBusy: Map<string, Interval[]>;
  extraResBusy: Map<string, Interval[]>;
}

function pickResources(ctx: Ctx, types: string[], block: Interval): string[] | null {
  const chosen: string[] = [];
  for (const type of types) {
    const unit = ctx.req.resources.find(
      (r) =>
        r.type === type &&
        !chosen.includes(r.resourceId) &&
        isFree(block, r.available, [...r.busy, ...(ctx.extraResBusy.get(r.resourceId) ?? [])]),
    );
    if (!unit) return null;
    chosen.push(unit.resourceId);
  }
  return chosen;
}

function assign(ctx: Ctx, index: number, start: number, firstStaff: string | null): Assignment[] | null {
  const spec = ctx.req.services[index];
  if (!spec) return [];
  const needsStaff = spec.requiresStaff ?? spec.eligibleStaffIds.length > 0;

  let candidates: (string | null)[] = needsStaff ? [...spec.eligibleStaffIds] : [null];
  if (needsStaff && ctx.req.preferredStaffId && (index === 0 || ctx.req.sameStaffForAll)) {
    candidates = candidates.filter((s) => s === ctx.req.preferredStaffId);
  }
  if (needsStaff && ctx.req.sameStaffForAll && firstStaff) candidates = candidates.filter((s) => s === firstStaff);

  for (const staffId of candidates) {
    const { end, staffBlock, resourceBlock } = computeBlocks(spec, staffId, start);
    // La ventana visible debe caer dentro del horario del negocio.
    if (!ctx.req.businessHours.some((h) => contains(h, { start, end }))) continue;
    if (staffId) {
      const st = ctx.staffMap.get(staffId);
      if (!st) continue;
      if (!isFree(staffBlock, st.working, [...st.busy, ...(ctx.extraStaffBusy.get(staffId) ?? [])])) continue;
    }
    const resourceIds = pickResources(ctx, spec.requiredResourceTypes ?? [], resourceBlock);
    if (!resourceIds) continue;

    // Reservar tentativamente para los siguientes servicios de la misma visita.
    if (staffId) ctx.extraStaffBusy.set(staffId, [...(ctx.extraStaffBusy.get(staffId) ?? []), staffBlock]);
    for (const r of resourceIds) ctx.extraResBusy.set(r, [...(ctx.extraResBusy.get(r) ?? []), resourceBlock]);

    const rest = assign(ctx, index + 1, end, firstStaff ?? staffId);
    if (rest) {
      return [
        { serviceId: spec.serviceId, staffId, resourceIds, start, end, staffBlock: staffId ? staffBlock : null, resourceBlock },
        ...rest,
      ];
    }
    if (staffId) ctx.extraStaffBusy.get(staffId)!.pop();
    for (const r of resourceIds) ctx.extraResBusy.get(r)!.pop();
  }
  return null;
}

/**
 * Devuelve los horarios de inicio válidos (uno por hora de inicio) con su asignación propuesta.
 */
export function findAvailableSlots(req: AvailabilityRequest): Slot[] {
  if (req.services.length === 0) return [];
  const step = (req.stepMin ?? 15) * MINUTE;
  const earliest = req.now + (req.minLeadMin ?? 0) * MINUTE;
  const staffMap = new Map(req.staff.map((s) => [s.staffId, s]));
  const slots: Slot[] = [];

  // Alinear al paso desde el inicio de la ventana.
  for (let t = req.window.start; t < req.window.end; t += step) {
    if (t < earliest) continue;
    const ctx: Ctx = { req, staffMap, extraStaffBusy: new Map(), extraResBusy: new Map() };
    const assignments = assign(ctx, 0, t, null);
    if (assignments && assignments.length === req.services.length) {
      slots.push({ start: t, end: assignments[assignments.length - 1]!.end, assignments });
    }
  }
  return slots;
}
