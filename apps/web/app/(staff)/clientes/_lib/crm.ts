/** Utilidades y catálogos del CRM (sin dependencias de servidor). */

/**
 * Normaliza un teléfono a E.164. Números de 10 dígitos se asumen de México (+52).
 * Acepta "+52 999 123 4567", "999-123-4567", "52 999 123 4567", el antiguo "+52 1 …"
 * de celulares y los prefijos 044/045. Devuelve null si no es válido.
 */
export function normalizePhoneMx(input: string): string | null {
  const raw = input.trim();
  if (raw === "") return null;
  const intl = raw.startsWith("+") || raw.startsWith("00");
  let digits = raw.replace(/\D/g, "");
  if (raw.startsWith("00")) digits = digits.slice(2);
  if (!intl) {
    if (/^04[45]\d{10}$/.test(digits)) digits = digits.slice(3);
    if (digits.length === 10) return `+52${digits}`;
    if (/^52\d{10}$/.test(digits)) return `+${digits}`;
    if (/^521\d{10}$/.test(digits)) return `+52${digits.slice(3)}`;
    return null;
  }
  if (/^521\d{10}$/.test(digits)) return `+52${digits.slice(3)}`;
  if (digits.startsWith("52")) return /^52\d{10}$/.test(digits) ? `+${digits}` : null;
  return /^[1-9]\d{9,14}$/.test(digits) ? `+${digits}` : null;
}

/** "+529991234567" → "+52 999 123 4567" (solo presentación). */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return "—";
  // CDMX, Guadalajara y Monterrey usan lada de 2 dígitos; el resto, de 3.
  const two = /^\+52(55|56|33|81)(\d{4})(\d{4})$/.exec(phone);
  if (two) return `+52 ${two[1]} ${two[2]} ${two[3]}`;
  const m = /^\+52(\d{3})(\d{3})(\d{4})$/.exec(phone);
  return m ? `+52 ${m[1]} ${m[2]} ${m[3]}` : phone;
}

export const CONSENT_PURPOSES = [
  "privacy_notice",
  "appointment_reminders",
  "marketing_whatsapp",
  "marketing_email",
  "photos_internal",
  "photos_marketing",
] as const;
export type ConsentPurpose = (typeof CONSENT_PURPOSES)[number];

export const CONSENT_LABEL: Record<string, string> = {
  privacy_notice: "Aviso de privacidad",
  appointment_reminders: "Recordatorios de citas",
  marketing_whatsapp: "Promociones por WhatsApp",
  marketing_email: "Promociones por correo",
  marketing_sms: "Promociones por SMS",
  photos_internal: "Fotos para expediente interno",
  photos_marketing: "Fotos para redes y publicidad",
};

export const CHANNELS: { value: string; label: string }[] = [
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "tiktok", label: "TikTok" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "referido", label: "Recomendación" },
  { value: "walk_in", label: "Pasó por el salón" },
  { value: "google", label: "Google / Maps" },
  { value: "portal", label: "Portal en línea" },
  { value: "otro", label: "Otro" },
];
export const channelLabel = (v: string | null | undefined) => CHANNELS.find((c) => c.value === v)?.label ?? v ?? "—";

export const SEGMENTS = [
  { value: "", label: "Todas" },
  { value: "nuevas", label: "Nuevas" },
  { value: "frecuentes", label: "Frecuentes" },
  { value: "inactivas", label: "Inactivas" },
  { value: "mantenimiento", label: "Mantenimiento próximo" },
] as const;

export const BOOKING_LABEL: Record<string, string> = {
  hold: "Apartada",
  confirmed: "Confirmada",
  cancelled: "Cancelada",
  expired: "Vencida",
};
export const ATTENDANCE_LABEL: Record<string, string> = {
  scheduled: "Programada",
  arrived: "Llegó",
  in_service: "En servicio",
  completed: "Completada",
  no_show: "No asistió",
};
export const REMINDER_LABEL: Record<string, string> = {
  pending: "Pendiente",
  sent: "Enviado",
  booked: "Agendado",
  dismissed: "Descartado",
};

export const TABS = [
  { key: "perfil", label: "Perfil" },
  { key: "consentimientos", label: "Consentimientos" },
  { key: "notas", label: "Notas" },
  { key: "historial", label: "Historial" },
  { key: "mantenimiento", label: "Mantenimiento" },
  { key: "inventario", label: "Inventario apartado" },
  { key: "fotos", label: "Fotos" },
  { key: "privacidad", label: "Privacidad" },
] as const;
export type TabKey = (typeof TABS)[number]["key"];

export const dateMx = (iso: string | null | undefined, withTime = false) =>
  iso
    ? new Intl.DateTimeFormat("es-MX", {
        timeZone: iso.length === 10 ? "UTC" : "America/Mexico_City",
        day: "numeric",
        month: "short",
        year: "numeric",
        ...(withTime ? { hour: "2-digit", minute: "2-digit", hourCycle: "h23" as const } : {}),
      }).format(new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso))
    : "—";

/** Limpia un término de búsqueda para usarlo dentro de un filtro `or` de PostgREST. */
export const searchTerm = (q: string) => q.replace(/[%,()*\\:"]/g, " ").trim();
