"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/components/forms";

type Conflict = { appointmentId: string | null; when: string; label: string };

/** Aprobar/rechazar una ausencia; si la BD reporta citas en el periodo, las lista con enlace. */
export function DecisionForm({ id, action, who }: { id: string; who: string; action: (prev: ActionState, form: FormData) => Promise<ActionState> }) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, {});
  const conflicts = (state.data?.conflicts ?? []) as Conflict[];
  return (
    <div className="space-y-2">
      <form action={formAction} className="flex flex-wrap gap-2">
        <input type="hidden" name="id" value={id} />
        <Buttons who={who} />
      </form>
      {state.error ? (
        <div role="alert" className="rounded-brand border border-danger/40 bg-danger/10 p-2 text-sm text-danger">
          <p>{state.error}</p>
          {conflicts.length > 0 ? (
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {conflicts.map((c, i) => (
                <li key={c.appointmentId ?? `b${i}`}>
                  {c.appointmentId ? (
                    <Link href={`/agenda/cita/${c.appointmentId}`} className="underline">
                      {c.when} · {c.label}
                    </Link>
                  ) : (
                    <span>
                      {c.when} · {c.label}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {state.ok ? (
        <p role="status" className="rounded-brand border border-success/40 bg-success/10 p-2 text-sm text-success">
          {state.ok}
        </p>
      ) : null}
    </div>
  );
}

function Buttons({ who }: { who: string }) {
  const { pending } = useFormStatus();
  return (
    <>
      <button
        type="submit"
        name="decision"
        value="approve"
        disabled={pending}
        aria-label={`Aprobar ausencia de ${who}`}
        className="inline-flex min-h-11 items-center justify-center rounded-brand bg-accent px-4 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-50"
      >
        Aprobar
      </button>
      <button
        type="submit"
        name="decision"
        value="reject"
        disabled={pending}
        aria-label={`Rechazar ausencia de ${who}`}
        className="inline-flex min-h-11 items-center justify-center rounded-brand border border-line bg-surface px-4 text-sm font-medium hover:bg-surface-muted disabled:opacity-50"
      >
        Rechazar
      </button>
      {pending ? <span className="self-center text-sm text-muted">Procesando…</span> : null}
    </>
  );
}
