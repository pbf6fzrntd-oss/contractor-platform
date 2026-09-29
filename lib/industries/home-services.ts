import type { IndustryConfig, VoiceScript } from "@/lib/industries/types";

/**
 * Home Services (the flagship edition): today's trades and lawn care, now as
 * specific industries. Businesses that haven't picked one keep the generic
 * behavior. Price ranges are rough Charleston-area starting points for the
 * owner to edit; they're never quoted as firm prices.
 */

const NEVER_BASE = [
  "Never quote a firm price. Give the typical range only and say the owner confirms the exact price.",
  "Never promise an arrival time or date the owner hasn't set.",
  "Never give repair or safety instructions beyond: leave the area, and call 911 if anyone is in danger.",
];

function voice(greetingEn: string, greetingEs: string, emergency?: VoiceScript["emergency"]): VoiceScript {
  return { greeting: { en: greetingEn, es: greetingEs }, emergency, never: NEVER_BASE };
}

const LIABILITY = { kind: "insurance", label: "General liability insurance", note: "Customers and property managers often ask for a certificate." } as const;
const WORKERS_COMP = {
  kind: "insurance",
  label: "Workers' compensation insurance",
  note: "Required in SC once you have 4 or more employees.",
} as const;

const SHOWS_LICENSE = {
  key: "license_visible",
  label: "License and insurance shown on the website",
  why: "Customers and AI assistants look for proof you're licensed and insured before recommending you.",
  weight: 2,
} as const;
const EMERGENCY_LINE = {
  key: "emergency_service",
  label: "Emergency / after-hours service is clearly stated",
  why: "People with an urgent problem pick whoever clearly says they come after hours.",
  weight: 2,
} as const;
const PHOTOS = {
  key: "project_photos",
  label: "Photos of real past jobs",
  why: "Before-and-after photos build trust faster than any description.",
  weight: 1,
} as const;
const FINANCING = {
  key: "financing",
  label: "Financing options mentioned",
  why: "Big-ticket jobs close faster when customers know they can pay over time.",
  weight: 1,
} as const;

