"use client";

import { type FormEvent, type ReactNode, startTransition, useActionState, useEffect, useRef } from "react";
import type { ActionState } from "@/components/forms";

type Action = (prev: ActionState, form: FormData) => Promise<ActionState>;

/**
 * Como <ActionForm>, pero NO limpia los campos cuando la acción falla.
 * React 19 reinicia los formularios enviados con `action={…}`; aquí se envía con
 * onSubmit para que, si la base de datos rechaza la operación (p. ej. sin existencias),
 * la persona no pierda lo que ya eligió. Incluye el botón que envió (name/value).
 */
export function KeepValuesForm({
  action,
  children,
  className = "",
  resetOnSuccess = false,
  messagesOnTop = false,
}: {
  action: Action;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  /** Muestra el error/confirmación antes del contenido (formularios largos). */
  messagesOnTop?: boolean;
}) {
  const [state, dispatch, pending] = useActionState<ActionState, FormData>(action, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const data = new FormData(e.currentTarget, submitter);
    startTransition(() => dispatch(data));
  };
  const messages = pending ? (
    <p className="text-sm text-muted" role="status">
      Guardando…
    </p>
  ) : state.error ? (
    <p role="alert" className="rounded-brand border border-danger/40 bg-danger/10 p-2 text-sm text-danger">
      {state.error}
    </p>
  ) : state.ok ? (
    <p role="status" className="rounded-brand border border-success/40 bg-success/10 p-2 text-sm text-success">
      {state.ok}
    </p>
  ) : null;
  return (
    <form ref={ref} onSubmit={onSubmit} className={className} aria-busy={pending}>
      {messagesOnTop && messages ? <div className="mb-2">{messages}</div> : null}
      <fieldset disabled={pending} className="contents">
        {children}
      </fieldset>
      {!messagesOnTop && messages ? <div className="mt-2">{messages}</div> : null}
    </form>
  );
}
