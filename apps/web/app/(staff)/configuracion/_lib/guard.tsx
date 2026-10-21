import "server-only";
import Link from "next/link";
import { ErrorNotice, PageHeader, secondaryButtonClass } from "@/components/ui";
import { MESSAGES } from "@/lib/errors";
import { can, requireStaff } from "@/lib/staff";

/**
 * Configuración y altas de personal: solo propietaria/administración.
 * Es un espejo de permisos para la UI; la seguridad real está en RLS y en las RPC.
 */
export async function requireManager() {
  const ctx = await requireStaff();
  return { ...ctx, allowed: can(ctx.staff, "owner", "admin") };
}

/** Para Server Actions: devuelve el contexto o un error listo para ActionState. */
export async function managerAction() {
  const ctx = await requireStaff();
  if (!can(ctx.staff, "owner", "admin")) return { error: MESSAGES.FORBIDDEN! } as const;
  return { ...ctx, error: undefined };
}

export function Forbidden({ title }: { title: string }) {
  return (
    <>
      <PageHeader title={title} />
      <div className="space-y-4">
        <ErrorNotice message="No tienes permiso para abrir esta sección. Solo la propietaria o administración pueden modificarla." />
        <Link href="/dashboard" className={secondaryButtonClass}>
          Volver al inicio
        </Link>
      </div>
    </>
  );
}
