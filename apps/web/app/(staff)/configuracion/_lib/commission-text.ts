import type { CommissionRule } from "@palace/domain";
import { mxn } from "@/lib/format";
import { BASE_LABEL } from "./fields";

const pct = (bps: number) => `${(bps / 100).toLocaleString("es-MX", { maximumFractionDigits: 2 })} %`;

/** Descripción legible de una regla de comisión. */
export function describeRule(rule: CommissionRule, serviceName: (id: string) => string): string {
  const scope = (ids?: string[]) => (ids?.length ? ` (solo: ${ids.map(serviceName).join(", ")})` : " (todos los servicios)");
  switch (rule.kind) {
    case "percent_service":
      return `${pct(rule.bps)} sobre servicios${scope(rule.serviceIds)}`;
    case "fixed_service":
      return `${mxn(rule.amountCents)} por servicio realizado${scope(rule.serviceIds)}`;
    case "percent_product":
      return `${pct(rule.bps)} sobre venta de productos`;
    case "tiered":
      return `Escalonada sobre ${BASE_LABEL[rule.base]} (${rule.marginal ? "marginal por tramo" : "tasa del tramo alcanzado"}): ${[...rule.tiers]
        .sort((a, b) => a.fromCents - b.fromCents)
        .map((t) => `desde ${mxn(t.fromCents)} → ${pct(t.bps)}`)
        .join("; ")}`;
    case "goal_bonus":
      return `Bono de ${mxn(rule.bonusCents)} al alcanzar ${mxn(rule.targetCents)} en ${BASE_LABEL[rule.base]}`;
  }
}
