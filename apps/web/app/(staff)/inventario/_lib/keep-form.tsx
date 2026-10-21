"use client";

import { type FormEvent, type ReactNode, startTransition, useActionState, useEffect, useRef } from "react";

type ActionState = { ok?: string; error?: string; data?: Record<string, unknown> };
type Action = (prev: ActionState, form: FormData) => Promise<ActionState>;

/**
 * Igual que <ActionForm>, pero NO borra lo capturado cuando la acción devuelve error.
 * React 19 reinicia los formularios con `action={...}` al terminar cada envío; aquí se envía
 * desde onSubmit para conservar los valores y solo se limpia si `resetOnSuccess` y salió bien.
 */
export function KeepForm({ action, children, className = "", resetOnSuccess = false }: {
  action: Action;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    const data = new FormData(e.currentTarget);
    startTransition(() => formAction(data));
  }
  return (
    <form ref={ref} onSubmit={onSubmit} className={className} aria-busy={pending || undefined}>
      <fieldset disabled={pending} className="contents">
        {children}
      </fieldset>
      {state.error && !pending ? (
        <p role="alert" className="mt-2 rounded-brand border border-danger/40 bg-danger/10 p-2 text-sm text-danger">
          {state.error}
        </p>
      ) : null}
      {state.ok && !pending ? (
        <p role="status" className="mt-2 rounded-brand border border-success/40 bg-success/10 p-2 text-sm text-success">
          {state.ok}
        </p>
      ) : null}
    </form>
  );
}
