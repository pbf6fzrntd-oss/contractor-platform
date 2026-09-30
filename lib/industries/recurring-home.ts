import { CHECK, LIABILITY, voice, WORKERS_COMP } from "@/lib/industries/shared";
import type { IndustryConfig } from "@/lib/industries/types";

/**
 * Module A: Recurring Home Services (cleaning, pest control, pool service).
 * Route-based, repeat visits like lawn care. Coming soon: the configs are
 * here so the sales audit and demos work before the module ships.
 */
export const RECURRING_HOME_INDUSTRIES: IndustryConfig[] = [
  {
    key: "house_cleaning",
    label: "House cleaning",
    hint: "Recurring cleans, deep cleans, move-outs, vacation rentals",
    module: "recurring_home",
    status: "coming_soon",
    businessType: "recurring",
    schemaOrg: { type: "HomeAndConstructionBusiness" },
    subjectType: "property",
    bookingModes: ["recurring", "arrival_window"],
    services: [
      { key: "recurring_clean", name: { en: "Recurring clean", es: "Limpieza regular" }, priceFromCents: 12000, priceToCents: 22000, unit: "visit", durationMinutes: 150, bookingMode: "recurring" },
      { key: "deep_clean", name: { en: "Deep clean", es: "Limpieza profunda" }, priceFromCents: 25000, priceToCents: 50000, unit: "visit", durationMinutes: 300, bookingMode: "arrival_window" },
      { key: "move_out", name: { en: "Move-in / move-out clean", es: "Limpieza de mudanza" }, priceFromCents: 30000, priceToCents: 60000, unit: "visit", durationMinutes: 360, bookingMode: "arrival_window" },
      { key: "rental_turnover", name: { en: "Vacation rental turnover", es: "Limpieza entre huéspedes" }, priceFromCents: 10000, priceToCents: 25000, unit: "visit", bookingMode: "arrival_window" },
    ],
    stageLabels: { estimate_sent: "Quote sent", won: "Booked" },
    templates: {
      missed_call_reply: {
        en: "Sorry we missed your call! This is {business_name}. We're probably in the middle of a clean. Are you looking for regular cleaning, a deep clean or a move-out clean? Reply here and we'll get right back to you.",
        es: "¡Disculpe que no pudimos contestar! Le habla {business_name}. Seguramente estamos limpiando una casa. ¿Busca limpieza regular, limpieza profunda o de mudanza? Responda aquí y le contestamos pronto.",
      },
      review_request: {
        en: "Thanks for being a {business_name} customer, {first_name}! If you love coming home to a clean house, would you leave us a quick Google review? It really helps a local business: {review_link}",
        es: "¡Gracias por ser cliente de {business_name}, {first_name}! Si le encanta llegar a una casa limpia, ¿nos deja una reseña en Google? Nos ayuda mucho como negocio local: {review_link}",
      },
      rain_delay: {
        en: "{business_name}: We need to move your {service_day} cleaning to {new_day}. No need to reply. Thanks for understanding!",
        es: "{business_name}: Necesitamos cambiar su limpieza del {service_day} al {new_day}. No necesita responder. ¡Gracias por su comprensión!",
      },
    },
    campaignPresets: [
      { key: "campaign_spring_clean", title: "Spring deep clean", months: [3, 4], text: { en: "Hi {first_name}, {business_name} here. Pollen season is rough on floors and windowsills! We're booking spring deep cleans now. Reply YES to get on the schedule.", es: "Hola {first_name}, le escribe {business_name}. ¡El polen ensucia pisos y ventanas! Estamos programando limpiezas profundas de primavera. Responda SÍ para reservar." } },
      { key: "campaign_holiday_clean", title: "Holiday clean", months: [11, 12], text: { en: "Hi {first_name}, {business_name} here. Hosting for the holidays? We're booking pre-holiday deep cleans now. Reply YES to reserve a spot.", es: "Hola {first_name}, le escribe {business_name}. ¿Va a recibir visitas en las fiestas? Estamos programando limpiezas profundas. Responda SÍ para reservar." } },
    ],
    qualifyingQuestions: [
      { en: "How many bedrooms and bathrooms?", es: "¿Cuántas habitaciones y baños?" },
      { en: "Regular cleaning (weekly, every 2 weeks, monthly) or a one-time clean?", es: "¿Limpieza regular (semanal, cada 2 semanas, mensual) o de una sola vez?" },
      { en: "Any pets, and how will we get in (someone home, lockbox, code)?", es: "¿Tiene mascotas, y cómo entramos (alguien en casa, caja de llaves, código)?" },
      { en: "What's the address?", es: "¿Cuál es la dirección?" },
    ],
    voice: voice({ en: "Thanks for calling {business_name}. Are you looking for regular cleaning or a one-time clean?", es: "Gracias por llamar a {business_name}. ¿Busca limpieza regular o de una sola vez?" }, undefined, ["Never repeat a door code, lockbox code or alarm code out loud or by text."]),
    credentials: [
      LIABILITY,
      { kind: "bond", label: "Janitorial / fidelity bond", note: "Protects customers against theft claims; many homeowners ask." },
      { kind: "certification", label: "Background-checked staff", note: "Say so on your profile if every cleaner is checked." },
      WORKERS_COMP,
    ],
    auditChecks: [CHECK.onlineBooking, CHECK.priceRanges, CHECK.serviceArea, { key: "bonded_insured", label: "Says bonded and insured", why: "People letting strangers into their home look for this first.", weight: 2 }],
  },
  {
    key: "pest_control",
    label: "Pest control",
    hint: "Quarterly service, termites, mosquitoes",
    module: "recurring_home",
    status: "coming_soon",
    businessType: "recurring",
    schemaOrg: { type: "HomeAndConstructionBusiness" },
    subjectType: "property",
    bookingModes: ["recurring", "arrival_window"],
    services: [
      { key: "quarterly", name: { en: "Quarterly pest service", es: "Servicio trimestral de plagas" }, priceFromCents: 9900, priceToCents: 15000, unit: "visit", durationMinutes: 45, bookingMode: "recurring" },
      { key: "mosquito", name: { en: "Mosquito treatment (monthly, in season)", es: "Tratamiento de mosquitos (mensual, en temporada)" }, priceFromCents: 6500, priceToCents: 10000, unit: "visit", bookingMode: "recurring" },
      { key: "termite_inspection", name: { en: "Termite inspection", es: "Inspección de termitas" }, priceFromCents: 0, priceToCents: 15000, unit: "visit", bookingMode: "arrival_window" },
      { key: "termite_bond", name: { en: "Termite bond / protection plan", es: "Plan de protección contra termitas" }, priceFromCents: 25000, priceToCents: 60000, unit: "job" },
      { key: "wildlife", name: { en: "Rodent or wildlife exclusion", es: "Control de roedores o animales" }, priceFromCents: 25000, priceToCents: 150000, unit: "job" },
    ],
    stageLabels: { estimate_sent: "Quote sent", won: "Signed up" },
    templates: {
      missed_call_reply: {
        en: "Sorry we missed your call! This is {business_name}. We're probably out on a treatment. What pests are you seeing? Reply here and we'll get right back to you.",
        es: "¡Disculpe que no pudimos contestar! Le habla {business_name}. Seguramente estamos haciendo un tratamiento. ¿Qué plagas está viendo? Responda aquí y le contestamos pronto.",
      },
      review_request: {
        en: "Thanks for being a {business_name} customer, {first_name}! If we've kept the bugs away, would you leave us a quick Google review? It really helps a local business: {review_link}",
        es: "¡Gracias por ser cliente de {business_name}, {first_name}! Si hemos mantenido las plagas lejos, ¿nos deja una reseña en Google? Nos ayuda mucho como negocio local: {review_link}",
      },
      rain_delay: {
        en: "{business_name}: Rain today, so your {service_day} treatment is moving to {new_day} so it works properly. No need to reply. Thanks!",
        es: "{business_name}: Hoy llueve, así que su tratamiento del {service_day} pasa al {new_day} para que funcione bien. No necesita responder. ¡Gracias!",
      },
    },
    campaignPresets: [
      { key: "campaign_mosquito", title: "Mosquito season", months: [3, 4], text: { en: "Hi {first_name}, {business_name} here. Mosquito season is almost here! Monthly yard treatments start soon. Reply YES and we'll add you to the schedule.", es: "Hola {first_name}, le escribe {business_name}. ¡Ya casi empieza la temporada de mosquitos! Pronto empiezan los tratamientos mensuales del jardín. Responda SÍ y lo agregamos." } },
      { key: "campaign_termite", title: "Termite swarm season", months: [2, 3], text: { en: "Hi {first_name}, {business_name} here. Termites swarm in early spring. Want a free termite inspection? Reply YES.", es: "Hola {first_name}, le escribe {business_name}. Las termitas salen a principios de la primavera. ¿Quiere una inspección de termitas gratis? Responda SÍ." } },
      { key: "campaign_rodent", title: "Fall rodent-proofing", months: [10, 11], text: { en: "Hi {first_name}, {business_name} here. Cooler nights send mice and rats indoors. We're booking rodent-proofing now. Reply YES for a quote.", es: "Hola {first_name}, le escribe {business_name}. Con el frío, los ratones buscan entrar a las casas. Estamos programando sellado contra roedores. Responda SÍ para un presupuesto." } },
    ],
    qualifyingQuestions: [
      { en: "What are you seeing (ants, roaches, termites, rodents, mosquitoes)?", es: "¿Qué está viendo (hormigas, cucarachas, termitas, roedores, mosquitos)?" },
      { en: "Inside, outside, or both? How long has it been going on?", es: "¿Adentro, afuera o ambos? ¿Desde cuándo?" },
      { en: "Any kids, pets or allergies we should plan around?", es: "¿Hay niños, mascotas o alergias que debamos tener en cuenta?" },
      { en: "What's the address?", es: "¿Cuál es la dirección?" },
    ],
    voice: voice({ en: "Thanks for calling {business_name}. What kind of pests are you dealing with?", es: "Gracias por llamar a {business_name}. ¿Qué tipo de plaga tiene?" }, { triggers: ["someone swallowed pesticide", "bee or wasp swarm with an allergic person"], instruction: "Tell them to call 911 or Poison Control (1-800-222-1222) right away, then alert the owner." }, ["Never give instructions for using pest control products."]),
    credentials: [
      { kind: "license", label: "SC pest control business license and certified applicator", note: "Clemson Department of Pesticide Regulation. Required for anyone treating for pay.", requiredInSC: true },
      LIABILITY,
      WORKERS_COMP,
    ],
    auditChecks: [CHECK.licenseVisible, CHECK.onlineBooking, CHECK.serviceArea, { key: "pet_kid_safe", label: "Explains products and safety for kids and pets", why: "It's the #1 question families ask before hiring pest control.", weight: 1 }],
  },
  {
    key: "pool_service",
    label: "Pool service",
    hint: "Weekly cleaning, chemicals, repairs, openings",
    module: "recurring_home",
    status: "coming_soon",
    businessType: "recurring",
    schemaOrg: { type: "HomeAndConstructionBusiness" },
    subjectType: "property",
    bookingModes: ["recurring", "arrival_window"],
    services: [
      { key: "weekly", name: { en: "Weekly pool service", es: "Servicio semanal de piscina" }, priceFromCents: 3500, priceToCents: 6000, unit: "visit", durationMinutes: 30, bookingMode: "recurring" },
      { key: "green_to_clean", name: { en: "Green-to-clean", es: "Recuperación de piscina verde" }, priceFromCents: 25000, priceToCents: 70000, unit: "job", bookingMode: "arrival_window" },
      { key: "repair", name: { en: "Pump, filter or heater repair", es: "Reparación de bomba, filtro o calentador" }, priceFromCents: 15000, priceToCents: 150000, unit: "job" },
      { key: "opening", name: { en: "Seasonal opening", es: "Apertura de temporada" }, priceFromCents: 20000, priceToCents: 40000, unit: "job", bookingMode: "arrival_window" },
    ],
    stageLabels: { estimate_sent: "Quote sent", won: "Signed up" },
    templates: {
      missed_call_reply: {
        en: "Sorry we missed your call! This is {business_name}. We're probably poolside on a route. Is this about weekly service, a green pool, or a repair? Reply here and we'll get right back to you.",
        es: "¡Disculpe que no pudimos contestar! Le habla {business_name}. Seguramente estamos en una piscina. ¿Es por servicio semanal, una piscina verde o una reparación? Responda aquí y le contestamos pronto.",
      },
      review_request: {
        en: "Thanks for being a {business_name} customer, {first_name}! If you're enjoying a clear pool, would you leave us a quick Google review? It really helps a local business: {review_link}",
        es: "¡Gracias por ser cliente de {business_name}, {first_name}! Si está disfrutando su piscina limpia, ¿nos deja una reseña en Google? Nos ayuda mucho como negocio local: {review_link}",
      },
      rain_delay: {
        en: "{business_name}: Storms today, so your {service_day} pool service is moving to {new_day}. No need to reply. Thanks for understanding!",
        es: "{business_name}: Hay tormentas hoy, así que su servicio de piscina del {service_day} pasa al {new_day}. No necesita responder. ¡Gracias!",
      },
    },
    campaignPresets: [
      { key: "campaign_pool_opening", title: "Pool opening", months: [2, 3], text: { en: "Hi {first_name}, {business_name} here. Swim season is coming! We're booking pool openings and spring cleanups. Reply YES to get on the schedule.", es: "Hola {first_name}, le escribe {business_name}. ¡Ya viene la temporada de nadar! Estamos programando aperturas y limpiezas de piscina. Responda SÍ para reservar." } },
      { key: "campaign_hurricane_prep", title: "Storm prep", months: [6, 8], text: { en: "Hi {first_name}, {business_name} here. Storm season: want us to check your pump, filter and equipment before the next big one? Reply YES.", es: "Hola {first_name}, le escribe {business_name}. Temporada de tormentas: ¿revisamos su bomba, filtro y equipos antes de la próxima? Responda SÍ." } },
    ],
    qualifyingQuestions: [
      { en: "Is the water clear, cloudy or green right now?", es: "¿El agua está clara, turbia o verde ahora?" },
      { en: "Chlorine or saltwater? About how big is the pool?", es: "¿Cloro o agua salada? ¿Qué tan grande es la piscina?" },
      { en: "Any gate code or dogs in the yard?", es: "¿Hay código del portón o perros en el patio?" },
      { en: "What's the address?", es: "¿Cuál es la dirección?" },
    ],
    voice: voice({ en: "Thanks for calling {business_name}. Is this about weekly service, a green pool, or a repair?", es: "Gracias por llamar a {business_name}. ¿Es por servicio semanal, una piscina verde o una reparación?" }, { triggers: ["someone swallowed pool chemicals", "chemical burn", "electrical shock near the pool"], instruction: "Tell them to call 911 or Poison Control (1-800-222-1222), keep everyone out of the pool, then alert the owner." }),
    credentials: [
      { kind: "certification", label: "Certified Pool Operator (CPO)", note: "Recognized training on water chemistry and safety." },
      { kind: "license", label: "SC contractor license for pool repair or construction work", note: "May apply to equipment and structural work above a threshold. Verify with SC LLR." },
      LIABILITY,
    ],
    auditChecks: [CHECK.onlineBooking, CHECK.priceRanges, CHECK.serviceArea],
  },
];
