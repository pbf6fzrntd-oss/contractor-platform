/** Tiny helpers for building TwiML (Twilio's XML call instructions). */

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function twiml(inner: string): Response {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`, {
    headers: { "Content-Type": "text/xml" },
  });
}

export function say(text: string, language: "en" | "es" = "en"): string {
  return `<Say language="${language === "es" ? "es-MX" : "en-US"}">${escapeXml(text)}</Say>`;
}

/** Caller-facing greeting when nobody picks up. */
export function missedCallGreeting(businessName: string, language: "en" | "es"): string {
  return language === "es"
    ? `Gracias por llamar a ${businessName}. No podemos contestar ahora, pero le enviaremos un mensaje de texto enseguida.`
    : `Thanks for calling ${businessName}. We can't pick up right now, but we're texting you right away.`;
}
