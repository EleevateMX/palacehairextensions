/** Etiquetas en español (seguras para cliente y servidor). */
export const METHOD_LABEL: Record<string, string> = {
  cash: "Efectivo",
  card: "Tarjeta",
  transfer: "Transferencia",
  gift_card: "Tarjeta de regalo",
  deposit: "Anticipo",
  online: "En línea",
};

export const STATUS_LABEL: Record<string, string> = {
  completed: "Completada",
  voided: "Cancelada",
  partially_refunded: "Devolución parcial",
  refunded: "Devuelta",
};

export const statusTone = (s: string) => (s === "voided" ? "danger" : s === "completed" ? "success" : "warning") as "danger" | "success" | "warning";
