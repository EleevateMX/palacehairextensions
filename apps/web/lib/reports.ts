import "server-only";
import { type CommissionRule, calculateCommissions, type SaleLine, type StaffCommission } from "@palace/domain";
import { z } from "zod";
import { type Period, periodBounds } from "./period";
import type { createClient } from "./supabase/server";

/**
 * Cargadores de reportes. Siempre usan el cliente con la sesión de la persona: RLS y la
 * validación de rol de cada RPC deciden qué ve (la estilista solo sus líneas y propinas).
 */
type DB = Awaited<ReturnType<typeof createClient>>;

const n = (v: unknown) => Number(v ?? 0);

// ---------------------------------------------------------------------------
// Ventas
// ---------------------------------------------------------------------------
export interface SalesDay {
  day: string;
  salesCount: number;
  totalCents: number;
  discountsCents: number;
  tipsCents: number;
  refundsCents: number;
  byMethod: Record<PaymentMethod, number>;
}
export type PaymentMethod = "cash" | "card" | "transfer" | "gift_card" | "deposit" | "online";
export const METHOD_LABEL: Record<string, string> = {
  cash: "Efectivo",
  card: "Tarjeta",
  transfer: "Transferencia",
  gift_card: "Tarjeta de regalo",
  deposit: "Anticipo aplicado",
  online: "En línea",
  other: "Otro",
};
export const METHODS: PaymentMethod[] = ["cash", "card", "transfer", "gift_card", "deposit", "online"];

export async function loadSalesDaily(supabase: DB, locationId: string, p: Period) {
  const { data, error } = await supabase.rpc("report_sales_daily", { p_location: locationId, p_from: p.from, p_to: p.to });
  const rows: SalesDay[] = ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    day: String(r.day),
    salesCount: n(r.sales_count),
    totalCents: n(r.total_cents),
    discountsCents: n(r.discounts_cents),
    tipsCents: n(r.tips_cents),
    refundsCents: n(r.refunds_cents),
    byMethod: {
      cash: n(r.cash_cents),
      card: n(r.card_cents),
      transfer: n(r.transfer_cents),
      gift_card: n(r.gift_card_cents),
      deposit: n(r.deposit_cents),
      online: n(r.online_cents),
    },
  }));
  return { rows, error };
}

export interface TopItem {
  kind: "service" | "product";
  itemId: string | null;
  name: string;
  quantity: number;
  salesCount: number;
  netCents: number;
}

export async function loadTopItems(supabase: DB, locationId: string, p: Period) {
  const { data, error } = await supabase.rpc("report_top_items", { p_location: locationId, p_from: p.from, p_to: p.to });
  const rows: TopItem[] = ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    kind: r.kind === "product" ? "product" : "service",
    itemId: (r.item_id as string | null) ?? null,
    name: String(r.name ?? ""),
    quantity: n(r.quantity),
    salesCount: n(r.sales_count),
    netCents: n(r.net_cents),
  }));
  return { rows, error };
}

// ---------------------------------------------------------------------------
// Ocupación y productividad
// ---------------------------------------------------------------------------
export interface StaffProductivity {
  staffId: string;
  name: string;
  completedAppointments: number;
  servicesCount: number;
  servicesRevenueCents: number;
  productsRevenueCents: number;
  scheduledMinutes: number;
  unavailableMinutes: number;
  bookedMinutes: number;
  /** null si no tuvo turno disponible en el periodo. */
  occupancyPct: number | null;
}

export function occupancyPct(booked: number, scheduled: number, unavailable: number): number | null {
  const capacity = scheduled - unavailable;
  if (capacity <= 0) return null;
  return Math.round((1000 * booked) / capacity) / 10;
}

export async function loadProductivity(supabase: DB, locationId: string, p: Period) {
  const { data, error } = await supabase.rpc("report_staff_productivity", { p_location: locationId, p_from: p.from, p_to: p.to });
  const rows: StaffProductivity[] = ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    staffId: String(r.staff_id),
    name: String(r.display_name),
    completedAppointments: n(r.completed_appointments),
    servicesCount: n(r.services_count),
    servicesRevenueCents: n(r.services_revenue_cents),
    productsRevenueCents: n(r.products_revenue_cents),
    scheduledMinutes: n(r.scheduled_minutes),
    unavailableMinutes: n(r.unavailable_minutes),
    bookedMinutes: n(r.booked_minutes),
    occupancyPct: occupancyPct(n(r.booked_minutes), n(r.scheduled_minutes), n(r.unavailable_minutes)),
  }));
  return { rows, error };
}

