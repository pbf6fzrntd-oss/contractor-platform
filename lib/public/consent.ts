/** The exact words a customer agrees to when booking online (stored in the consent log). */
export function bookingConsentText(business: string, lang: "en" | "es" = "en"): string {
  return lang === "es"
    ? `Acepto recibir mensajes de texto de ${business} sobre esta cita (confirmaciones, recordatorios y cambios). La frecuencia varía. Pueden aplicar tarifas de mensajes y datos. Responda STOP para cancelar y HELP para ayuda.`
    : `I agree to receive text messages from ${business} about this booking (confirmations, reminders and updates). Message frequency varies. Msg & data rates may apply. Reply STOP to opt out, HELP for help.`;
}
