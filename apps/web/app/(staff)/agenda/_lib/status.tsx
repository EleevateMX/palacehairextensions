import { Badge } from "@/components/ui";

type Tone = "neutral" | "success" | "warning" | "danger";

export const BOOKING: Record<string, [string, Tone]> = {
  hold: ["Apartado", "warning"],
  confirmed: ["Confirmada", "success"],
  cancelled: ["Cancelada", "danger"],
  expired: ["Apartado vencido", "danger"],
};

export const ATTENDANCE: Record<string, [string, Tone]> = {
  scheduled: ["Agendada", "neutral"],
  arrived: ["Llegó", "success"],
  in_service: ["En servicio", "warning"],
  completed: ["Terminada", "success"],
  no_show: ["No asistió", "danger"],
};

export const PAYMENT: Record<string, [string, Tone]> = {
  not_required: ["Sin anticipo", "neutral"],
  pending: ["Anticipo pendiente", "warning"],
  deposit_paid: ["Anticipo pagado", "success"],
  paid: ["Pagada", "success"],
  refunded: ["Reembolsada", "neutral"],
  needs_refund: ["Requiere reembolso", "danger"],
};

export const MATERIALS: Record<string, [string, Tone]> = {
  not_required: ["Sin materiales", "neutral"],
  reserved: ["Material reservado", "success"],
  missing: ["Material faltante", "danger"],
  consumed: ["Material consumido", "neutral"],
  released: ["Material liberado", "neutral"],
};

export const DEPOSIT_METHOD: Record<string, string> = {
  cash: "Efectivo",
  card: "Tarjeta",
  transfer: "Transferencia",
  online: "En línea",
};

export const DEPOSIT_STATUS: Record<string, string> = {
  received: "Recibido",
  applied: "Aplicado en venta",
  refunded: "Reembolsado",
  needs_refund: "Requiere reembolso",
  forfeited: "Retenido",
};

function pick(map: Record<string, [string, Tone]>, key: string): [string, Tone] {
  return map[key] ?? [key, "neutral"];
}

export function StatusBadge({ kind, value }: { kind: "booking" | "attendance" | "payment" | "materials"; value: string }) {
  const map = { booking: BOOKING, attendance: ATTENDANCE, payment: PAYMENT, materials: MATERIALS }[kind];
  const [label, tone] = pick(map, value);
  return <Badge tone={tone}>{label}</Badge>;
}

/** Etiqueta corta para listas: el apartado manda sobre la asistencia. */
export function ShortStatus({ booking, attendance }: { booking: string; attendance: string }) {
  if (booking === "hold") return <Badge tone="warning">Apartado</Badge>;
  const [label, tone] = pick(ATTENDANCE, attendance);
  return <Badge tone={tone}>{label}</Badge>;
}

export const clientName = (c: { first_name: string; last_name: string | null } | null | undefined) =>
  c ? `${c.first_name} ${c.last_name ?? ""}`.trim() : "Sin clienta";

/** PostgREST puede devolver una relación como objeto o arreglo según la cardinalidad detectada. */
export function one<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}
