/**
 * Recognizes opt-out (STOP), opt-in (START) and HELP replies, in English and
 * Spanish. Only an exact keyword counts ("Stop." yes, "stop by Tuesday" no).
 * Messages that merely look like an opt-out are flagged for the owner to
 * confirm, because FCC rules require honoring opt-outs "by any reasonable means".
 */

const OPT_OUT = ["STOP", "STOPALL", "STOP ALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "REVOKE", "OPTOUT", "OPT OUT",
  "PARA", "PARAR", "ALTO", "BAJA", "DETENER", "CANCELAR"];
const OPT_IN = ["START", "UNSTOP", "YES", "COMENZAR", "INICIAR", "SI"];
const HELP = ["HELP", "INFO", "AYUDA"];

/** Keywords that tell us the person writes in Spanish, so we answer in Spanish. */
const SPANISH = new Set(["PARA", "PARAR", "ALTO", "BAJA", "DETENER", "CANCELAR", "COMENZAR", "INICIAR", "SI", "AYUDA"]);

/** Keywords the phone carrier/Twilio already answers on its own (so we don't double-reply). */
const CARRIER_HANDLED = new Set(["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "REVOKE", "OPTOUT",
  "START", "UNSTOP", "YES", "HELP", "INFO"]);

const POSSIBLE_OPT_OUT =
  /\b(stop (texting|messaging|sending)|unsubscribe|remove me|take me off|don'?t (text|message|contact) me|no more (texts|messages)|leave me alone|opt ?out|dejen? de (escribir|mandar|enviar)\w*|no me (escriban|manden|envien)|ya no quiero (mensajes|textos))\b/i;

export type InboundClassification = {
  kind: "opt_out" | "opt_in" | "help" | "message";
  /** The normalized keyword, when kind isn't "message". */
  keyword?: string;
  /** Something the owner should look at. */
  flag?: "opt_out" | "opt_in" | "help" | "cancel_keyword" | "possible_opt_out";
  /** True when Twilio/the carrier already sent its own automatic reply. */
  carrierReplies: boolean;
  /** Set when the keyword itself is Spanish. */
  language?: "es";
};

export function normalizeKeyword(body: string): string {
  return body
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function classifyInbound(body: string): InboundClassification {
  const word = normalizeKeyword(body);
  const language = SPANISH.has(word) ? ("es" as const) : undefined;

  if (OPT_OUT.includes(word)) {
    return {
      kind: "opt_out",
      keyword: word,
      // Lawn customers may text "cancel" meaning "cancel this week's mow".
      flag: word === "CANCEL" || word === "CANCELAR" ? "cancel_keyword" : "opt_out",
      carrierReplies: CARRIER_HANDLED.has(word.replace(" ", "")),
      language,
    };
  }
  if (OPT_IN.includes(word)) {
    return { kind: "opt_in", keyword: word, flag: "opt_in", carrierReplies: CARRIER_HANDLED.has(word), language };
  }
  if (HELP.includes(word)) {
    return { kind: "help", keyword: word, flag: "help", carrierReplies: CARRIER_HANDLED.has(word), language };
  }
  if (body.length <= 160 && POSSIBLE_OPT_OUT.test(body)) {
    return { kind: "message", flag: "possible_opt_out", carrierReplies: false };
  }
  return { kind: "message", carrierReplies: false };
}