export async function loadOccupancy(supabase: DB, locationId: string, p: Period) {
  const { data, error } = await supabase.rpc("report_occupancy", { p_location: locationId, p_from: p.from, p_to: p.to });
  const rows = ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    staffId: String(r.staff_id),
    name: String(r.display_name),
    scheduledMinutes: n(r.scheduled_minutes),
    unavailableMinutes: n(r.unavailable_minutes),
    bookedMinutes: n(r.booked_minutes),
    occupancyPct: occupancyPct(n(r.booked_minutes), n(r.scheduled_minutes), n(r.unavailable_minutes)),
  }));
  const total = rows.reduce(
    (acc, r) => ({ booked: acc.booked + r.bookedMinutes, scheduled: acc.scheduled + r.scheduledMinutes, unavailable: acc.unavailable + r.unavailableMinutes }),
    { booked: 0, scheduled: 0, unavailable: 0 },
  );
  return { rows, totalPct: occupancyPct(total.booked, total.scheduled, total.unavailable), total, error };
}

// ---------------------------------------------------------------------------
// Citas: cancelación, no-show y clientas nuevas vs recurrentes
// ---------------------------------------------------------------------------
export interface BookingKpis {
  appointmentsTotal: number;
  cancelled: number;
  completed: number;
  noShow: number;
  cancellationRatePct: number | null;
  noShowRatePct: number | null;
  clientsNew: number;
  clientsReturning: number;
}

export async function loadBookingKpis(supabase: DB, locationId: string, p: Period) {
  const { data, error } = await supabase.rpc("report_booking_kpis", { p_location: locationId, p_from: p.from, p_to: p.to });
  const r = (data ?? {}) as Record<string, unknown>;
  const kpis: BookingKpis = {
    appointmentsTotal: n(r.appointments_total),
    cancelled: n(r.cancelled),
    completed: n(r.completed),
    noShow: n(r.no_show),
    cancellationRatePct: r.cancellation_rate_pct == null ? null : n(r.cancellation_rate_pct),
    noShowRatePct: r.no_show_rate_pct == null ? null : n(r.no_show_rate_pct),
    clientsNew: n(r.clients_new),
    clientsReturning: n(r.clients_returning),
  };
  return { kpis, error };
}

export const pct = (v: number | null) => (v === null ? "—" : `${v.toLocaleString("es-MX", { maximumFractionDigits: 1 })}%`);

// ---------------------------------------------------------------------------
// Comisiones (cálculo en @palace/domain sobre v_commissionable_lines)
// ---------------------------------------------------------------------------
const ruleSchema: z.ZodType<CommissionRule> = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("percent_service"), bps: z.number().int().min(0), serviceIds: z.array(z.string()).optional() }),
  z.object({ kind: z.literal("fixed_service"), amountCents: z.number().int().min(0), serviceIds: z.array(z.string()).optional() }),
  z.object({ kind: z.literal("percent_product"), bps: z.number().int().min(0) }),
  z.object({
    kind: z.literal("tiered"),
    base: z.enum(["services", "products", "all"]),
    tiers: z.array(z.object({ fromCents: z.number().int().min(0), bps: z.number().int().min(0) })),
    marginal: z.boolean(),
  }),
  z.object({ kind: z.literal("goal_bonus"), base: z.enum(["services", "products", "all"]), targetCents: z.number().int(), bonusCents: z.number().int() }),
]) as z.ZodType<CommissionRule>;

