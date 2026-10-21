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

/**
 * Carga los datos del día y calcula horarios. La base de datos vuelve a validar todo al
 * reservar (exclusión), así que una carrera entre consulta y reserva nunca produce doble reserva.
 */
export async function loadSlots(
  supabase: DB,
  args: {
    locationId: string;
    serviceId: string;
    date: string;
    preferredStaffId?: string;
    /** Anticipación mínima en minutos (portal: business_settings.booking_policy.min_lead_minutes). Por omisión 0. */
    minLeadMin?: number;
    /** Restringe el personal elegible (portal: solo personal activo y reservable). */
    allowedStaffIds?: string[];
  },
): Promise<{ slots: Slot[]; error?: string }> {
  const [{ data: loc }, { data: svc }, { data: settings }] = await Promise.all([
    supabase.from("locations").select("timezone").eq("id", args.locationId).single(),
    supabase
      .from("services")
      .select("id, duration_min, prep_min, cleanup_min, cleanup_occupies_staff, buffer_min, staff_services(staff_id, duration_min), service_resource_requirements(quantity, resource_types(code))")
      .eq("id", args.serviceId)
      .single(),
    supabase.from("business_settings").select("booking_policy").eq("id", 1).maybeSingle(),
  ]);
  if (!loc || !svc) return { slots: [], error: "Servicio o sucursal no encontrados" };
  const tz = loc.timezone as string;
  const weekday = localWeekday(args.date);
  const { start, end } = dayRange(args.date);

  type StaffSvc = { staff_id: string; duration_min: number | null };
  type Req = { quantity: number; resource_types: { code: string } | { code: string }[] | null };
  const staffServices = (svc.staff_services ?? []) as StaffSvc[];
  const staffIds = staffServices
    .map((s) => s.staff_id)
    .filter((id) => !args.allowedStaffIds || args.allowedStaffIds.includes(id));
  const reqs = (svc.service_resource_requirements ?? []) as Req[];
  const requiredTypes = reqs.flatMap((r) => {
    const t = Array.isArray(r.resource_types) ? r.resource_types[0] : r.resource_types;
    return t ? Array.from({ length: r.quantity }, () => t.code) : [];
  });

  const [{ data: hours }, { data: special }, { data: schedules }, { data: busy }, { data: resources }] = await Promise.all([
    supabase.from("business_hours").select("opens_at, closes_at").eq("location_id", args.locationId).eq("weekday", weekday),
    supabase.from("special_days").select("is_closed, opens_at, closes_at").eq("location_id", args.locationId).eq("day", args.date).maybeSingle(),
    staffIds.length
      ? supabase.from("staff_schedules").select("staff_id, starts_at, ends_at").in("staff_id", staffIds).eq("weekday", weekday)
      : Promise.resolve({ data: [] as { staff_id: string; starts_at: string; ends_at: string }[] }),
    supabase.from("v_busy_allocations").select("staff_id, resource_id, occupied").overlaps("occupied", `[${start},${end})`),
    supabase.from("resources").select("id, resource_types(code)").eq("location_id", args.locationId).eq("is_active", true),
  ]);

  const weekly: WeeklyTemplate = { [weekday]: (hours ?? []).map((h) => ({ start: toRange(h.opens_at), end: toRange(h.closes_at) })) };
  const specialDays = special
    ? [{ date: args.date, ranges: special.is_closed ? null : [{ start: toRange(special.opens_at!), end: toRange(special.closes_at!) }] }]
    : [];
  const businessHours = resolveDaySchedule({ date: args.date, timeZone: tz, weekly, specialDays });
  const busyList = (busy ?? []).map((b) => ({ ...b, interval: parsePgRange(b.occupied as string) }));

  const spec: ServiceSpec = {
    serviceId: svc.id,
    durationMin: svc.duration_min,
    durationByStaff: Object.fromEntries(staffServices.filter((s) => s.duration_min).map((s) => [s.staff_id, s.duration_min!])),
    prepMin: svc.prep_min,
    cleanupMin: svc.cleanup_min,
    cleanupOccupiesStaff: svc.cleanup_occupies_staff,
    bufferMin: svc.buffer_min,
    eligibleStaffIds: staffIds,
    // Si el servicio tiene personal capacitado pero ninguno es elegible (filtro), no hay horarios sin personal.
    requiresStaff: staffServices.length > 0,
    requiredResourceTypes: requiredTypes,
  };
  const policy = (settings?.booking_policy ?? {}) as { min_lead_minutes?: number; slot_step_minutes?: number };

  const req: AvailabilityRequest = {
    services: [spec],
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
    minLeadMin: args.minLeadMin ?? 0, // recepción puede agendar con poca anticipación; el portal pasa policy.min_lead_minutes
    window: { start: Date.parse(start), end: Date.parse(end) },
  };
  return { slots: findAvailableSlots(req) };
}
