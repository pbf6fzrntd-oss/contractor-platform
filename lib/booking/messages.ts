import type { Language } from "@/lib/business-types";

/**
 * Texts about a customer's own booking (category: informational). They go
 * through the normal send pipeline, so opt-outs and sending rules apply.
 * Never include private details (access notes, codes, VINs) here.
 */
export function bookingReceivedText(lang: Language, business: string, when: string): string {
  return lang === "es"
    ? `${business}: Recibimos su solicitud para ${when}. Le confirmamos pronto.`
    : `${business}: We got your request for ${when}. We'll confirm shortly.`;
}

export function bookingConfirmedText(lang: Language, business: string, when: string): string {
  return lang === "es" ? `${business}: ¡Listo! Su cita es ${when}. Responda aquí si necesita cambiarla.` : `${business}: You're booked for ${when}. Reply here if you need to change it.`;
}

export function bookingDeclinedText(lang: Language, business: string, when: string): string {
  return lang === "es"
    ? `${business}: Lo sentimos, no podemos atenderle ${when}. Responda aquí y buscamos otro horario.`
    : `${business}: Sorry, we can't make ${when} work. Reply here and we'll find another time.`;
}