export const HOME_SERVICES_INDUSTRIES: IndustryConfig[] = [
  {
    key: "roofing",
    label: "Roofing",
    hint: "Repairs, replacements, storm and insurance work",
    module: "home_services",
    status: "available",
    businessType: "project",
    schemaOrg: { type: "RoofingContractor" },
    subjectType: "property",
    bookingModes: ["arrival_window"],
    services: [
      { key: "inspection", name: { en: "Roof inspection", es: "Inspección de techo" }, priceFromCents: 0, priceToCents: 25000, unit: "visit", durationMinutes: 60, bookingMode: "arrival_window" },
      { key: "repair", name: { en: "Roof repair", es: "Reparación de techo" }, priceFromCents: 35000, priceToCents: 150000, unit: "job" },
      { key: "replacement", name: { en: "Roof replacement", es: "Reemplazo de techo" }, priceFromCents: 900000, priceToCents: 2500000, unit: "job" },
      { key: "storm", name: { en: "Storm damage / insurance claim", es: "Daños por tormenta / reclamo al seguro" }, unit: "job" },
      { key: "tarp", name: { en: "Emergency tarp", es: "Lona de emergencia" }, priceFromCents: 30000, priceToCents: 90000, unit: "job" },
    ],
    templates: {
      missed_call_reply: {
        en: "Sorry we missed your call! This is {business_name}. We're probably up on a roof. Is this about a leak, storm damage or a new roof? Reply here and we'll get right back to you.",
        es: "¡Disculpe que no pudimos contestar! Le habla {business_name}. Seguramente estamos arriba de un techo. ¿Es por una gotera, daños por tormenta o un techo nuevo? Responda aquí y le contestamos pronto.",
      },
    },
    qualifyingQuestions: [
      { en: "Is it leaking right now?", es: "¿Está goteando ahora mismo?" },
      { en: "Is this from a storm, and are you filing an insurance claim?", es: "¿Fue por una tormenta y va a hacer un reclamo al seguro?" },
      { en: "About how old is the roof, and is it shingle, metal or flat?", es: "¿Qué edad tiene el techo, y es de tejas, metal o plano?" },
      { en: "What's the property address?", es: "¿Cuál es la dirección de la propiedad?" },
    ],
    voice: voice(
      "Thanks for calling {business_name}. Is this about a leak, storm damage, or a new roof?",
      "Gracias por llamar a {business_name}. ¿Llama por una gotera, daños por tormenta o un techo nuevo?",
      { triggers: ["water coming in", "ceiling sagging", "tree on the roof"], instruction: "Tell the caller to stay out of rooms with a sagging ceiling, then connect them to the owner right away." },
    ),
    credentials: [
      { kind: "license", label: "SC residential specialty contractor (roofing) registration", note: "SC LLR Residential Builders Commission. Commercial roofing uses the Contractor's Licensing Board. Verify with SC LLR.", requiredInSC: true },
      LIABILITY,
      WORKERS_COMP,
      { kind: "certification", label: "Manufacturer certification (e.g. GAF, Owens Corning)", note: "Lets you offer stronger warranties." },
    ],
    auditChecks: [SHOWS_LICENSE, PHOTOS, FINANCING, { key: "storm_help", label: "Explains storm damage and insurance claim help", why: "After a storm, homeowners search for roofers who handle the insurance side.", weight: 2 }],
  },
  {
    key: "hvac",
    label: "Heating & air (HVAC)",
    hint: "AC and heat repair, tune-ups, new systems",
    module: "home_services",
    status: "available",
    businessType: "project",
    schemaOrg: { type: "HVACBusiness" },
    subjectType: "property",
    bookingModes: ["arrival_window"],
    services: [
      { key: "diagnostic", name: { en: "Repair visit (diagnosis)", es: "Visita de reparación (diagnóstico)" }, priceFromCents: 8900, priceToCents: 15000, unit: "visit", durationMinutes: 90, bookingMode: "arrival_window" },
      { key: "tune_up", name: { en: "Tune-up", es: "Mantenimiento" }, priceFromCents: 8900, priceToCents: 14900, unit: "visit", durationMinutes: 60, bookingMode: "arrival_window" },
      { key: "new_system", name: { en: "New AC / heat pump system", es: "Sistema nuevo de aire / bomba de calor" }, priceFromCents: 600000, priceToCents: 1500000, unit: "job" },
      { key: "maintenance_plan", name: { en: "Maintenance plan", es: "Plan de mantenimiento" }, priceFromCents: 1500, priceToCents: 3000, unit: "month" },
      { key: "ducts", name: { en: "Duct cleaning or repair", es: "Limpieza o reparación de ductos" }, priceFromCents: 30000, priceToCents: 150000, unit: "job" },
    ],
    templates: {
      missed_call_reply: {
        en: "Sorry we missed your call! This is {business_name}. We're probably on a service call. Is your AC or heat not working, or do you need a tune-up or quote? Reply here and we'll get right back to you.",
        es: "¡Disculpe que no pudimos contestar! Le habla {business_name}. Seguramente estamos en una visita. ¿No le funciona el aire o la calefacción, o necesita mantenimiento o un presupuesto? Responda aquí y le contestamos pronto.",
      },
    },
    qualifyingQuestions: [
      { en: "Is it the AC or the heat, and is it running at all?", es: "¿Es el aire o la calefacción, y está funcionando algo?" },
      { en: "Is anyone at home at risk from the heat or cold (baby, elderly, medical needs)?", es: "¿Hay alguien en casa en riesgo por el calor o el frío (bebé, personas mayores, necesidades médicas)?" },
      { en: "About how old is the system?", es: "¿Qué edad tiene el sistema, más o menos?" },
      { en: "What's the address, and when is someone home?", es: "¿Cuál es la dirección y cuándo hay alguien en casa?" },
    ],
    voice: voice(
      "Thanks for calling {business_name}. Is your AC or heat not working, or are you calling about a tune-up or a new system?",
      "Gracias por llamar a {business_name}. ¿No le funciona el aire o la calefacción, o llama por mantenimiento o un sistema nuevo?",
      { triggers: ["gas smell", "carbon monoxide alarm", "no AC with an infant or elderly person"], instruction: "For a gas smell or CO alarm: tell them to leave the house and call 911 or the gas company, then alert the owner. For heat risk to vulnerable people: connect to the owner right away." },
    ),
    credentials: [
      { kind: "license", label: "SC mechanical contractor license or residential HVAC specialty", note: "SC LLR Contractor's Licensing Board (commercial) or Residential Builders Commission (residential). Verify with SC LLR.", requiredInSC: true },
      { kind: "certification", label: "EPA Section 608 certification", note: "Federal requirement for anyone handling refrigerant.", requiredInSC: true },
      { kind: "certification", label: "NATE certification", note: "Optional, but customers recognize it." },
      LIABILITY,
      WORKERS_COMP,
    ],
    auditChecks: [SHOWS_LICENSE, EMERGENCY_LINE, FINANCING, { key: "maintenance_plan", label: "Maintenance plan offered online", why: "Plans bring steady monthly income and rank well when people ask AI for 'AC tune-up near me'.", weight: 1 }],
  },
  {
    key: "plumbing",
    label: "Plumbing",
    hint: "Leaks, drains, water heaters",
    module: "home_services",
    status: "available",
    businessType: "project",
    schemaOrg: { type: "Plumber" },
    subjectType: "property",
    bookingModes: ["arrival_window"],
    services: [
      { key: "service_call", name: { en: "Service call", es: "Visita de servicio" }, priceFromCents: 9900, priceToCents: 19900, unit: "visit", durationMinutes: 90, bookingMode: "arrival_window" },
      { key: "drain", name: { en: "Drain cleaning", es: "Destape de drenaje" }, priceFromCents: 15000, priceToCents: 45000, unit: "job" },
      { key: "water_heater", name: { en: "Water heater install", es: "Instalación de calentador de agua" }, priceFromCents: 120000, priceToCents: 350000, unit: "job" },
      { key: "leak", name: { en: "Leak repair", es: "Reparación de fuga" }, priceFromCents: 15000, priceToCents: 80000, unit: "job" },
    ],
    templates: {
      missed_call_reply: {
        en: "Sorry we missed your call! This is {business_name}. We're probably on a job. Is water leaking right now? Reply here and tell us what's going on. We'll get right back to you.",
        es: "¡Disculpe que no pudimos contestar! Le habla {business_name}. Seguramente estamos en un trabajo. ¿Hay una fuga de agua ahora mismo? Responda aquí y cuéntenos qué pasa. Le contestamos pronto.",
      },
    },
    qualifyingQuestions: [
      { en: "Is water leaking right now? Do you know where the main shut-off is?", es: "¿Hay una fuga ahora mismo? ¿Sabe dónde está la llave de paso principal?" },
      { en: "Is it a drain, a leak, the water heater, or something else?", es: "¿Es un drenaje, una fuga, el calentador de agua u otra cosa?" },
      { en: "Is the water heater gas or electric, and how old is it?", es: "¿El calentador es de gas o eléctrico, y qué edad tiene?" },
      { en: "What's the address?", es: "¿Cuál es la dirección?" },
    ],
    voice: voice(
      "Thanks for calling {business_name}. Is water leaking right now, or is this about a drain, a water heater, or something else?",
      "Gracias por llamar a {business_name}. ¿Hay una fuga ahora mismo, o es por un drenaje, un calentador de agua u otra cosa?",
      { triggers: ["flooding", "sewage backing up", "gas smell"], instruction: "For a gas smell: tell them to leave and call 911 or the gas company. For flooding or sewage: connect to the owner right away." },
    ),
    credentials: [
      { kind: "license", label: "SC plumbing license (mechanical or residential specialty)", note: "SC LLR. Some cities also require a local business license. Verify with SC LLR.", requiredInSC: true },
      LIABILITY,
      WORKERS_COMP,
    ],
    auditChecks: [SHOWS_LICENSE, EMERGENCY_LINE, { key: "upfront_pricing", label: "Service-call fee or pricing approach explained", why: "Customers and AI assistants prefer businesses that are clear about what a visit costs.", weight: 1 }],
  },
  {
    key: "electrical",
    label: "Electrical",
    hint: "Repairs, panels, generators, lighting",
    module: "home_services",
    status: "available",
    businessType: "project",
    schemaOrg: { type: "Electrician" },
    subjectType: "property",
    bookingModes: ["arrival_window"],
    services: [
      { key: "service_call", name: { en: "Service call", es: "Visita de servicio" }, priceFromCents: 9900, priceToCents: 19900, unit: "visit", durationMinutes: 90, bookingMode: "arrival_window" },
      { key: "panel", name: { en: "Panel upgrade", es: "Cambio de panel eléctrico" }, priceFromCents: 180000, priceToCents: 450000, unit: "job" },
      { key: "generator", name: { en: "Generator install", es: "Instalación de generador" }, priceFromCents: 500000, priceToCents: 1500000, unit: "job" },
      { key: "ev_charger", name: { en: "EV charger install", es: "Instalación de cargador para auto eléctrico" }, priceFromCents: 80000, priceToCents: 250000, unit: "job" },
      { key: "lighting", name: { en: "Lighting and fans", es: "Luces y ventiladores" }, priceFromCents: 15000, priceToCents: 80000, unit: "job" },
    ],
    templates: {
      missed_call_reply: {
        en: "Sorry we missed your call! This is {business_name}. We're probably on a job. What do you need help with? If you see sparks or smell burning, call 911 first. Reply here and we'll get right back to you.",
        es: "¡Disculpe que no pudimos contestar! Le habla {business_name}. Seguramente estamos en un trabajo. ¿En qué le podemos ayudar? Si ve chispas o huele a quemado, llame primero al 911. Responda aquí y le contestamos pronto.",
      },
    },
    qualifyingQuestions: [
      { en: "Is anything sparking, buzzing or smelling like it's burning?", es: "¿Algo está echando chispas, zumbando u oliendo a quemado?" },
      { en: "Is the power out in part of the house or all of it?", es: "¿Se fue la luz en parte de la casa o en toda?" },
      { en: "Is this a repair, or new work like a panel, generator or EV charger?", es: "¿Es una reparación o un trabajo nuevo como panel, generador o cargador de auto?" },
      { en: "What's the address?", es: "¿Cuál es la dirección?" },
    ],
    voice: voice(
      "Thanks for calling {business_name}. Is this a repair, or new work like a panel, generator or charger?",
      "Gracias por llamar a {business_name}. ¿Es una reparación o un trabajo nuevo como panel, generador o cargador?",
      { triggers: ["sparks", "burning smell", "smoke", "shock"], instruction: "Tell them to stay away from it and call 911 if there's smoke, fire or an injury. Then alert the owner." },
    ),
    credentials: [
      { kind: "license", label: "SC electrical license", note: "SC LLR (Contractor's Licensing Board or Residential Builders Commission). Verify with SC LLR.", requiredInSC: true },
      LIABILITY,
      WORKERS_COMP,
    ],
    auditChecks: [SHOWS_LICENSE, EMERGENCY_LINE, { key: "generator_ev", label: "Generator and EV charger work listed", why: "These are fast-growing searches in hurricane country.", weight: 1 }],
  },
  {
    key: "remodeling",
    label: "Remodeling / general contractor",
    hint: "Kitchens, baths, additions, renovations",
    module: "home_services",
    status: "available",
    businessType: "project",
    schemaOrg: { type: "GeneralContractor" },
    subjectType: "property",
    bookingModes: ["arrival_window"],
    services: [
      { key: "consult", name: { en: "In-home consultation", es: "Consulta en casa" }, priceFromCents: 0, unit: "visit", durationMinutes: 60, bookingMode: "arrival_window" },
      { key: "kitchen", name: { en: "Kitchen remodel", es: "Remodelación de cocina" }, priceFromCents: 2500000, priceToCents: 9000000, unit: "job" },
      { key: "bath", name: { en: "Bathroom remodel", es: "Remodelación de baño" }, priceFromCents: 1200000, priceToCents: 4500000, unit: "job" },
      { key: "addition", name: { en: "Addition / porch", es: "Ampliación / porche" }, priceFromCents: 3000000, unit: "job" },
    ],
    qualifyingQuestions: [
      { en: "What room or project, and what would you like changed?", es: "¿Qué cuarto o proyecto, y qué le gustaría cambiar?" },
      { en: "Do you have a budget range in mind?", es: "¿Tiene un presupuesto aproximado en mente?" },
      { en: "When would you like to start?", es: "¿Cuándo le gustaría empezar?" },
      { en: "What's the address?", es: "¿Cuál es la dirección?" },
    ],
    voice: voice(
      "Thanks for calling {business_name}. What project are you thinking about?",
      "Gracias por llamar a {business_name}. ¿Qué proyecto tiene en mente?",
    ),
    credentials: [
      { kind: "license", label: "SC residential builder license or general contractor license", note: "SC LLR Residential Builders Commission (homes) or Contractor's Licensing Board (commercial). Verify the dollar thresholds with SC LLR.", requiredInSC: true },
      LIABILITY,
      WORKERS_COMP,
    ],
    auditChecks: [SHOWS_LICENSE, PHOTOS, FINANCING],
  },
  {
    key: "painting",
    label: "Painting",
    hint: "Interior and exterior painting",
    module: "home_services",
    status: "available",
    businessType: "project",
    schemaOrg: { type: "HousePainter" },
    subjectType: "property",
    bookingModes: ["arrival_window"],
    services: [
      { key: "estimate", name: { en: "Free estimate", es: "Presupuesto gratis" }, priceFromCents: 0, unit: "visit", durationMinutes: 45, bookingMode: "arrival_window" },
      { key: "interior", name: { en: "Interior painting", es: "Pintura interior" }, priceFromCents: 50000, priceToCents: 800000, unit: "job" },
      { key: "exterior", name: { en: "Exterior painting", es: "Pintura exterior" }, priceFromCents: 350000, priceToCents: 1500000, unit: "job" },
      { key: "cabinets", name: { en: "Cabinet painting", es: "Pintura de gabinetes" }, priceFromCents: 300000, priceToCents: 900000, unit: "job" },
    ],
    qualifyingQuestions: [
      { en: "Inside, outside, or both? Which rooms or areas?", es: "¿Adentro, afuera o ambos? ¿Qué cuartos o áreas?" },
      { en: "Is the house older than 1978? (Lead-safe practices may apply.)", es: "¿La casa es de antes de 1978? (Pueden aplicar prácticas seguras con plomo.)" },
      { en: "When would you like it done?", es: "¿Para cuándo lo necesita?" },
      { en: "What's the address?", es: "¿Cuál es la dirección?" },
    ],
    voice: voice("Thanks for calling {business_name}. Are you thinking about inside, outside, or both?", "Gracias por llamar a {business_name}. ¿Piensa pintar adentro, afuera o ambos?"),
    credentials: [
      { kind: "certification", label: "EPA Lead-Safe (RRP) certification", note: "Federal requirement for work on homes built before 1978.", requiredInSC: true },
      { kind: "license", label: "SC residential specialty registration (painting)", note: "May be required above a job-size threshold. Verify with SC LLR." },
      LIABILITY,
    ],
    auditChecks: [SHOWS_LICENSE, PHOTOS],
  },
  {
    key: "gutters",
    label: "Gutters",
    hint: "Install, cleaning, guards",
    module: "home_services",
    status: "available",
    businessType: "project",
    schemaOrg: { type: "HomeAndConstructionBusiness" },
    subjectType: "property",
    bookingModes: ["arrival_window", "day_capacity"],
    services: [
      { key: "cleaning", name: { en: "Gutter cleaning", es: "Limpieza de canaletas" }, priceFromCents: 12500, priceToCents: 30000, unit: "visit", bookingMode: "day_capacity" },
      { key: "install", name: { en: "Seamless gutter install", es: "Instalación de canaletas sin costura" }, priceFromCents: 150000, priceToCents: 500000, unit: "job" },
      { key: "guards", name: { en: "Gutter guards", es: "Protectores de canaletas" }, priceFromCents: 100000, priceToCents: 400000, unit: "job" },
    ],
    qualifyingQuestions: [
      { en: "Cleaning, new gutters, or guards?", es: "¿Limpieza, canaletas nuevas o protectores?" },
      { en: "One story or two?", es: "¿Es de un piso o dos?" },
      { en: "What's the address?", es: "¿Cuál es la dirección?" },
    ],
    voice: voice("Thanks for calling {business_name}. Is this about cleaning, new gutters, or gutter guards?", "Gracias por llamar a {business_name}. ¿Es por limpieza, canaletas nuevas o protectores?"),
    credentials: [LIABILITY, WORKERS_COMP],
    auditChecks: [PHOTOS],
  },
  {
    key: "fencing",
    label: "Fencing",
    hint: "Wood, vinyl, aluminum fences and gates",
    module: "home_services",
    status: "available",
    businessType: "project",
    schemaOrg: { type: "HomeAndConstructionBusiness" },
    subjectType: "property",
    bookingModes: ["arrival_window"],
    services: [
      { key: "estimate", name: { en: "Free estimate", es: "Presupuesto gratis" }, priceFromCents: 0, unit: "visit", durationMinutes: 45, bookingMode: "arrival_window" },
      { key: "wood", name: { en: "Wood fence", es: "Cerca de madera" }, priceFromCents: 300000, priceToCents: 1200000, unit: "job" },
      { key: "vinyl", name: { en: "Vinyl fence", es: "Cerca de vinilo" }, priceFromCents: 500000, priceToCents: 1800000, unit: "job" },
      { key: "repair", name: { en: "Fence or gate repair", es: "Reparación de cerca o portón" }, priceFromCents: 20000, priceToCents: 150000, unit: "job" },
    ],
    qualifyingQuestions: [
      { en: "About how many feet of fence, and what material?", es: "¿Cuántos pies de cerca más o menos, y de qué material?" },
      { en: "Is there an HOA that needs to approve it?", es: "¿Hay una asociación de vecinos (HOA) que tenga que aprobarla?" },
      { en: "What's the address?", es: "¿Cuál es la dirección?" },
    ],
    voice: voice("Thanks for calling {business_name}. Are you looking for a new fence or a repair?", "Gracias por llamar a {business_name}. ¿Busca una cerca nueva o una reparación?"),
    credentials: [{ kind: "license", label: "SC residential specialty registration", note: "May apply above a job-size threshold. Verify with SC LLR." }, LIABILITY],
    auditChecks: [PHOTOS, FINANCING],
  },
  {
    key: "tree_service",
    label: "Tree service",
    hint: "Removal, trimming, storm cleanup",
    module: "home_services",
    status: "available",
    businessType: "project",
    schemaOrg: { type: "HomeAndConstructionBusiness" },
    subjectType: "property",
    bookingModes: ["arrival_window", "day_capacity"],
    services: [
      { key: "estimate", name: { en: "Free estimate", es: "Presupuesto gratis" }, priceFromCents: 0, unit: "visit", bookingMode: "arrival_window" },
      { key: "removal", name: { en: "Tree removal", es: "Remoción de árbol" }, priceFromCents: 50000, priceToCents: 400000, unit: "job" },
      { key: "trimming", name: { en: "Trimming / pruning", es: "Poda" }, priceFromCents: 30000, priceToCents: 150000, unit: "job" },
      { key: "storm", name: { en: "Storm cleanup", es: "Limpieza después de tormenta" }, unit: "job" },
      { key: "stump", name: { en: "Stump grinding", es: "Triturado de tocón" }, priceFromCents: 15000, priceToCents: 50000, unit: "job" },
    ],
    qualifyingQuestions: [
      { en: "Is a tree down on the house, a car or power lines?", es: "¿Hay un árbol caído sobre la casa, un auto o cables eléctricos?" },
      { en: "Removal, trimming or stump grinding? About how tall?", es: "¿Remoción, poda o triturado de tocón? ¿Qué tan alto es?" },
      { en: "What's the address?", es: "¿Cuál es la dirección?" },
    ],
    voice: voice(
      "Thanks for calling {business_name}. Is a tree down, or are you looking for removal or trimming?",
      "Gracias por llamar a {business_name}. ¿Hay un árbol caído, o busca remoción o poda?",
      { triggers: ["tree on power lines", "tree on the house", "someone trapped"], instruction: "Power lines: tell them to stay far away and call the power company or 911. Then alert the owner right away." },
    ),
    credentials: [{ kind: "certification", label: "ISA Certified Arborist", note: "Optional but trusted." }, LIABILITY, WORKERS_COMP],
    auditChecks: [EMERGENCY_LINE, { key: "insured_statement", label: "Says clearly that the crew is insured", why: "Tree work is risky; homeowners check insurance first.", weight: 2 }],
  },
  {
    key: "handyman",
    label: "Handyman",
    hint: "Small repairs and odd jobs",
    module: "home_services",
    status: "available",
    businessType: "project",
    schemaOrg: { type: "HomeAndConstructionBusiness" },
    subjectType: "property",
    bookingModes: ["arrival_window"],
    services: [
      { key: "hourly", name: { en: "Handyman hour", es: "Hora de trabajo" }, priceFromCents: 6500, priceToCents: 12000, unit: "hour", bookingMode: "arrival_window" },
      { key: "punch_list", name: { en: "Punch list / move-out repairs", es: "Lista de arreglos / reparaciones de mudanza" }, unit: "job" },
    ],
    qualifyingQuestions: [
      { en: "What needs fixing? A photo helps.", es: "¿Qué hay que arreglar? Una foto ayuda." },
      { en: "Is this for a home you live in, a rental, or a sale?", es: "¿Es para su casa, una propiedad de alquiler o una venta?" },
      { en: "What's the address?", es: "¿Cuál es la dirección?" },
    ],
    voice: voice("Thanks for calling {business_name}. What can we help you fix?", "Gracias por llamar a {business_name}. ¿Qué necesita arreglar?"),
    credentials: [
      { kind: "license", label: "SC residential specialty registration", note: "Needed for jobs above a dollar threshold. Verify with SC LLR." },
      LIABILITY,
    ],
    auditChecks: [{ key: "service_list", label: "Clear list of jobs you do and don't take", why: "AI assistants can only recommend you for work you say you do.", weight: 2 }],
  },
  {
    key: "lawn_care",
    label: "Lawn care",
    hint: "Mowing, edging, fertilizing, weekly service",
    module: "home_services",
    status: "available",
    businessType: "recurring",
    schemaOrg: { type: "HomeAndConstructionBusiness" },
    subjectType: "property",
    bookingModes: ["recurring", "arrival_window"],
    services: [
      { key: "mowing", name: { en: "Mowing", es: "Corte de césped" }, priceFromCents: 4000, priceToCents: 7500, unit: "visit", bookingMode: "recurring" },
      { key: "full_service", name: { en: "Full service (mow, edge, blow)", es: "Servicio completo (cortar, bordear, soplar)" }, priceFromCents: 5000, priceToCents: 9500, unit: "visit", bookingMode: "recurring" },
      { key: "fert_weed", name: { en: "Fertilizer & weed control", es: "Fertilizante y control de malezas" }, priceFromCents: 5500, priceToCents: 12000, unit: "visit", bookingMode: "recurring" },
      { key: "aeration", name: { en: "Aeration", es: "Aireación" }, priceFromCents: 10000, priceToCents: 25000, unit: "job" },
      { key: "leaf_cleanup", name: { en: "Leaf cleanup", es: "Limpieza de hojas" }, priceFromCents: 15000, priceToCents: 50000, unit: "job" },
    ],
    qualifyingQuestions: [
      { en: "Weekly or every other week?", es: "¿Cada semana o cada dos semanas?" },
      { en: "About how big is the yard (small, medium, large)?", es: "¿Qué tan grande es el jardín (pequeño, mediano, grande)?" },
      { en: "Any gate code, dogs in the yard, or things we should know?", es: "¿Hay código del portón, perros en el jardín u otra cosa que debamos saber?" },
      { en: "What's the address?", es: "¿Cuál es la dirección?" },
    ],
    voice: voice("Thanks for calling {business_name}. Are you looking for weekly lawn service or a one-time job?", "Gracias por llamar a {business_name}. ¿Busca servicio de jardín semanal o un trabajo de una sola vez?"),
    credentials: [
      { kind: "license", label: "SC commercial pesticide applicator license", note: "Clemson Department of Pesticide Regulation. Needed if you apply weed or pest control products for customers.", requiredInSC: true },
      LIABILITY,
    ],
    auditChecks: [{ key: "service_area", label: "Service area (towns or ZIP codes) listed", why: "Route businesses only want nearby customers; AI assistants check the area before recommending you.", weight: 2 }],
  },
  {
    key: "landscaping",
    label: "Landscaping",
    hint: "Design, installs, beds, mulch and pine straw",
    module: "home_services",
    status: "available",
    businessType: "recurring",
    schemaOrg: { type: "HomeAndConstructionBusiness" },
    subjectType: "property",
    bookingModes: ["recurring", "arrival_window"],
    services: [
      { key: "maintenance", name: { en: "Landscape maintenance", es: "Mantenimiento de jardín" }, priceFromCents: 6000, priceToCents: 15000, unit: "visit", bookingMode: "recurring" },
      { key: "mulch", name: { en: "Mulch or pine straw", es: "Mantillo o paja de pino" }, priceFromCents: 25000, priceToCents: 120000, unit: "job" },
      { key: "install", name: { en: "Plantings and bed install", es: "Plantas e instalación de canteros" }, priceFromCents: 100000, unit: "job" },
      { key: "design", name: { en: "Landscape design", es: "Diseño de jardín" }, unit: "job" },
    ],
    qualifyingQuestions: [
      { en: "Ongoing maintenance or a one-time project?", es: "¿Mantenimiento continuo o un proyecto de una sola vez?" },
      { en: "What would you like done (beds, plants, mulch, design)?", es: "¿Qué le gustaría hacer (canteros, plantas, mantillo, diseño)?" },
      { en: "Any gate code, dogs in the yard, or things we should know?", es: "¿Hay código del portón, perros en el jardín u otra cosa que debamos saber?" },
      { en: "What's the address?", es: "¿Cuál es la dirección?" },
    ],
    voice: voice("Thanks for calling {business_name}. Are you looking for ongoing maintenance or a landscaping project?", "Gracias por llamar a {business_name}. ¿Busca mantenimiento continuo o un proyecto de jardinería?"),
    credentials: [
      { kind: "license", label: "SC commercial pesticide applicator license", note: "Clemson Department of Pesticide Regulation, if you apply weed or pest control products.", requiredInSC: true },
      { kind: "license", label: "SC landscape / irrigation specialty registration", note: "May apply to irrigation and hardscape work above a threshold. Verify with SC LLR." },
      LIABILITY,
    ],
    auditChecks: [PHOTOS, { key: "service_area", label: "Service area (towns or ZIP codes) listed", why: "Route businesses only want nearby customers; AI assistants check the area before recommending you.", weight: 2 }],
  },
];
