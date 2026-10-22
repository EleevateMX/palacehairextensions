import type { Metadata } from "next";
import Link from "next/link";
import { brand } from "@/config/brand";

export const metadata: Metadata = { title: "Aviso de privacidad" };

/**
 * ❓ TEXTO PROVISIONAL. El aviso de privacidad definitivo (LFPDPPP) debe redactarlo/validarlo
 * asesoría legal; la versión vigente se toma de business_settings.privacy_notice_version.
 */
export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-2xl space-y-4 text-sm leading-relaxed">
      <h1 className="text-3xl">Aviso de privacidad (resumen)</h1>
      <p className="rounded-brand border border-warning/40 bg-warning/10 p-3">
        Texto provisional pendiente de revisión legal. Solicita el aviso de privacidad integral en el salón.
      </p>
      <p>
        {brand.name} trata tus datos de identificación y contacto (nombre, teléfono y correo) para agendar, confirmar y dar seguimiento a tus citas, y para
        contactarte sobre tu reserva o el anticipo.
      </p>
      <p>
        Los recordatorios de citas son opcionales: puedes aceptarlos o no al reservar y retirarlos cuando quieras. No usamos tus datos para publicidad sin
        tu consentimiento expreso.
      </p>
      <p>Puedes ejercer tus derechos de acceso, rectificación, cancelación u oposición (ARCO) solicitándolo directamente en el salón.</p>
      <Link href="/reservar" className="underline">
        Volver a reservas
      </Link>
    </article>
  );
}
