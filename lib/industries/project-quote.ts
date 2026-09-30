import { CHECK, LIABILITY, voice, WORKERS_COMP } from "@/lib/industries/shared";
import type { IndustryConfig } from "@/lib/industries/types";

/**
 * Module B: Project & Quote Services (moving, pressure washing, junk removal).
 * Quote-first jobs, often priced from photos, booked by the day.
 */
export const PROJECT_QUOTE_INDUSTRIES: IndustryConfig[] = [
  {
    key: "moving",
    label: "Moving",
    hint: "Local moves, loading help, packing",
    module: "project_quote",
    status: "coming_soon",
    businessType: "project",
    schemaOrg: { type: "MovingCompany" },
    subjectType: "property",
    bookingModes: ["day_capacity", "arrival_window"],
    services: [
      { key: "local_move", name: { en: "Local move (2–3 movers + truck)", es: "Mudanza local (2–3 cargadores + camión)" }, priceFromCents: 12000, priceToCents: 20000, unit: "hour", bookingMode: "day_capacity" },
      { key: "labor_only", name: { en: "Loading / unloading help", es: "Ayuda para cargar / descargar" }, priceFromCents: 8000, priceToCents: 14000, unit: "hour", bookingMode: "day_capacity" },
      { key: "packing", name: { en: "Packing service", es: "Servicio de empaque" }, priceFromCents: 30000, priceToCents: 150000, unit: "job" },
      { key: "estimate", name: { en: "In-home or video estimate", es: "Presupuesto en casa o por video" }, priceFromCents: 0, unit: "visit", durationMinutes: 30, bookingMode: "arrival_window" },
    ],
    stageLabels: { estimate_sent: "Quote sent", won: "Booked" },
    templates: {
      missed_call_reply: {
        en: "Sorry we missed your call! This is {business_name}. We're probably on a move. What's your moving date, and where are you moving from and to? Reply here and we'll get right back to you.",
        es: "¡Disculpe que no pudimos contestar! Le habla {business_name}. Seguramente estamos en una mudanza. ¿Cuál es la fecha, y de dónde a dónde se muda? Responda aquí y le contestamos pronto.",
      },
      estimate_followup_1: {
        en: "Hi {first_name}, it's {business_name}. Just checking that you got our moving quote. Dates fill up fast, so let us know if you'd like to lock yours in.",
        es: "Hola {first_name}, le escribe {business_name}. ¿Recibió nuestro presupuesto de mudanza? Las fechas se llenan rápido; avísenos si quiere reservar la suya.",
      },
    },
    campaignPresets: [
      { key: "campaign_summer_moves", title: "Book summer moves early", months: [3, 4], text: { en: "Hi {first_name}, {business_name} here. Summer is our busiest moving season and weekends fill up fast. Moving soon? Reply YES for a quote.", es: "Hola {first_name}, le escribe {business_name}. El verano es la temporada más ocupada y los fines de semana se llenan. ¿Se muda pronto? Responda SÍ para un presupuesto." } },
    ],
    qualifyingQuestions: [
      { en: "What's your moving date, and is it flexible?", es: "¿Cuál es la fecha de la mudanza, y es flexible?" },
      { en: "Moving from where to where (and what floors / stairs / elevators)?", es: "¿De dónde a dónde se muda (y qué pisos, escaleras o ascensores)?" },
      { en: "How many bedrooms, and any heavy items (piano, safe, gym)?", es: "¿Cuántas habitaciones, y hay cosas pesadas (piano, caja fuerte, gimnasio)?" },
      { en: "Would you like to send photos or do a quick video walk-through for an exact quote?", es: "¿Quiere enviar fotos o hacer un recorrido por video para un presupuesto exacto?" },
    ],
    voice: voice({ en: "Thanks for calling {business_name}. When are you moving, and where from and to?", es: "Gracias por llamar a {business_name}. ¿Cuándo se muda, y de dónde a dónde?" }),
    credentials: [
      { kind: "license", label: "SC household goods mover certificate (intrastate moves)", note: "Issued through the SC Public Service Commission / Office of Regulatory Staff for moves within SC. Verify the current requirement.", requiredInSC: true },
      { kind: "registration", label: "USDOT and MC number (moves across state lines)", note: "FMCSA registration for interstate household goods moves." },
      { kind: "insurance", label: "Cargo insurance and valuation coverage", note: "Explain released value vs. full value protection to customers." },
      LIABILITY,
      WORKERS_COMP,
    ],
    auditChecks: [CHECK.licenseVisible, CHECK.priceRanges, CHECK.policies, { key: "quote_from_photos", label: "Customers can get a quote from photos or a video call", why: "Movers who quote without a home visit win the busy customers (and AI-assisted ones).", weight: 2 }],
  },
  {
    key: "pressure_washing",
    label: "Pressure washing",
    hint: "Houses, driveways, decks, roofs (soft wash)",
    module: "project_quote",
    status: "coming_soon",
    businessType: "project",
    schemaOrg: { type: "HomeAndConstructionBusiness" },
    subjectType: "property",
    bookingModes: ["day_capacity", "arrival_window"],
    services: [
      { key: "house_wash", name: { en: "House soft wash", es: "Lavado suave de casa" }, priceFromCents: 25000, priceToCents: 60000, unit: "job", bookingMode: "day_capacity" },
      { key: "driveway", name: { en: "Driveway and walkways", es: "Entrada y caminos" }, priceFromCents: 12500, priceToCents: 30000, unit: "job", bookingMode: "day_capacity" },
      { key: "roof_wash", name: { en: "Roof soft wash", es: "Lavado suave de techo" }, priceFromCents: 35000, priceToCents: 90000, unit: "job", bookingMode: "day_capacity" },
      { key: "deck_fence", name: { en: "Deck or fence cleaning", es: "Limpieza de terraza o cerca" }, priceFromCents: 15000, priceToCents: 45000, unit: "job", bookingMode: "day_capacity" },
    ],
    stageLabels: { estimate_sent: "Quote sent", won: "Booked" },
    templates: {
      missed_call_reply: {
        en: "Sorry we missed your call! This is {business_name}. We're probably out washing. What would you like cleaned? A photo helps us quote fast. Reply here and we'll get right back to you.",
        es: "¡Disculpe que no pudimos contestar! Le habla {business_name}. Seguramente estamos lavando. ¿Qué quiere que limpiemos? Una foto nos ayuda a darle precio rápido. Responda aquí y le contestamos pronto.",
      },
    },
    campaignPresets: [
      { key: "campaign_pollen_wash", title: "Pollen season wash", months: [4, 5], text: { en: "Hi {first_name}, {business_name} here. Pollen season leaves everything yellow-green. We're booking house and driveway washes now. Reply YES for a quote.", es: "Hola {first_name}, le escribe {business_name}. El polen deja todo amarillo. Estamos programando lavados de casa y entrada. Responda SÍ para un presupuesto." } },
      { key: "campaign_holiday_ready", title: "Holiday-ready home", months: [10, 11], text: { en: "Hi {first_name}, {business_name} here. Get the house guest-ready before the holidays. Reply YES for a quick quote on a house or driveway wash.", es: "Hola {first_name}, le escribe {business_name}. Deje su casa lista para las fiestas. Responda SÍ para un presupuesto de lavado de casa o entrada." } },
    ],
    qualifyingQuestions: [
      { en: "What needs cleaning (house, driveway, roof, deck, fence)?", es: "¿Qué hay que limpiar (casa, entrada, techo, terraza, cerca)?" },
      { en: "One story or two? Can you text a photo?", es: "¿Es de un piso o dos? ¿Puede enviar una foto?" },
      { en: "Is there an outside water spigot we can use?", es: "¿Hay una llave de agua afuera que podamos usar?" },
      { en: "What's the address?", es: "¿Cuál es la dirección?" },
    ],
    voice: voice({ en: "Thanks for calling {business_name}. What would you like cleaned?", es: "Gracias por llamar a {business_name}. ¿Qué quiere que limpiemos?" }),
    credentials: [
      LIABILITY,
      { kind: "certification", label: "Soft-wash / roof cleaning training (e.g. UAMCC, PWNA)", note: "Shows you won't damage shingles or siding." },
      { kind: "registration", label: "Local business license (city or county)", note: "Charleston, North Charleston, Summerville and the counties each issue their own." },
    ],
    auditChecks: [CHECK.photos, CHECK.priceRanges, CHECK.onlineBooking, CHECK.serviceArea],
  },
  {
    key: "junk_removal",
    label: "Junk removal",
    hint: "Furniture, cleanouts, yard debris, construction debris",
    module: "project_quote",
    status: "coming_soon",
    businessType: "project",
    schemaOrg: { type: "HomeAndConstructionBusiness" },
    subjectType: "property",
    bookingModes: ["day_capacity", "arrival_window"],
    services: [
      { key: "single_item", name: { en: "Single item pickup", es: "Recogida de un artículo" }, priceFromCents: 7500, priceToCents: 15000, unit: "job", bookingMode: "arrival_window" },
      { key: "partial_load", name: { en: "Partial truck load", es: "Media carga de camión" }, priceFromCents: 20000, priceToCents: 40000, unit: "job", bookingMode: "arrival_window" },
      { key: "full_load", name: { en: "Full truck load", es: "Carga completa de camión" }, priceFromCents: 50000, priceToCents: 75000, unit: "job", bookingMode: "arrival_window" },
      { key: "cleanout", name: { en: "Whole-house or estate cleanout", es: "Limpieza completa de casa" }, priceFromCents: 100000, unit: "job", bookingMode: "day_capacity" },
    ],
    stageLabels: { estimate_sent: "Quote sent", won: "Booked" },
    templates: {
      missed_call_reply: {
        en: "Sorry we missed your call! This is {business_name}. We're probably on a haul. What do you need gone? Text us a photo and we'll send a price range. Reply here and we'll get right back to you.",
        es: "¡Disculpe que no pudimos contestar! Le habla {business_name}. Seguramente estamos en un trabajo. ¿Qué necesita sacar? Envíenos una foto y le damos un precio aproximado. Responda aquí y le contestamos pronto.",
      },
    },
    campaignPresets: [
      { key: "campaign_spring_cleanout", title: "Spring cleanout", months: [3, 4], text: { en: "Hi {first_name}, {business_name} here. Spring cleaning the garage or attic? We haul it all away. Reply YES and send a photo for a price.", es: "Hola {first_name}, le escribe {business_name}. ¿Limpieza de primavera en el garaje o el ático? Nos llevamos todo. Responda SÍ y envíe una foto para el precio." } },
    ],
    qualifyingQuestions: [
      { en: "What needs to go? Can you text a photo?", es: "¿Qué hay que sacar? ¿Puede enviar una foto?" },
      { en: "Is it inside, in the garage, or at the curb? Any stairs?", es: "¿Está adentro, en el garaje o en la acera? ¿Hay escaleras?" },
      { en: "Anything we can't take (paint, chemicals, tires, propane)?", es: "¿Hay algo que no podamos llevar (pintura, químicos, llantas, propano)?" },
      { en: "What's the address, and when works for you?", es: "¿Cuál es la dirección y cuándo le conviene?" },
    ],
    voice: voice({ en: "Thanks for calling {business_name}. What do you need hauled away?", es: "Gracias por llamar a {business_name}. ¿Qué necesita que nos llevemos?" }),
    credentials: [
      LIABILITY,
      { kind: "registration", label: "USDOT number (trucks over 10,001 lbs used commercially)", note: "Check FMCSA and SCDMV rules for your truck." },
      { kind: "registration", label: "Local business license", note: "City or county where you operate." },
    ],
    auditChecks: [CHECK.priceRanges, CHECK.onlineBooking, { key: "donation_recycling", label: "Explains donating and recycling", why: "Many customers pick the hauler that keeps things out of the landfill.", weight: 1 }],
  },
];
