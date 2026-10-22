import type { Metadata } from "next";
import Link from "next/link";
import { Wordmark } from "@/components/brand";
import { brand } from "@/config/brand";

export const metadata: Metadata = {
  title: { default: "Reserva tu cita", template: `%s · ${brand.shortName}` },
  description: `Agenda en línea en ${brand.name}`,
};

/** Portal público de reservas: sin sesión ni navegación del personal. */
export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-2xl items-center justify-center px-4 py-5 sm:justify-between">
          <Link href="/reservar" aria-label={`${brand.name} · inicio de reservas`}>
            <Wordmark size="md" />
          </Link>
          <span className="eyebrow hidden sm:inline">Reserva en línea</span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-2xl px-4 pb-16 pt-8">{children}</main>
      <footer className="mx-auto max-w-2xl px-4 pb-8 text-xs text-muted">
        <Link href="/reservar/privacidad" className="underline">
          Aviso de privacidad
        </Link>
      </footer>
    </div>
  );
}