const BASE_LABEL = { services: "servicios", products: "productos", all: "ventas" } as const;
const pctBps = (bps: number) => `${(bps / 100).toLocaleString("es-MX", { maximumFractionDigits: 2 })}%`;
const money = (c: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(c / 100);

export function describeRule(r: CommissionRule): string {
  switch (r.kind) {
    case "percent_service":
      return `${pctBps(r.bps)} de servicios${r.serviceIds?.length ? " (servicios seleccionados)" : ""}`;
    case "fixed_service":
      return `${money(r.amountCents)} fijo por servicio${r.serviceIds?.length ? " (servicios seleccionados)" : ""}`;
    case "percent_product":
      return `${pctBps(r.bps)} de productos`;
    case "tiered":
      return `Escalonada sobre ${BASE_LABEL[r.base]} (${r.marginal ? "marginal" : "tasa del tramo alcanzado"}): ${r.tiers
        .map((t) => `desde ${money(t.fromCents)} → ${pctBps(t.bps)}`)
        .join("; ")}`;
    case "goal_bonus":
      return `Bono de ${money(r.bonusCents)} al llegar a ${money(r.targetCents)} en ${BASE_LABEL[r.base]}`;
  }
}

export const RULE_KIND_LABEL: Record<CommissionRule["kind"], string> = {
  percent_service: "% servicio",
  fixed_service: "Fijo por servicio",
  percent_product: "% producto",
  tiered: "Escalonada",
  goal_bonus: "Bono por meta",
};

export interface CommissionLineInfo {
  lineId: string;
  createdAt: string;
  kind: string;
  concept: string;
  grossCents: number;
  discountCents: number;
  refundedCents: number;
}

export interface CommissionReport {
  staff: (StaffCommission & { name: string; rules: string[] })[];
  lines: Map<string, CommissionLineInfo>;
  invalidRules: number;
  error?: string;
}

/**
 * Comisiones del periodo. Base neta = bruto − descuento de línea − parte prorrateada del cupón − devoluciones.
 * Propinas aparte (100% para quien atendió). Anticipos y tarjetas de regalo no comisionan.
 * `onlyStaffId` limita el resultado (vista "Mis comisiones"); RLS ya lo restringe en la base de datos.
 */
export async function loadCommissions(supabase: DB, locationId: string, p: Period, onlyStaffId?: string): Promise<CommissionReport> {
  const { start, end } = periodBounds(p);
  type Row = {
    line_id: string;
    created_at: string;
    kind: string;
    staff_id: string | null;
    service_id: string | null;
    gross_cents: number | string;
    discount_cents: number;
    refunded_cents: number;
    coupon_share_cents: number;
  };
  const rows: Row[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    let q = supabase
      .from("v_commissionable_lines")
      .select("line_id, created_at, kind, staff_id, service_id, gross_cents, discount_cents, refunded_cents, coupon_share_cents")
      .eq("location_id", locationId)
      .gte("created_at", start)
      .lt("created_at", end)
      .not("staff_id", "is", null)
      .order("created_at")
      .order("line_id")
      .range(from, from + PAGE - 1);
    if (onlyStaffId) q = q.eq("staff_id", onlyStaffId);
    const { data, error } = await q;
    if (error) return { staff: [], lines: new Map(), invalidRules: 0, error: error.message };
    rows.push(...((data ?? []) as Row[]));
    if (!data || data.length < PAGE) break;
  }

  let rulesQ = supabase.from("commission_rules").select("staff_id, rule").eq("is_active", true);
  if (onlyStaffId) rulesQ = rulesQ.eq("staff_id", onlyStaffId);
  const [{ data: rulesData, error: rulesError }, { data: tipsData }, { data: people }, { data: services }] = await Promise.all([
    rulesQ,
    supabase.rpc("report_tips_by_staff", { p_location: locationId, p_from: p.from, p_to: p.to }),
    supabase.from("staff_members").select("id, display_name"),
    supabase.from("services").select("id, name"),
  ]);
  if (rulesError) return { staff: [], lines: new Map(), invalidRules: 0, error: rulesError.message };

  const rulesByStaff: Record<string, CommissionRule[]> = {};
  let invalidRules = 0;
  for (const r of rulesData ?? []) {
    const parsed = ruleSchema.safeParse(r.rule);
    if (!parsed.success) {
      invalidRules++;
      continue;
    }
    (rulesByStaff[r.staff_id as string] ??= []).push(parsed.data);
  }

  const serviceName = new Map((services ?? []).map((s) => [s.id as string, s.name as string]));
  const lines = new Map<string, CommissionLineInfo>();
  const saleLines: SaleLine[] = rows.map((r) => {
    const gross = Math.round(Number(r.gross_cents));
    const discount = n(r.discount_cents) + n(r.coupon_share_cents);
    lines.set(r.line_id, {
      lineId: r.line_id,
      createdAt: r.created_at,
      kind: r.kind,
      concept: r.kind === "product" ? "Producto" : r.kind === "gift_card" ? "Tarjeta de regalo" : (serviceName.get(r.service_id ?? "") ?? "Servicio"),
      grossCents: gross,
      discountCents: discount,
      refundedCents: n(r.refunded_cents),
    });
    return {
      lineId: r.line_id,
      kind: (["service", "product", "package", "gift_card"].includes(r.kind) ? r.kind : "service") as SaleLine["kind"],
      staffId: r.staff_id,
      serviceId: r.service_id ?? undefined,
      grossCents: gross,
      discountCents: discount,
      refundedCents: n(r.refunded_cents),
    };
  });
  for (const t of (tipsData ?? []) as { staff_id: string | null; tips_cents: number | string }[]) {
    if (!t.staff_id || (onlyStaffId && t.staff_id !== onlyStaffId)) continue;
    saleLines.push({ lineId: `tips:${t.staff_id}`, kind: "tip", staffId: t.staff_id, grossCents: n(t.tips_cents) });
  }

  const names = new Map((people ?? []).map((s) => [s.id as string, s.display_name as string]));
  const computed = calculateCommissions(saleLines, rulesByStaff);
  // Incluye a quien tiene reglas aunque no haya vendido en el periodo.
  for (const staffId of Object.keys(rulesByStaff)) {
    if (!computed.some((c) => c.staffId === staffId)) {
      computed.push({ staffId, netServicesCents: 0, netProductsCents: 0, commissionCents: 0, bonusCents: 0, tipsCents: 0, details: [] });
    }
  }
  const staff = computed
    .filter((c) => !onlyStaffId || c.staffId === onlyStaffId)
    .map((c) => ({ ...c, name: names.get(c.staffId) ?? "Sin nombre", rules: (rulesByStaff[c.staffId] ?? []).map(describeRule) }))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
  return { staff, lines, invalidRules };
}

// ---------------------------------------------------------------------------
// Finanzas
// ---------------------------------------------------------------------------
export interface FinanceSummary {
  sales_count: number;
  gross_services_cents: number;
  gross_products_cents: number;
  gift_cards_sold_cents: number;
  discounts_cents: number;
  total_sales_cents: number;
  tips_cents: number;
  balance_due_cents: number;
  refunds_cents: number;
  cogs_products_cents: number;
  service_materials_cents: number;
  waste_cents: number;
  deposits_received_cents: number;
  expenses_fixed_cents: number;
  expenses_variable_cents: number;
  payments_by_method: Record<string, number>;
  net_revenue_cents: number;
  gross_profit_cents: number;
  operating_profit_cents: number;
}

export async function loadFinanceSummary(supabase: DB, locationId: string, p: Period) {
  const { data, error } = await supabase.rpc("finance_summary", { p_location: locationId, p_from: p.from, p_to: p.to });
  const raw = (data ?? {}) as Record<string, unknown>;
  const summary = Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k, k === "payments_by_method" ? Object.fromEntries(Object.entries((v ?? {}) as object).map(([m, x]) => [m, n(x)])) : n(v)]),
  ) as unknown as FinanceSummary;
  return { summary: data ? summary : null, error };
}

