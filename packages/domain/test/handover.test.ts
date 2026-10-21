import { describe, expect, it } from "vitest";
import { canBotReply, type ConversationSnapshot, InvalidTransition, recordBotFailure, transition } from "../src";

const fresh: ConversationSnapshot = { state: "automatic", assignedStaffId: null, handoverReason: null, botFailures: 0 };

describe("transferencia bot → humano", () => {
  it("escenario 10: el bot no sabe la respuesta y transfiere; queda silenciado", () => {
    const s = transition(fresh, { type: "escalate", reason: "bot_unknown" });
    expect(s.state).toBe("pending_human");
    expect(s.handoverReason).toBe("bot_unknown");
    expect(canBotReply(s)).toBe(false);
  });

  it("fallos repetidos escalan automáticamente", () => {
    const s = recordBotFailure(recordBotFailure(fresh));
    expect(s.state).toBe("pending_human");
    expect(s.handoverReason).toBe("bot_repeated_failure");
  });

  it("escenario 11: el humano toma control y el bot deja de intervenir hasta reactivación explícita", () => {
    let s = transition(fresh, { type: "escalate", reason: "customer_request" });
    s = transition(s, { type: "assign", staffId: "recepcion" });
    s = transition(s, { type: "agent_message", staffId: "recepcion" });
    expect(s.state).toBe("in_progress");
    expect(canBotReply(s)).toBe(false);
    expect(() => transition(s, { type: "reactivate_bot", byStaffId: "recepcion" })).toThrow(InvalidTransition);
    s = transition(s, { type: "resolve" });
    s = transition(s, { type: "customer_message" });
    expect(canBotReply(s)).toBe(false);
    s = transition(s, { type: "resolve" });
    s = transition(s, { type: "reactivate_bot", byStaffId: "admin" });
    expect(canBotReply(s)).toBe(true);
  });

  it("un humano que escribe en una conversación automática toma control", () => {
    const s = transition(fresh, { type: "agent_message", staffId: "recepcion" });
    expect(s.state).toBe("in_progress");
    expect(canBotReply(s)).toBe(false);
  });
});
