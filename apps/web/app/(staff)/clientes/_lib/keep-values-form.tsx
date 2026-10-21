"use client";

import { type ReactNode, startTransition, useActionState } from "react";
import type { ActionState } from "@/components/forms";

type Action = (prev: ActionState, form: FormData) => Promise<ActionState>;

/**
 * Como <ActionForm>, pero NO reinicia los campos si el servidor rechaza los datos
 * (React reinicia los formularios enviados con `action`; en formularios largos se perdería lo capturado).
 */
export function KeepValuesForm({ action, children, className = "" }: { action: Action; children: ReactNode; className?: string }) {
  const [state, dispatch, pending] = useActionState<ActionState, FormData>(action, {});
  return (
    <form
      className={className}
      aria-busy={pending}
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => dispatch(data));
      }}
    >
      <fieldset disabled={pending} className="contents">
        {children}
      </fieldset>
      {pending ? (
        <p role="status" className="mt-2 text-sm text-muted">
          Guardando…
        </p>
      ) : null}
      {!pending && state.error ? (
        <p role="alert" className="mt-2 rounded-brand border border-danger/40 bg-danger/10 p-2 text-sm text-danger">
          {state.error}
        </p>
      ) : null}
      {!pending && state.ok ? (
        <p role="status" className="mt-2 rounded-brand border border-success/40 bg-success/10 p-2 text-sm text-success">
          {state.ok}
        </p>
      ) : null}
    </form>
  );
}
