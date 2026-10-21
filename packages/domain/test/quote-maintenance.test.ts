import { describe, expect, it } from "vitest";
import { planMaintenance, type QuoteConfig, quoteExtensions } from "../src";

const cfg: QuoteConfig = {
  gramsTable: [
    { lengthCm: 40, grams: { natural: 100, medio: 125, abundante: 150 } },
    { lengthCm: 55, grams: { natural: 125, medio: 150, abundante: 200 } },
  ],
  techniques: {
    cinta: { label: "Cinta adhesiva", laborCents: 150_000, suppliesCents: 30_000 },
    keratina: { label: "Keratina", laborCents: 250_000, suppliesCents: 40_000, alwaysConsult: true },
  },
  rangeBps: 1000,
};

describe("cotizador de extensiones", () => {
  it("calcula paquetes, rango y no exige valoración cuando hay datos y existencias", () => {
    const q = quoteExtensions(
      { lengthCm: 50, volume: "medio", technique: "cinta", hair: { variantId: "v1", packPriceCents: 120_000, gramsPerPack: 50, availablePacks: 5 } },
      cfg,
    );
    expect(q.gramsNeeded).toBe(150);
    expect(q.packsNeeded).toBe(3);
    expect(q.estimateCents).toBe(360_000 + 150_000 + 30_000);
    expect(q.minCents).toBe(486_000);
    expect(q.maxCents).toBe(594_000);
    expect(q.requiresConsultation).toBe(false);
  });

  it("exige valoración si falta tono, la técnica lo requiere o no hay existencias", () => {
    const q = quoteExtensions({ lengthCm: 50, volume: "medio", technique: "keratina", hair: null }, cfg);
    expect(q.requiresConsultation).toBe(true);
    expect(q.reasons).toContain("Tono por confirmar");
    const q2 = quoteExtensions(
      { lengthCm: 50, volume: "abundante", technique: "cinta", hair: { variantId: "v1", packPriceCents: 1, gramsPerPack: 50, availablePacks: 2 } },
      cfg,
    );
    expect(q2.stockSufficient).toBe(false);
    expect(q2.requiresConsultation).toBe(true);
    expect(q2.disclaimer).toMatch(/estimado/);
  });
});

describe("mantenimiento", () => {
  it("calcula próxima fecha y recordatorio", () => {
    expect(planMaintenance("cinta", "2026-11-07", { cinta: { intervalDays: 42, reminderLeadDays: 7 } })).toEqual({
      dueDate: "2026-12-19",
      reminderDate: "2026-12-12",
    });
  });
});