export interface ServiceProfit {
  serviceId: string;
  name: string;
  count: number;
  revenueCents: number;
  materialsCents: number;
  configuredCostsCents: number;
  marginCents: number;
  marginPct: number | null;
  avgMinutes: number | null;
}

/** Margen = ingresos − materiales consumidos − costos configurados (calculado aquí; la RPC no lo resta). */
export async function loadServiceProfitability(supabase: DB, locationId: string, p: Period) {
  const { data, error } = await supabase.rpc("service_profitability", { p_location: locationId, p_from: p.from, p_to: p.to });
  const rows: ServiceProfit[] = ((data ?? []) as Record<string, unknown>[])
    .map((r) => {
      const revenue = n(r.revenue_cents);
      const margin = revenue - n(r.materials_cents) - n(r.configured_costs_cents);
      return {
        serviceId: String(r.service_id),
        name: String(r.service_name),
        count: n(r.services_count),
        revenueCents: revenue,
        materialsCents: n(r.materials_cents),
        configuredCostsCents: n(r.configured_costs_cents),
        marginCents: margin,
        marginPct: revenue > 0 ? Math.round((1000 * margin) / revenue) / 10 : null,
        avgMinutes: r.avg_minutes == null ? null : n(r.avg_minutes),
      };
    })
    .sort((a, b) => b.marginCents - a.marginCents);
  return { rows, error };
}

export const EXPENSE_KIND_LABEL: Record<string, string> = { fixed: "Fijo", variable: "Variable" };
export const EXPENSE_CATEGORIES = ["Renta", "Nómina", "Servicios (luz, agua, internet)", "Insumos", "Marketing", "Mantenimiento", "Comisiones bancarias", "Impuestos y derechos", "Otros"];

export async function loadExpenses(supabase: DB, locationId: string, p: Period) {
  const { data, error } = await supabase
    .from("expenses")
    .select("id, expense_date, category, kind, amount_cents, description, payment_method, supplier_id, suppliers(name)")
    .eq("location_id", locationId)
    .gte("expense_date", p.from)
    .lte("expense_date", p.to)
    .order("expense_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1000);
  const rows = (data ?? []).map((e) => {
    const sup = Array.isArray(e.suppliers) ? e.suppliers[0] : e.suppliers;
    return {
      id: e.id as string,
      date: e.expense_date as string,
      category: e.category as string,
      kind: e.kind as "fixed" | "variable",
      amountCents: n(e.amount_cents),
      description: (e.description as string | null) ?? "",
      paymentMethod: (e.payment_method as string | null) ?? null,
      supplierId: (e.supplier_id as string | null) ?? null,
      supplierName: (sup as { name: string } | null)?.name ?? null,
    };
  });
  return { rows, error };
}
