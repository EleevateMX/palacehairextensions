import "server-only";
import { addDays } from "@palace/domain";
import { loadSlots } from "./availability";
import { todayLocal } from "./format";
import { createAdminClient } from "./supabase/admin";

/**
 * Datos del portal público. Se leen en el SERVIDOR con la llave secreta y se filtran aquí:
 * solo columnas públicas (nada de costos, clientas ni datos de contacto del personal).
 */

export interface PortalService {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  priceIsFrom: boolean;
  durationMin: number;
  requiresConsultation: boolean;
  onlineBookable: boolean;
  depositCents: number;
  category: string | null;
}

export interface PortalLocation {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  maps_url: string | null;
  map_query: string | null;
}

/** Datos públicos para "Visítanos" (pie y paso 1 del portal). */
export async function portalVisitInfo() {
  const db = createAdminClient();
  const [{ data: settings }, { data: location }] = await Promise.all([
    db.from("business_settings").select("display_name, facebook_url").eq("id", 1).maybeSingle(),
    db.from("locations").select("id, name, address, phone, maps_url, map_query").eq("is_active", true).order("name").limit(1).maybeSingle(),
  ]);
  return {
    displayName: (settings?.display_name as string | undefined) ?? "Palace Hair Extensions",
    facebookUrl: (settings?.facebook_url as string | null | undefined) ?? null,
    location: (location as PortalLocation | null) ?? null,
  };
}

export interface BookingPolicy {
  holdMinutes: number;
  minLeadMinutes: number;
  maxAdvanceDays: number;
}

export async function portalContext() {
  const db = createAdminClient();
  const [{ data: settings }, { data: location }, { data: services, error }] = await Promise.all([
    db.from("business_settings").select("display_name, booking_policy, privacy_notice_version, facebook_url").eq("id", 1).maybeSingle(),
    db.from("locations").select("id, name, address, phone, maps_url, map_query").eq("is_active", true).order("name").limit(1).maybeSingle(),
    db
      .from("services")
      .select("id, name, description, price_cents, price_is_from, duration_min, requires_consultation, online_bookable, deposit_type, deposit_value, service_categories(name, sort_order)")
      .eq("is_active", true)
      .or("online_bookable.eq.true,requires_consultation.eq.true")
      .order("name"),
  ]);
  const bp = (settings?.booking_policy ?? {}) as Record<string, unknown>;
  const policy: BookingPolicy = {
    holdMinutes: Number(bp.hold_minutes ?? 15),
    minLeadMinutes: Number(bp.min_lead_minutes ?? 120),
    maxAdvanceDays: Number(bp.max_advance_days ?? 90),
  };
  const list: PortalService[] = (services ?? []).map((s) => {
    const cat = Array.isArray(s.service_categories) ? s.service_categories[0] : s.service_categories;
    return {
      id: s.id,
      name: s.name,
      description: s.description,
      priceCents: s.price_cents,
      priceIsFrom: s.price_is_from,
      durationMin: s.duration_min,
      requiresConsultation: s.requires_consultation,
      onlineBookable: s.online_bookable,
      depositCents: s.deposit_type === "fixed" ? s.deposit_value : s.deposit_type === "percent" ? Math.floor((s.price_cents * s.deposit_value) / 10_000) : 0,
      category: (cat as { name: string } | null)?.name ?? null,
    };
  });
  // Servicio de valoración: el reservable en línea cuyo nombre lo indica.
  const consultation = list.find((s) => s.onlineBookable && !s.requiresConsultation && /valoraci/i.test(s.name)) ?? null;
  return {
    displayName: (settings?.display_name as string | undefined) ?? "Palace Hair Extensions",
    privacyNoticeVersion: (settings?.privacy_notice_version as string | null | undefined) ?? null,
    location: location as PortalLocation | null,
    facebookUrl: (settings?.facebook_url as string | null | undefined) ?? null,
    policy,
    services: list,
    consultation,
    error,
  };
}

/** Especialistas activas y reservables para el servicio (solo nombre visible). */
export async function serviceStaff(serviceId: string): Promise<{ id: string; name: string }[]> {
  const db = createAdminClient();
  const { data } = await db
    .from("staff_services")
    .select("staff_members!inner(id, display_name, is_active, is_bookable)")
    .eq("service_id", serviceId)
    .eq("staff_members.is_active", true)
    .eq("staff_members.is_bookable", true);
  return (data ?? [])
    .map((r) => (Array.isArray(r.staff_members) ? r.staff_members[0] : r.staff_members) as { id: string; display_name: string } | undefined)
    .filter((m): m is { id: string; display_name: string } => Boolean(m))
    .map((m) => ({ id: m.id, name: m.display_name }))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}

export function bookableDateRange(policy: BookingPolicy) {
  const today = todayLocal();
  return { min: today, max: addDays(today, policy.maxAdvanceDays) };
}

/** Horarios públicos: anticipación mínima de la política y solo personal reservable. */
export async function portalSlots(args: { locationId: string; serviceId: string; date: string; staffId?: string; policy: BookingPolicy }) {
  const staff = await serviceStaff(args.serviceId);
  if (args.staffId && !staff.some((s) => s.id === args.staffId)) return { slots: [], staff, error: "Especialista no disponible para este servicio." };
  const result = await loadSlots(createAdminClient(), {
    locationId: args.locationId,
    serviceId: args.serviceId,
    date: args.date,
    preferredStaffId: args.staffId,
    minLeadMin: args.policy.minLeadMinutes,
    allowedStaffIds: staff.map((s) => s.id),
  });
  return { ...result, staff };
}
