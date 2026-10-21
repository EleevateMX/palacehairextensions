/** Traduce los códigos de error de negocio de la base de datos a mensajes para el personal. */
const MESSAGES: Record<string, string> = {
  SLOT_TAKEN: "Ese horario acaba de ocuparse. Elige otro.",
  OUTSIDE_BUSINESS_HOURS: "El horario está fuera del horario del salón.",
  STAFF_NOT_WORKING: "La especialista no tiene turno en ese horario.",
  STAFF_NOT_QUALIFIED: "La especialista no está autorizada para este servicio.",
  RESOURCE_REQUIRED: "No hay estación o recurso disponible para el servicio.",
  INSUFFICIENT_STOCK: "No hay existencias suficientes disponibles.",
  FORBIDDEN: "Tu rol no tiene permiso para esta operación.",
  DISCOUNT_NOT_AUTHORIZED: "El descuento requiere autorización.",
  PAYMENT_INCOMPLETE: "El pago no cubre el total.",
};

export function businessMessage(error: { message?: string } | null | undefined): string {
  const code = error?.message ?? "";
  return MESSAGES[code] ?? "No se pudo completar la operación. Intenta de nuevo.";
}
