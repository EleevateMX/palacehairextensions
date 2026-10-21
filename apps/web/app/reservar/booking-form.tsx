"use client";

import Link from "next/link";
import { type ReactNode, useActionState } from "react";
import { useFormStatus } from "react-dom";
import { buttonClass, ErrorNotice, Field, inputClass } from "@/components/ui";
import type { ActionState } from "@/lib/actions";
import { bookAction } from "./actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={`${buttonClass} w-full sm:w-auto`}>
      {pending ? "Reservando…" : "Confirmar reserva"}
    </button>
  );
}

/** Formulario de datos de la clienta. Conserva lo escrito si el servidor devuelve un error. */
export function BookingForm({ hidden, privacyVersion, notice }: { hidden: Record<string, string>; privacyVersion: string | null; notice?: ReactNode }) {
  const [state, action] = useActionState<ActionState, FormData>(bookAction, {});
  const v = (state.data ?? {}) as Record<string, string | undefined>;
  return (
    <form action={action} className="space-y-3">
      {Object.entries(hidden).map(([k, val]) => (
        <input key={k} type="hidden" name={k} value={val} />
      ))}
      {/* Campo trampa: oculto para personas; si se llena, la solicitud se rechaza. */}
      <div aria-hidden="true" className="absolute -left-[10000px] h-px w-px overflow-hidden">
        <label>
          Sitio web (no llenar)
          <input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nombre">
          <input name="first_name" required maxLength={80} autoComplete="given-name" defaultValue={v.first_name} className={inputClass} />
        </Field>
        <Field label="Apellido (opcional)">
          <input name="last_name" maxLength={80} autoComplete="family-name" defaultValue={v.last_name} className={inputClass} />
        </Field>
        <Field label="Teléfono celular" hint="10 dígitos; te contactaremos por este número.">
          <input name="phone" type="tel" required inputMode="tel" autoComplete="tel" placeholder="999 123 4567" defaultValue={v.phone} className={inputClass} />
        </Field>
        <Field label="Correo (opcional)">
          <input name="email" type="email" autoComplete="email" defaultValue={v.email} className={inputClass} />
        </Field>
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="accept_privacy" defaultChecked={v.accept_privacy === "on"} className="mt-1 size-4" />
        <span>
          He leído y acepto el{" "}
          <Link href="/reservar/privacidad" target="_blank" className="underline">
            aviso de privacidad
          </Link>
          {privacyVersion ? ` (versión ${privacyVersion})` : ""}. <span className="text-muted">(obligatorio)</span>
        </span>
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="accept_reminders" defaultChecked={state.data ? v.accept_reminders === "on" : true} className="mt-1 size-4" />
        <span>Quiero recibir recordatorios de mi cita. (opcional)</span>
      </label>
      {notice}
      {state.error ? <ErrorNotice message={state.error} /> : null}
      <Submit />
    </form>
  );
}
