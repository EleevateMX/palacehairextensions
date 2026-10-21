/**
 * Máquina de estados de conversación (bot ↔ humano).
 *
 * Estados: automatic → pending_human → assigned → in_progress → resolved.
 * Regla clave: el bot SOLO puede responder en `automatic`. Cualquier otro estado lo silencia,
 * evitando respuestas simultáneas de bot y humano.
 */

export type ConversationState = "automatic" | "pending_human" | "assigned" | "in_progress" | "resolved";

export type HandoverReason = "customer_request" | "bot_unknown" | "bot_repeated_failure" | "sensitive_topic" | "manual";

export type ConversationEvent =
  | { type: "escalate"; reason: HandoverReason }
  | { type: "assign"; staffId: string }
  | { type: "agent_message"; staffId: string }
  | { type: "resolve" }
  | { type: "reactivate_bot"; byStaffId: string }
  | { type: "customer_message" };

export interface ConversationSnapshot {
  state: ConversationState;
  assignedStaffId: string | null;
  handoverReason: HandoverReason | null;
  botFailures: number;
}

export class InvalidTransition extends Error {}

export const MAX_BOT_FAILURES = 2;

export function canBotReply(s: ConversationSnapshot): boolean {
  return s.state === "automatic";
}

export function transition(s: ConversationSnapshot, e: ConversationEvent): ConversationSnapshot {
  switch (e.type) {
    case "escalate":
      if (s.state === "automatic" || s.state === "resolved")
        return { ...s, state: "pending_human", handoverReason: e.reason, assignedStaffId: null };
      return s; // ya está con humano: idempotente
    case "assign":
      if (s.state === "pending_human" || s.state === "assigned" || s.state === "in_progress")
        return { ...s, state: "assigned", assignedStaffId: e.staffId };
      throw new InvalidTransition(`No se puede asignar desde ${s.state}`);
    case "agent_message":
      // Un humano que escribe toma control aunque la conversación estuviera en automático.
      if (s.state === "resolved") throw new InvalidTransition("Conversación resuelta; reabrir primero");
      return { ...s, state: "in_progress", assignedStaffId: s.assignedStaffId ?? e.staffId };
    case "resolve":
      if (s.state === "automatic") throw new InvalidTransition("Nada que resolver");
      return { ...s, state: "resolved" };
    case "reactivate_bot":
      // Solo por regla explícita de una persona autorizada, y nunca con un caso abierto sin cerrar.
      if (s.state !== "resolved") throw new InvalidTransition("Resolver el caso antes de reactivar el bot");
      return { state: "automatic", assignedStaffId: null, handoverReason: null, botFailures: 0 };
    case "customer_message":
      // Nuevo mensaje tras resolución: sigue sin bot hasta reactivación explícita.
      if (s.state === "resolved") return { ...s, state: "pending_human" };
      return s;
  }
}

/** Registra un fallo del bot; al llegar al máximo escala automáticamente. */
export function recordBotFailure(s: ConversationSnapshot): ConversationSnapshot {
  const next = { ...s, botFailures: s.botFailures + 1 };
  return next.botFailures >= MAX_BOT_FAILURES ? transition(next, { type: "escalate", reason: "bot_repeated_failure" }) : next;
}
