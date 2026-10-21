import type { Metadata } from "next";
import { brand } from "@/config/brand";
import { isConfigured } from "@/lib/env";
import { ErrorNotice } from "@/components/ui";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4">
      <div className="rounded-brand border border-line bg-surface p-6">
        <h1 className="text-xl font-semibold">{brand.name}</h1>
        <p className="mb-6 text-sm text-muted">Acceso para el personal del salón</p>
        {isConfigured() ? (
          <LoginForm next={typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard"} />
        ) : (
          <ErrorNotice message="Falta configurar Supabase. Copia apps/web/.env.example a .env.local (ver README)." />
        )}
      </div>
      {brand.provisional ? <p className="mt-4 text-center text-xs text-muted">Identidad visual provisional</p> : null}
    </main>
  );
}
