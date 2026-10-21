/**
 * Dinero siempre en centavos enteros (MXN) para evitar errores de punto flotante.
 */
export type Cents = number;

export function assertCents(value: number, label = "monto"): Cents {
  if (!Number.isInteger(value)) throw new Error(`${label} debe ser un entero en centavos`);
  return value;
}

/** Aplica un porcentaje (en puntos base: 1000 = 10%) con redondeo bancario a centavos. */
export function percentOf(amount: Cents, basisPoints: number): Cents {
  const raw = (amount * basisPoints) / 10_000;
  return roundHalfEven(raw);
}

export function roundHalfEven(x: number): number {
  const floor = Math.floor(x);
  const diff = x - floor;
  if (Math.abs(diff - 0.5) < 1e-9) return floor % 2 === 0 ? floor : floor + 1;
  return Math.round(x);
}

export function formatMXN(amount: Cents): string {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(amount / 100);
}
