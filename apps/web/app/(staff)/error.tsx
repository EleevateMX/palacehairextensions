"use client";

import { buttonClass, ErrorNotice } from "@/components/ui";

export default function StaffError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="space-y-4">
      <ErrorNotice message="Ocurrió un error al cargar esta sección." />
      <button onClick={reset} className={buttonClass}>
        Reintentar
      </button>
    </div>
  );
}
