"use client";

import { type ReactNode, useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";

export type ActionState = { ok?: string; error?: string; data?: Record<string, unknown> };
type Action = (prev: ActionState, form: FormData) => Promise<ActionState>;

export function SubmitButton({ children, variant = "primary", className = "", confirm }: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "danger";
  className?: string;
  /** Pide confirmación antes de enviar (acciones destructivas). */
  confirm?: string;
}) {
  const { pending } = useFormStatus();
  const styles = {
    primary: "bg-accent text-accent-fg",
    secondary: "border border-line bg-surface text-fg",
    danger: "bg-danger text-white",
  } as const;
  return (
    <button
      type="submit"
      disabled={pending}
      onClick={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
      className={`inline-flex min-h-11 items-center justify-center rounded-brand px-4 text-sm font-medium hover:opacity-90 disabled:opacity-50 ${styles[variant]} ${className}`}
    >
      {pending ? "Guardando…" : children}
    </button>
  );
}

/** Formulario con Server Action: muestra el error o confirmación devueltos. */
export function ActionForm({ action, children, className = "", resetOnSuccess = false }: {
  action: Action;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <form ref={ref} action={formAction} className={className}>
      {children}
      {state.error ? (
        <p role="alert" className="mt-2 rounded-brand border border-danger/40 bg-danger/10 p-2 text-sm text-danger">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p role="status" className="mt-2 rounded-brand border border-success/40 bg-success/10 p-2 text-sm text-success">
          {state.ok}
        </p>
      ) : null}
    </form>
  );
}
