import "server-only";
import {
  type AvailabilityRequest,
  findAvailableSlots,
  localWeekday,
  parsePgRange,
  resolveDaySchedule,
  type ServiceSpec,
  type Slot,
  type WeeklyTemplate,
} from "@palace/domain";
import type { createAdminClient } from "./supabase/admin";
import type { createClient } from "./supabase/server";
import { dayRange } from "./day";

/** Cliente con sesión (recepción) o cliente de servidor con llave secreta (portal público). */
type DB = Awaited<ReturnType<typeof createClient>> | ReturnType<typeof createAdminClient>;

const toRange = (t: string) => t.slice(0, 5);

type StaffSvc = { staff_id: string; duration_min: number | null };
type Req = { quantity: number; resource_types: { code: string } | { code: string }[] | null };
type SvcRow = {
  id: string;
  duration_min: number;
  prep_min: number;
  cleanup_min: number;
  cleanup_occupies_staff: boolean;
  buffer_min: number;
  staff_services: StaffSvc[] | null;
  service_resource_requirements: Req[] | null;
};

export interface LoadSlotsArgs {
  locationId: string;
  /** Un solo servicio (uso original). */
  serviceId?: string;
  /** Varios servicios consecutivos en la misma visita, en orden. Tiene prioridad sobre serviceId. */
  serviceIds?: string[];
  date: string;
  preferredStaffId?: string;
  /** Ignora la ocupación de esta cita (para reprogramarla sin que se estorbe a sí misma). */
  ignoreAppointmentId?: string;
  /** Anticipación mínima en minutos (portal: business_settings.booking_policy.min_lead_minutes). Por omisión 0. */
  minLeadMin?: number;
  /** Restringe el personal elegible (portal: solo personal activo y reservable). */
  allowedStaffIds?: string[];
}

/**
 * Carga los datos del día y calcula horarios. La base de datos vuelve a validar todo al
 * reservar (exclusión), así que una carrera entre consulta y reserva nunca produce doble reserva.
 */
