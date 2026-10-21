"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import { SubmitButton } from "@/components/forms";
import { ErrorNotice, Field, inputClass } from "@/components/ui";
import type { ActionState } from "@/components/forms";

type Option = { value: string; label: string };

export function CreateStaffForm({
  action,
  roles,
  locations,
  defaultLocation,
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  roles: Option[];
  locations: Option[];
  defaultLocation: string | null;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);
  const created = state.ok ? (state.data as { email: string; password: string; staffId: string } | undefined) : undefined;

  return (
    <div className="space-y-4">
      <form ref={ref} action={formAction} className="grid gap-3 sm:grid-cols-2">
        <Field label="Correo de acceso">
          <input name="email" type="email" required autoComplete="off" className={inputClass} />
        </Field>
        <Field label="Nombre para mostrar">
          <input name="display_name" required minLength={2} className={inputClass} />
        </Field>
        <Field label="Rol">
          <select name="role" defaultValue="stylist" className={inputClass}>
            {roles.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Sucursal">
          <select name="location_id" defaultValue={defaultLocation ?? ""} className={inputClass}>
            {locations.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Teléfono (opcional)">
          <input name="phone" type="tel" className={inputClass} />
        </Field>
        <label className="flex min-h-11 items-center gap-2 text-sm sm:pt-6">
          <input type="checkbox" name="is_bookable" className="size-5" /> Agendable (aparece en la agenda)
        </label>
        <div className="sm:col-span-2">
          <SubmitButton>Dar de alta</SubmitButton>
        </div>
        {state.error ? (
          <div className="sm:col-span-2">
            <ErrorNotice message={state.error} />
          </div>
        ) : null}
      </form>
      {created ? (
        <div role="status" className="space-y-2 rounded-brand border border-success/40 bg-success/10 p-3 text-sm">
          <p className="font-medium text-success">{state.ok}</p>
          <p>
            Correo: <span className="font-mono">{created.email}</span>
          </p>
          <p>
            Contraseña temporal:{" "}
            <code data-testid="temp-password" className="select-all rounded bg-surface px-2 py-1 font-mono">
              {created.password}
            </code>
          </p>
          <p className="text-xs text-muted">
            Cópiala y entrégala en persona: no se volverá a mostrar ni se guarda en el sistema. (Aún no hay servicio de correo para invitaciones.)
          </p>
          <Link href={`/personal/${created.staffId}`} className="inline-block underline">
            Configurar turnos y servicios →
          </Link>
        </div>
      ) : null}
    </div>
  );
}
