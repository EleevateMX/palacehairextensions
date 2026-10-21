import { type Cents, percentOf } from "./money";

/**
 * Cálculo de comisiones auditable.
 *
 * Reglas:
 * - La base es el importe NETO: bruto − descuento − devoluciones (opcionalmente sin IVA).
 * - Anticipos y tarjetas de regalo NO comisionan al cobrarse; comisiona el servicio cuando se realiza.
 * - Las propinas no son comisión: se reportan aparte al 100% para quien atendió.
 * - Cada resultado incluye el desglose por línea para auditoría.
 *
 * El sistema genera reportes; no sustituye nómina ni cumplimiento laboral/fiscal.
 */

export type LineKind = "service" | "product" | "deposit" | "gift_card" | "tip" | "package";

export interface SaleLine {
  lineId: string;
  kind: LineKind;
  staffId: string | null;
  serviceId?: string;
  grossCents: Cents;
  discountCents?: Cents;
  refundedCents?: Cents;
}

export type CommissionBase = "services" | "products" | "all";

export type CommissionRule =
  | { kind: "percent_service"; bps: number; serviceIds?: string[] }
  | { kind: "fixed_service"; amountCents: Cents; serviceIds?: string[] }
  | { kind: "percent_product"; bps: number }
  | {
      kind: "tiered";
      base: CommissionBase;
      /** Ordenados por `fromCents` ascendente. */
      tiers: { fromCents: Cents; bps: number }[];
      /** marginal=true: cada tramo paga su tasa (como ISR). false: la tasa del tramo alcanzado aplica a todo. */
      marginal: boolean;
    }
  | { kind: "goal_bonus"; base: CommissionBase; targetCents: Cents; bonusCents: Cents };

export interface CommissionOptions {
  /** Si los precios incluyen IVA y la comisión se calcula sin IVA. 1600 = 16%. */
  stripVatBps?: number;
}

export interface CommissionLineDetail {
  lineId: string;
  rule: CommissionRule["kind"];
  baseCents: Cents;
  commissionCents: Cents;
}

export interface StaffCommission {
  staffId: string;
  netServicesCents: Cents;
  netProductsCents: Cents;
  commissionCents: Cents;
  bonusCents: Cents;
  tipsCents: Cents;
  details: CommissionLineDetail[];
}

function netOf(line: SaleLine, opts: CommissionOptions): Cents {
  const net = line.grossCents - (line.discountCents ?? 0) - (line.refundedCents ?? 0);
  if (net <= 0) return 0;
  if (!opts.stripVatBps) return net;
  return Math.round((net * 10_000) / (10_000 + opts.stripVatBps));
}

function baseAmount(s: StaffCommission, base: CommissionBase): Cents {
  if (base === "services") return s.netServicesCents;
  if (base === "products") return s.netProductsCents;
  return s.netServicesCents + s.netProductsCents;
}

function tieredCommission(amount: Cents, tiers: { fromCents: Cents; bps: number }[], marginal: boolean): Cents {
  const sorted = [...tiers].sort((a, b) => a.fromCents - b.fromCents);
  if (!marginal) {
    const reached = sorted.filter((t) => amount >= t.fromCents).pop();
    return reached ? percentOf(amount, reached.bps) : 0;
  }
  let total = 0;
  sorted.forEach((t, i) => {
    const upper = sorted[i + 1]?.fromCents ?? Infinity;
    const portion = Math.max(0, Math.min(amount, upper) - t.fromCents);
    total += percentOf(portion, t.bps);
  });
  return total;
}

export function calculateCommissions(
  lines: SaleLine[],
  rulesByStaff: Record<string, CommissionRule[]>,
  opts: CommissionOptions = {},
): StaffCommission[] {
  const byStaff = new Map<string, StaffCommission>();
  const get = (id: string) => {
    let s = byStaff.get(id);
    if (!s) {
      s = { staffId: id, netServicesCents: 0, netProductsCents: 0, commissionCents: 0, bonusCents: 0, tipsCents: 0, details: [] };
      byStaff.set(id, s);
    }
    return s;
  };

  for (const line of lines) {
    if (!line.staffId) continue;
    const s = get(line.staffId);
    if (line.kind === "tip") {
      s.tipsCents += line.grossCents - (line.refundedCents ?? 0);
      continue;
    }
    if (line.kind === "deposit" || line.kind === "gift_card") continue; // no comisionan al cobro
    const net = netOf(line, opts);
    if (line.kind === "service" || line.kind === "package") s.netServicesCents += net;
    if (line.kind === "product") s.netProductsCents += net;

    for (const rule of rulesByStaff[line.staffId] ?? []) {
      let c: Cents | null = null;
      const isService = line.kind === "service" || line.kind === "package";
      if (rule.kind === "percent_service" && isService && (!rule.serviceIds || rule.serviceIds.includes(line.serviceId ?? ""))) {
        c = percentOf(net, rule.bps);
      } else if (rule.kind === "fixed_service" && isService && (!rule.serviceIds || rule.serviceIds.includes(line.serviceId ?? ""))) {
        // Servicio devuelto/anulado por completo no genera fijo.
        c = net > 0 ? rule.amountCents : 0;
      } else if (rule.kind === "percent_product" && line.kind === "product") {
        c = percentOf(net, rule.bps);
      }
      if (c !== null) {
        s.commissionCents += c;
        s.details.push({ lineId: line.lineId, rule: rule.kind, baseCents: net, commissionCents: c });
      }
    }
  }

  // Reglas sobre totales del periodo.
  for (const s of byStaff.values()) {
    for (const rule of rulesByStaff[s.staffId] ?? []) {
      if (rule.kind === "tiered") {
        const c = tieredCommission(baseAmount(s, rule.base), rule.tiers, rule.marginal);
        s.commissionCents += c;
        s.details.push({ lineId: "*periodo*", rule: "tiered", baseCents: baseAmount(s, rule.base), commissionCents: c });
      } else if (rule.kind === "goal_bonus" && baseAmount(s, rule.base) >= rule.targetCents) {
        s.bonusCents += rule.bonusCents;
        s.details.push({ lineId: "*periodo*", rule: "goal_bonus", baseCents: baseAmount(s, rule.base), commissionCents: rule.bonusCents });
      }
    }
  }
  return [...byStaff.values()];
}
