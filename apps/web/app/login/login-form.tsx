"use client";

import { useActionState } from "react";
import { buttonClass, ErrorNotice, inputClass } from "@/components/ui";
import { login, type LoginState } from "./actions";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <label className="block space-y-1">
        <span className="text-sm font-medium">Correo</span>
        <input name="email" type="email" autoComplete="email" required className={inputClass} />
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium">Contraseña</span>
        <input name="password" type="password" autoComplete="current-password" required minLength={10} className={inputClass} />
      </label>
      {state.error ? <ErrorNotice message={state.error} /> : null}
      <button type="submit" disabled={pending} className={`${buttonClass} w-full`}>
        {pending ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
