import type { Metadata } from "next";
import { Wordmark } from "@/components/brand";
import { isConfigured } from "@/lib/env";
import { ErrorNotice } from "@/components/ui";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-10">
      <div className="mb-8">
        <Wordmark size="lg" align="center" />
      </div>
      <div className="rounded-2xl border border-line bg-surface p-6 md:p-7">
        <h1 className="text-2xl">Bienvenida</h1>
        <p className="mb-6 mt-1 text-sm text-muted">Acceso para el personal del salón</p>
        {isConfigured() ? (
          <LoginForm next={typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard"} />
        ) : (
          <ErrorNotice message="Falta configurar Supabase. Copia apps/web/.env.example a .env.local (ver README)." />
        )}
      </div>
    </main>
  );
}
