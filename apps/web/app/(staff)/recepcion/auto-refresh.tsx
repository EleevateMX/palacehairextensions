"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/** Vuelve a pedir los datos del servidor cada `seconds` segundos mientras la pestaña está visible. */
export function AutoRefresh({ seconds = 60 }: { seconds?: number }) {
  const router = useRouter();
  const [last, setLast] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      router.refresh();
      setLast(new Date());
    }, seconds * 1000);
    return () => window.clearInterval(id);
  }, [router, seconds]);
  return (
    <p className="text-xs text-muted" aria-live="polite">
      Se actualiza cada {seconds} s · última:{" "}
      <span suppressHydrationWarning>
        {last.toLocaleTimeString("es-MX", { timeZone: "America/Mexico_City", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })}
      </span>
    </p>
  );
}
