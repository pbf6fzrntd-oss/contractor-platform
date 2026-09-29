import type { BusinessType, Language } from "@/lib/business-types";
import { getIndustry } from "@/lib/industries";

/**
 * Built-in message templates, copied into each new business at onboarding.
 * Owners can edit their copies later (Settings > Templates).
 *
 * Rules for writing templates:
 *  - Always identify the business ({business_name}) near the start.
 *  - Keep them short (ideally under 160 characters) so each is one text.
 *  - Don't add "Reply STOP to opt out" here. The sending code adds it
 *    automatically to the first text a contact receives and to every
 *    marketing text, so owners can't accidentally delete it.
 *  - Every template needs English AND Spanish. Have a native speaker review
 *    Spanish wording before launch.
 *
 * Category decides who may receive the message (see CLAUDE.md):
 *  conversational = replies to someone who contacted the business
 *  informational  = about an estimate/job/service they already have
 *  marketing      = promotions; requires recorded marketing consent
 */

export const MESSAGE_CATEGORIES = ["conversational", "informational", "marketing"] as const;
export type MessageCategory = (typeof MESSAGE_CATEGORIES)[number];

/** Placeholders a template may use. Anything else is flagged as a typo. */
export const TEMPLATE_VARIABLES = [
  "business_name",
  "business_phone",
  "first_name",
  "review_link",
  "service_day",
  "new_day",
] as const;
export type TemplateVariable = (typeof TEMPLATE_VARIABLES)[number];

export type DefaultTemplate = {
  key: string;
  /** Short name shown in the template editor. */
  title: string;
  category: MessageCategory;
  businessTypes: readonly BusinessType[];
  text: Record<Language, string>;
};

const BOTH = ["project", "recurring"] as const;
const PROJECT = ["project"] as const;
const RECURRING = ["recurring"] as const;

