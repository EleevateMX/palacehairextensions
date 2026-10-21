import type { Metadata } from "next";
import Link from "next/link";
import { brand } from "@/config/brand";

export const metadata: Metadata = {
  title: { default: "Reserva tu cita", template: `%s · ${brand.shortName}` },
  description: `Agenda en línea en ${brand.name}`,
};

/** Portal público de reservas: sin sesión ni navegación del personal. */
export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <Link href="/reservar" className="font-semibold">
            {brand.name}
          </Link>
          <span className="text-xs text-muted">Reserva en línea</span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-2xl p-4 pb-16">{children}</main>
      <footer className="mx-auto max-w-2xl px-4 pb-8 text-xs text-muted">
        <Link href="/reservar/privacidad" className="underline">
          Aviso de privacidad
        </Link>
      </footer>
    </div>
  );
}
