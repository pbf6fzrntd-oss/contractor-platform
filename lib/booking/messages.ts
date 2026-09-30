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

export function bookingConfirmedText(lang: Language, business: string, when: string, link?: string): string {
  if (link) {
    return lang === "es"
      ? `${business}: ¡Listo! Su cita es ${when}. Para cambiarla o cancelarla: ${link}`
      : `${business}: You're booked for ${when}. To reschedule or cancel: ${link}`;
  }
  return lang === "es" ? `${business}: ¡Listo! Su cita es ${when}. Responda aquí si necesita cambiarla.` : `${business}: You're booked for ${when}. Reply here if you need to change it.`;
}

/** Day-before reminder. */
export function bookingReminderText(lang: Language, business: string, when: string, link: string): string {
  return lang === "es"
    ? `${business}: Recordatorio de su cita ${when}. Responda C para confirmar o R para cambiarla. ${link}`
    : `${business}: Reminder: you're booked for ${when}. Reply C to confirm or R to reschedule. ${link}`;
}

/** Sent when a customer's AI agent requested a booking: proves the phone is theirs. */
export function agentBookingVerifyText(lang: Language, business: string, when: string, minutes: number): string {
  const hours = minutes >= 120 ? `${Math.round(minutes / 60)} hours` : `${minutes} minutes`;
  const horas = minutes >= 120 ? `${Math.round(minutes / 60)} horas` : `${minutes} minutos`;
  return lang === "es"
    ? `${business}: Un asistente de IA pidió una cita para este número: ${when}. Responda SI en ${horas} para confirmar que fue usted. Si no, ignore este mensaje.`
    : `${business}: An AI assistant requested a booking for this number: ${when}. Reply YES within ${hours} to confirm it was you. Otherwise, ignore this text.`;
}

/** Customer canceled (from their link). */
export function bookingCanceledText(lang: Language, business: string, when: string): string {
  return lang === "es" ? `${business}: Cancelamos su cita de ${when}. Responda aquí si quiere otra fecha.` : `${business}: Your booking for ${when} is canceled. Reply here if you'd like another time.`;
}

/** The owner didn't answer in time; the slot was released. */
export function bookingExpiredText(lang: Language, business: string, when: string): string {
  return lang === "es"
    ? `${business}: Lo sentimos, no pudimos confirmar ${when} a tiempo. Responda aquí y buscamos otro horario.`
    : `${business}: Sorry, we couldn't confirm ${when} in time. Reply here and we'll find another time.`;
}

/** Reply to "C" after a reminder. */
export function reminderConfirmedText(lang: Language, business: string, when: string): string {
  return lang === "es" ? `${business}: ¡Gracias! Nos vemos ${when}.` : `${business}: Thanks! See you ${when}.`;
}

/** Reply to "R" after a reminder. */
export function rescheduleLinkText(lang: Language, business: string, link: string): string {
  return lang === "es" ? `${business}: Elija otro horario aquí: ${link} (o responda y le ayudamos).` : `${business}: Pick a new time here: ${link} (or reply and we'll help).`;
}

export function bookingDeclinedText(lang: Language, business: string, when: string): string {
  return lang === "es"
    ? `${business}: Lo sentimos, no podemos atenderle ${when}. Responda aquí y buscamos otro horario.`
    : `${business}: Sorry, we can't make ${when} work. Reply here and we'll find another time.`;
}
