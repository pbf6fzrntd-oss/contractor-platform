import { describe, expect, it } from "vitest";
import { classifyInbound, normalizeKeyword } from "@/lib/automation/keywords";

describe("opt-out keywords", () => {
  it.each(["STOP", "stop", "Stop.", " stop! ", "UNSUBSCRIBE", "End", "quit", "STOPALL", "Opt out", "revoke"])(
    "treats %j as an opt-out",
    (body) => {
      const r = classifyInbound(body);
      expect(r.kind).toBe("opt_out");
      expect(r.flag).toBe("opt_out");
    },
  );

  it.each(["PARA", "Parar", "alto", "BAJA", "detener"])("understands Spanish opt-out %j", (body) => {
    expect(classifyInbound(body).kind).toBe("opt_out");
  });

  it.each(["Cancel", "CANCELAR", "cancel."])("honors %j as an opt-out but flags it for the owner", (body) => {
    const r = classifyInbound(body);
    expect(r.kind).toBe("opt_out");
    expect(r.flag).toBe("cancel_keyword");
  });

  it.each(["stop by Tuesday", "Can you stop at 3?", "Para mañana está bien", "cancel my service this week", "I want to stop the weekly mowing"])(
    "does not treat a normal sentence as a keyword: %j",
    (body) => {
      expect(classifyInbound(body).kind).toBe("message");
    },
  );

  it.each(["Please stop texting me", "remove me from your list", "no more texts please", "Dejen de escribirme", "don't text me"])(
    "flags %j as a possible opt-out for the owner to confirm",
    (body) => {
      const r = classifyInbound(body);
      expect(r.kind).toBe("message");
      expect(r.flag).toBe("possible_opt_out");
    },
  );
});

describe("opt-in and help", () => {
  it.each(["START", "unstop", "Yes", "Sí", "si"])("recognizes %j as opt-in", (body) => {
    expect(classifyInbound(body).kind).toBe("opt_in");
  });

  it.each(["HELP", "help?", "INFO", "Ayuda"])("recognizes %j as help", (body) => {
    expect(classifyInbound(body).kind).toBe("help");
  });
});

describe("carrier auto-replies", () => {
  it("knows Twilio already answers standard English keywords", () => {
    expect(classifyInbound("STOP").carrierReplies).toBe(true);
    expect(classifyInbound("HELP").carrierReplies).toBe(true);
  });
  it("knows we must answer Spanish keywords ourselves", () => {
    expect(classifyInbound("PARA").carrierReplies).toBe(false);
    expect(classifyInbound("AYUDA").carrierReplies).toBe(false);
  });
});

describe("language", () => {
  it("notices Spanish keywords so the reply is in Spanish", () => {
    expect(classifyInbound("AYUDA").language).toBe("es");
    expect(classifyInbound("Para").language).toBe("es");
    expect(classifyInbound("HELP").language).toBeUndefined();
  });
});

describe("normalizeKeyword", () => {
  it("strips accents, punctuation and case", () => {
    expect(normalizeKeyword("  ¡Sí!  ")).toBe("SI");
    expect(normalizeKeyword("opt-out")).toBe("OPT OUT");
  });
});
