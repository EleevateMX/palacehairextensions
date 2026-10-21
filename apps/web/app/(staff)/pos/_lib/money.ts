/**
 * Utilidades de dinero seguras para cliente y servidor (sin "server-only").
 * Todo en centavos enteros; la captura del personal es en pesos.
 */

/** "1,234.50" o "1234.5" (pesos) → centavos enteros. Vacío → 0. Inválido → null. */
export function parsePesos(input: string): number | null {
  const clean = input.replace(/[$,\s]/g, "");
  if (clean === "") return 0;
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  const [int, dec = ""] = clean.split(".");
  return Number(int) * 100 + Number(dec.padEnd(2, "0"));
}

/** Centavos → texto editable en pesos ("1234.50"). */
export const centsToInput = (cents: number) => (cents / 100).toFixed(2);

/** Denominaciones mexicanas en centavos. El billete y la moneda de $20 comparten clave en el desglose. */
export const DENOMINATIONS: { key: string; cents: number; label: string; kind: "bill" | "coin" }[] = [
  { key: "b100000", cents: 100000, label: "$1,000", kind: "bill" },
  { key: "b50000", cents: 50000, label: "$500", kind: "bill" },
  { key: "b20000", cents: 20000, label: "$200", kind: "bill" },
  { key: "b10000", cents: 10000, label: "$100", kind: "bill" },
  { key: "b5000", cents: 5000, label: "$50", kind: "bill" },
  { key: "b2000", cents: 2000, label: "$20", kind: "bill" },
  { key: "c2000", cents: 2000, label: "$20", kind: "coin" },
  { key: "c1000", cents: 1000, label: "$10", kind: "coin" },
  { key: "c500", cents: 500, label: "$5", kind: "coin" },
  { key: "c200", cents: 200, label: "$2", kind: "coin" },
  { key: "c100", cents: 100, label: "$1", kind: "coin" },
  { key: "c50", cents: 50, label: "$0.50", kind: "coin" },
];

/** Piezas por fila del contador → desglose {"<centavos>": piezas} y total en centavos. */
export function toBreakdown(pieces: Record<string, number>): { breakdown: Record<string, number>; totalCents: number } {
  const breakdown: Record<string, number> = {};
  let totalCents = 0;
  for (const d of DENOMINATIONS) {
    const n = pieces[d.key] ?? 0;
    if (!Number.isInteger(n) || n <= 0) continue;
    breakdown[String(d.cents)] = (breakdown[String(d.cents)] ?? 0) + n;
    totalCents += d.cents * n;
  }
  return { breakdown, totalCents };
}

/** Descuento estimado de un cupón (mismo cálculo que pos_checkout: división entera). */
export function couponPreview(coupon: { kind: "percent" | "fixed"; value: number } | null, baseCents: number): number {
  if (!coupon || baseCents <= 0) return 0;
  return coupon.kind === "percent" ? Math.trunc((baseCents * coupon.value) / 10000) : Math.min(coupon.value, baseCents);
}
