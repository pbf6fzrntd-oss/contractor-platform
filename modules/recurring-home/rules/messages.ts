/**
 * Texts the module sends to customers (EN/ES). They never include the
 * "Reply STOP" line: the send pipeline adds it when needed.
 */
type Lang = "en" | "es";

export function renewalReminderText(lang: Lang, business: string, plan: string, date: string, autoRenew: boolean): string {
  if (lang === "es") {
    return autoRenew
      ? `${business}: Su plan "${plan}" se renueva el ${date}. No tiene que hacer nada para mantenerlo. ¿Preguntas o cambios? Responda a este mensaje.`
      : `${business}: Su plan "${plan}" termina el ${date}. Responda SI para renovarlo, o escríbanos si tiene preguntas.`;
  }
  return autoRenew
    ? `${business}: Your "${plan}" renews on ${date}. Nothing to do if you'd like to keep it. Questions or changes? Just reply.`
    : `${business}: Your "${plan}" ends on ${date}. Reply YES to renew, or reply with any questions.`;
}

export function formatDay(date: string, lang: Lang): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString(lang === "es" ? "es-US" : "en-US", { month: "long", day: "numeric", timeZone: "UTC" });
}