export async function loadSlots(supabase: DB, args: LoadSlotsArgs): Promise<{ slots: Slot[]; error?: string }> {
  const ids = (args.serviceIds?.length ? args.serviceIds : args.serviceId ? [args.serviceId] : []).filter(Boolean);
  if (ids.length === 0) return { slots: [], error: "Selecciona al menos un servicio" };
  const unique = [...new Set(ids)];

  const [{ data: loc }, { data: svcRows }, { data: settings }] = await Promise.all([
    supabase.from("locations").select("timezone").eq("id", args.locationId).single(),
    supabase
      .from("services")
      .select("id, duration_min, prep_min, cleanup_min, cleanup_occupies_staff, buffer_min, staff_services(staff_id, duration_min), service_resource_requirements(quantity, resource_types(code))")
      .in("id", unique),
    supabase.from("business_settings").select("booking_policy").eq("id", 1).maybeSingle(),
  ]);
  const byId = new Map(((svcRows ?? []) as unknown as SvcRow[]).map((s) => [s.id, s]));
  if (!loc || unique.some((id) => !byId.has(id))) return { slots: [], error: "Servicio o sucursal no encontrados" };
  const tz = loc.timezone as string;
  const weekday = localWeekday(args.date);
  const { start, end } = dayRange(args.date);

  const services = ids.map((id) => byId.get(id)!);
  const staffIds = [...new Set(services.flatMap((s) => (s.staff_services ?? []).map((x) => x.staff_id)))].filter(
    (id) => !args.allowedStaffIds || args.allowedStaffIds.includes(id),
  );

  const [{ data: hours }, { data: special }, { data: schedules }, { data: busy }, { data: resources }] = await Promise.all([
    supabase.from("business_hours").select("opens_at, closes_at").eq("location_id", args.locationId).eq("weekday", weekday),
    supabase.from("special_days").select("is_closed, opens_at, closes_at").eq("location_id", args.locationId).eq("day", args.date).maybeSingle(),
    staffIds.length
      ? supabase.from("staff_schedules").select("staff_id, starts_at, ends_at").in("staff_id", staffIds).eq("weekday", weekday)
      : Promise.resolve({ data: [] as { staff_id: string; starts_at: string; ends_at: string }[] }),
    supabase.from("v_busy_allocations").select("staff_id, resource_id, occupied, appointment_id").overlaps("occupied", `[${start},${end})`),
    supabase.from("resources").select("id, resource_types(code)").eq("location_id", args.locationId).eq("is_active", true),
  ]);

  const weekly: WeeklyTemplate = { [weekday]: (hours ?? []).map((h) => ({ start: toRange(h.opens_at), end: toRange(h.closes_at) })) };
  const specialDays = special
    ? [{ date: args.date, ranges: special.is_closed ? null : [{ start: toRange(special.opens_at!), end: toRange(special.closes_at!) }] }]
    : [];
  const businessHours = resolveDaySchedule({ date: args.date, timeZone: tz, weekly, specialDays });
  const busyList = (busy ?? [])
    .filter((b) => !args.ignoreAppointmentId || b.appointment_id !== args.ignoreAppointmentId)
    .map((b) => ({ ...b, interval: parsePgRange(b.occupied as string) }));

  const specs: ServiceSpec[] = services.map((svc) => {
    const staffServices = svc.staff_services ?? [];
    const requiredTypes = (svc.service_resource_requirements ?? []).flatMap((r) => {
      const t = Array.isArray(r.resource_types) ? r.resource_types[0] : r.resource_types;
      return t ? Array.from({ length: r.quantity }, () => t.code) : [];
    });
    return {
      serviceId: svc.id,
      durationMin: svc.duration_min,
      durationByStaff: Object.fromEntries(staffServices.filter((s) => s.duration_min).map((s) => [s.staff_id, s.duration_min!])),
      prepMin: svc.prep_min,
      cleanupMin: svc.cleanup_min,
      cleanupOccupiesStaff: svc.cleanup_occupies_staff,
      bufferMin: svc.buffer_min,
      eligibleStaffIds: staffServices
        .map((s) => s.staff_id)
        .filter((id) => !args.allowedStaffIds || args.allowedStaffIds.includes(id)),
      // Si el servicio tiene personal capacitado pero ninguno es elegible (filtro), no hay horarios sin personal.
      requiresStaff: staffServices.length > 0,
      requiredResourceTypes: requiredTypes,
    };
  });
  const policy = (settings?.booking_policy ?? {}) as { min_lead_minutes?: number; slot_step_minutes?: number };

  const req: AvailabilityRequest = {
    services: specs,
    businessHours,
    staff: staffIds.map((id) => ({
      staffId: id,
      working: resolveDaySchedule({
        date: args.date,
        timeZone: tz,
        weekly: { [weekday]: (schedules ?? []).filter((s) => s.staff_id === id).map((s) => ({ start: toRange(s.starts_at), end: toRange(s.ends_at) })) },
        specialDays,
      }),
      busy: busyList.filter((b) => b.staff_id === id).map((b) => b.interval),
    })),
    resources: (resources ?? []).map((r) => {
      const t = Array.isArray(r.resource_types) ? r.resource_types[0] : r.resource_types;
      return {
        resourceId: r.id,
        type: (t as { code: string } | null)?.code ?? "",
        available: businessHours,
        busy: busyList.filter((b) => b.resource_id === r.id).map((b) => b.interval),
      };
    }),
    preferredStaffId: args.preferredStaffId,
    stepMin: policy.slot_step_minutes ?? 15,
    now: Date.now(),
    minLeadMin: args.minLeadMin ?? 0, // recepción puede agendar con poca anticipación; el portal pasa su política
    window: { start: Date.parse(start), end: Date.parse(end) },
  };
  return { slots: findAvailableSlots(req) };
}
