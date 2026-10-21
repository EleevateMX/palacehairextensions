"use client";

import { buttonClass, ErrorNotice } from "@/components/ui";

export default function PortalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="space-y-4">
      <ErrorNotice message="Ocurrió un error al cargar las reservas. Intenta de nuevo o contáctanos para agendar." />
      <button onClick={reset} className={buttonClass}>
        Reintentar
      </button>
    </div>
  );
}