export const DEFAULT_TEMPLATES: readonly DefaultTemplate[] = [
  // --- Missed-call text-back (Feature 1) ---------------------------------
  {
    key: "missed_call_reply",
    title: "Missed-call text-back",
    category: "conversational",
    businessTypes: PROJECT,
    text: {
      en: "Sorry we missed your call! This is {business_name}. We're probably on a job site. What can we help you with? Reply here and we'll get right back to you.",
      es: "¡Disculpe que no pudimos contestar! Le habla {business_name}. Seguramente estamos en una obra. ¿En qué le podemos ayudar? Responda aquí y le contestamos pronto.",
    },
  },
  {
    key: "missed_call_reply",
    title: "Missed-call text-back",
    category: "conversational",
    businessTypes: RECURRING,
    text: {
      en: "Sorry we missed your call! This is {business_name}. Our crew is out in the field. What can we help you with? Reply here and we'll get right back to you.",
      es: "¡Disculpe que no pudimos contestar! Le habla {business_name}. Nuestro equipo está trabajando afuera. ¿En qué le podemos ayudar? Responda aquí y le contestamos pronto.",
    },
  },

  // --- Estimate follow-ups (Feature 3) -----------------------------------
  {
    key: "estimate_followup_1",
    title: "Estimate follow-up #1",
    category: "informational",
    businessTypes: PROJECT,
    text: {
      en: "Hi {first_name}, it's {business_name}. Just checking that you got our estimate. Any questions we can answer?",
      es: "Hola {first_name}, le escribe {business_name}. ¿Recibió nuestro presupuesto? ¿Tiene alguna pregunta?",
    },
  },
  {
    key: "estimate_followup_1",
    title: "Quote follow-up #1",
    category: "informational",
    businessTypes: RECURRING,
    text: {
      en: "Hi {first_name}, it's {business_name}. Just checking that you got our quote. Any questions we can answer?",
      es: "Hola {first_name}, le escribe {business_name}. ¿Recibió nuestro presupuesto? ¿Tiene alguna pregunta?",
    },
  },
  {
    key: "estimate_followup_2",
    title: "Estimate follow-up #2",
    category: "informational",
    businessTypes: PROJECT,
    text: {
      en: "Hi {first_name}, {business_name} here. Following up on your estimate. Happy to walk through it or adjust anything. Just reply here.",
      es: "Hola {first_name}, le escribe {business_name}. Le damos seguimiento a su presupuesto. Con gusto se lo explicamos o lo ajustamos. Responda aquí.",
    },
  },
  {
    key: "estimate_followup_2",
    title: "Quote follow-up #2",
    category: "informational",
    businessTypes: RECURRING,
    text: {
      en: "Hi {first_name}, {business_name} here. Following up on your quote. Happy to answer questions or adjust anything. Just reply here.",
      es: "Hola {first_name}, le escribe {business_name}. Le damos seguimiento a su presupuesto. Con gusto se lo explicamos o lo ajustamos. Responda aquí.",
    },
  },
  {
    key: "estimate_followup_3",
    title: "Estimate follow-up #3",
    category: "informational",
    businessTypes: PROJECT,
    text: {
      en: "Hi {first_name}, last check-in from {business_name} about your estimate. If the timing isn't right, no problem. Just let us know and we'll close it out.",
      es: "Hola {first_name}, último mensaje de {business_name} sobre su presupuesto. Si no es buen momento, no hay problema. Avísenos y lo cerramos.",
    },
  },
  {
    key: "estimate_followup_3",
    title: "Quote follow-up #3",
    category: "informational",
    businessTypes: RECURRING,
    text: {
      en: "Hi {first_name}, last check-in from {business_name} about your quote. If the timing isn't right, no problem. Just let us know and we'll close it out.",
      es: "Hola {first_name}, último mensaje de {business_name} sobre su presupuesto. Si no es buen momento, no hay problema. Avísenos y lo cerramos.",
    },
  },

  // --- Review requests (Feature 4) ---------------------------------------
  {
    key: "review_request",
    title: "Google review request",
    category: "informational",
    businessTypes: PROJECT,
    text: {
      en: "Thanks for choosing {business_name}, {first_name}! If you were happy with our work, would you leave us a quick Google review? It really helps a local business: {review_link}",
      es: "¡Gracias por elegir a {business_name}, {first_name}! Si le gustó nuestro trabajo, ¿nos deja una reseña en Google? Nos ayuda mucho como negocio local: {review_link}",
    },
  },
  {
    key: "review_request",
    title: "Google review request",
    category: "informational",
    businessTypes: RECURRING,
    text: {
      en: "Thanks for being a {business_name} customer, {first_name}! If you like how your yard looks, would you leave us a quick Google review? It really helps a local business: {review_link}",
      es: "¡Gracias por ser cliente de {business_name}, {first_name}! Si le gusta cómo luce su jardín, ¿nos deja una reseña en Google? Nos ayuda mucho como negocio local: {review_link}",
    },
  },

  // --- Compliance auto-replies (STOP / HELP) -----------------------------
  {
    key: "help_reply",
    title: "HELP auto-reply",
    category: "conversational",
    businessTypes: BOTH,
    text: {
      en: "{business_name}: For help, call or text us at {business_phone}. Msg & data rates may apply. Reply STOP to opt out.",
      es: "{business_name}: Para ayuda, llámenos o escríbanos al {business_phone}. Pueden aplicar tarifas de mensajes y datos. Responda STOP para no recibir más mensajes.",
    },
  },
  {
    key: "opt_out_confirmation",
    title: "Opt-out confirmation",
    category: "conversational",
    businessTypes: BOTH,
    text: {
      en: "{business_name}: You're unsubscribed and won't get more texts from us. Reply START to resubscribe.",
      es: "{business_name}: Ya no recibirá más mensajes de nosotros. Responda START para volver a suscribirse.",
    },
  },

  {
    key: "opt_in_confirmation",
    title: "Resubscribe confirmation",
    category: "conversational",
    businessTypes: BOTH,
    text: {
      en: "{business_name}: You're resubscribed and will get texts from us again. Reply STOP to opt out.",
      es: "{business_name}: Volvió a suscribirse y recibirá nuestros mensajes otra vez. Responda STOP para cancelar.",
    },
  },

  // --- Service notices (Feature 6, lawn/landscaping) ---------------------
  {
    key: "rain_delay",
    title: "Rain delay",
    category: "informational",
    businessTypes: RECURRING,
    text: {
      en: "{business_name}: Rain today, so your {service_day} service is moving to {new_day}. No need to reply. Thanks for understanding!",
      es: "{business_name}: Hoy llueve, así que su servicio del {service_day} pasa al {new_day}. No necesita responder. ¡Gracias por su comprensión!",
    },
  },
  {
    key: "running_late",
    title: "Running late",
    category: "informational",
    businessTypes: RECURRING,
    text: {
      en: "{business_name}: Our crew is running a little behind today, but you're still on the schedule. Thanks for your patience!",
      es: "{business_name}: Nuestro equipo va un poco atrasado hoy, pero sí vamos a llegar. ¡Gracias por su paciencia!",
    },
  },

  // --- Seasonal campaigns (Feature 7, lawn/landscaping; marketing) -------
  {
    key: "campaign_aeration",
    title: "Aeration",
    category: "marketing",
    businessTypes: RECURRING,
    text: {
      en: "Hi {first_name}, {business_name} here. We're booking core aeration now. It helps your lawn soak up water and nutrients and come back thicker. Want in? Reply YES.",
      es: "Hola {first_name}, le escribe {business_name}. Estamos programando la aireación del césped. Ayuda a que su jardín absorba agua y nutrientes y crezca más tupido. ¿Le interesa? Responda SÍ.",
    },
  },
  {
    key: "campaign_overseeding",
    title: "Overseeding",
    category: "marketing",
    businessTypes: RECURRING,
    text: {
      en: "Hi {first_name}, {business_name} here. Want a green lawn this winter? We're scheduling overseeding now. Reply YES and we'll send you a price.",
      es: "Hola {first_name}, le escribe {business_name}. ¿Quiere un césped verde este invierno? Estamos programando la resiembra. Responda SÍ y le enviamos el precio.",
    },
  },
  {
    key: "campaign_leaf_cleanup",
    title: "Leaf cleanup",
    category: "marketing",
    businessTypes: RECURRING,
    text: {
      en: "Hi {first_name}, {business_name} here. Leaves are coming down and we're booking fall leaf cleanups now. Reply YES and we'll get you on the schedule.",
      es: "Hola {first_name}, le escribe {business_name}. Ya están cayendo las hojas y estamos programando limpiezas de otoño. Responda SÍ y lo agregamos al calendario.",
    },
  },
  {
    key: "campaign_spring_cleanup",
    title: "Spring cleanup",
    category: "marketing",
    businessTypes: RECURRING,
    text: {
      en: "Hi {first_name}, {business_name} here. Spring is almost here! We're booking spring cleanups (beds, trimming, debris removal). Reply YES to get on the schedule before we fill up.",
      es: "Hola {first_name}, le escribe {business_name}. ¡Ya casi llega la primavera! Estamos programando limpiezas de primavera (canteros, podas y retiro de escombros). Responda SÍ para reservar antes de que se llene la agenda.",
    },
  },
  {
    key: "campaign_mulch",
    title: "Mulch",
    category: "marketing",
    businessTypes: RECURRING,
    text: {
      en: "Hi {first_name}, {business_name} here. Fresh mulch makes beds look sharp and holds in moisture. We're scheduling installs now. Reply YES for a free quote.",
      es: "Hola {first_name}, le escribe {business_name}. El mantillo nuevo hace que sus canteros luzcan bien y conserva la humedad. Estamos programando instalaciones. Responda SÍ para un presupuesto gratis.",
    },
  },
  {
    key: "campaign_pine_straw",
    title: "Pine straw",
    category: "marketing",
    businessTypes: RECURRING,
    text: {
      en: "Hi {first_name}, {business_name} here. Time to refresh your pine straw! We're booking installs now. Reply YES for a free quote.",
      es: "Hola {first_name}, le escribe {business_name}. ¡Es hora de renovar la paja de pino! Estamos programando instalaciones. Responda SÍ para un presupuesto gratis.",
    },
  },
];

export type TemplateRow = {
  key: string;
  language: Language;
  category: MessageCategory;
  body: string;
};

/**
 * The template rows a new business of this type starts with (both languages).
 * A specific industry can replace the wording of some templates (same key,
 * category and rules); without one, the rows are exactly as before.
 */
export function defaultTemplatesFor(businessType: BusinessType, industry?: string | null): TemplateRow[] {
  const overrides = getIndustry(industry)?.templates ?? {};
  return DEFAULT_TEMPLATES.filter((t) => t.businessTypes.includes(businessType)).flatMap((t) =>
    (Object.keys(t.text) as Language[]).map((language) => ({
      key: t.key,
      language,
      category: t.category,
      body: overrides[t.key]?.[language] ?? t.text[language],
    })),
  );
}

/** Friendly title for a template key, for the editor. */
export function templateTitle(key: string, businessType: BusinessType): string {
  return (
    DEFAULT_TEMPLATES.find((t) => t.key === key && t.businessTypes.includes(businessType))?.title ??
    DEFAULT_TEMPLATES.find((t) => t.key === key)?.title ??
    key
  );
}
