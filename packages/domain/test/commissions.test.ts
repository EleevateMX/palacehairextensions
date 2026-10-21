import { describe, expect, it } from "vitest";
import { calculateCommissions, type SaleLine } from "../src";

describe("comisiones", () => {
  const lines: SaleLine[] = [
    { lineId: "l1", kind: "service", staffId: "ana", serviceId: "inst", grossCents: 500_000, discountCents: 50_000 },
    { lineId: "l2", kind: "product", staffId: "ana", grossCents: 80_000 },
    { lineId: "l3", kind: "deposit", staffId: "ana", grossCents: 100_000 },
    { lineId: "l4", kind: "tip", staffId: "ana", grossCents: 20_000 },
    { lineId: "l5", kind: "gift_card", staffId: "ana", grossCents: 100_000 },
  ];

  it("porcentaje por servicio sobre importe neto de descuento; anticipo y tarjeta de regalo no comisionan", () => {
    const [ana] = calculateCommissions(lines, { ana: [{ kind: "percent_service", bps: 1000 }] });
    expect(ana!.netServicesCents).toBe(450_000);
    expect(ana!.commissionCents).toBe(45_000);
    expect(ana!.tipsCents).toBe(20_000);
  });

  it("devolución reduce la base de comisión", () => {
    const refunded = lines.map((l) => (l.lineId === "l2" ? { ...l, refundedCents: 80_000 } : l));
    const [ana] = calculateCommissions(refunded, { ana: [{ kind: "percent_product", bps: 1500 }] });
    expect(ana!.commissionCents).toBe(0);
  });

  it("importe fijo por servicio", () => {
    const [ana] = calculateCommissions(lines, { ana: [{ kind: "fixed_service", amountCents: 30_000 }] });
    expect(ana!.commissionCents).toBe(30_000);
  });

  it("comisión escalonada marginal y bono por objetivo", () => {
    const [ana] = calculateCommissions(lines, {
      ana: [
        { kind: "tiered", base: "all", marginal: true, tiers: [{ fromCents: 0, bps: 500 }, { fromCents: 300_000, bps: 1000 }] },
        { kind: "goal_bonus", base: "services", targetCents: 400_000, bonusCents: 50_000 },
      ],
    });
    // base all = 450,000 + 80,000 = 530,000 → 300,000*5% + 230,000*10% = 15,000 + 23,000
    expect(ana!.commissionCents).toBe(38_000);
    expect(ana!.bonusCents).toBe(50_000);
  });

  it("puede calcular sin IVA", () => {
    const [ana] = calculateCommissions(
      [{ lineId: "x", kind: "service", staffId: "ana", grossCents: 116_000 }],
      { ana: [{ kind: "percent_service", bps: 1000 }] },
      { stripVatBps: 1600 },
    );
    expect(ana!.commissionCents).toBe(10_000);
  });
});
