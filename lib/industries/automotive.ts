import { CHECK, LIABILITY, voice } from "@/lib/industries/shared";
import type { CredentialSuggestion, IndustryConfig } from "@/lib/industries/types";

/**
 * Module D: Automotive (detailing, repair, mobile mechanic, tinting).
 * Positioned as the front desk (calls, texts, booking, status updates), not a
 * replacement for shop-management software. VINs are PRIVATE data.
 */
const GARAGEKEEPERS: CredentialSuggestion = {
  kind: "insurance",
  label: "Garagekeepers liability insurance",
  note: "Covers customers' vehicles while they're in your care.",
};
const ASE: CredentialSuggestion = { kind: "certification", label: "ASE certification", note: "The certification customers recognize for mechanics." };
const EPA_609: CredentialSuggestion = {
  kind: "certification",
  label: "EPA Section 609 certification (vehicle A/C)",
  note: "Federal requirement for servicing vehicle air conditioning.",
  requiredInSC: true,
};
const NO_DIAGNOSIS = "Never diagnose a vehicle problem or say whether it's safe to drive; offer an inspection instead.";

export const AUTOMOTIVE_INDUSTRIES: IndustryConfig[] = [
  {
    key: "auto_detailing",
    label: "Auto detailing",
    hint: "Interior/exterior detailing, ceramic coating, mobile detailing",
    module: "automotive",
    status: "coming_soon",
    businessType: "project",
    schemaOrg: { type: "AutomotiveBusiness" },
    subjectType: "vehicle",
    bookingModes: ["fixed_appointment", "mobile_appointment"],
    services: [
      { key: "full_detail", name: { en: "Full detail (car)", es: "Detallado completo (auto)" }, priceFromCents: 17500, priceToCents: 30000, unit: "job", durationMinutes: 240, bookingMode: "fixed_appointment" },
      { key: "full_detail_suv", name: { en: "Full detail (SUV / truck)", es: "Detallado completo (SUV / camioneta)" }, priceFromCents: 22500, priceToCents: 37500, unit: "job", durationMinutes: 300, bookingMode: "fixed_appointment" },
      { key: "interior", name: { en: "Interior detail", es: "Detallado interior" }, priceFromCents: 10000, priceToCents: 20000, unit: "job", durationMinutes: 150, bookingMode: "fixed_appointment" },
      { key: "ceramic", name: { en: "Ceramic coating", es: "Recubrimiento cerámico" }, priceFromCents: 60000, priceToCents: 200000, unit: "job", durationMinutes: 480, bookingMode: "fixed_appointment" },
      { key: "mobile_detail", name: { en: "Mobile detail (we come to you)", es: "Detallado a domicilio" }, priceFromCents: 20000, priceToCents: 35000, unit: "job", durationMinutes: 240, bookingMode: "mobile_appointment" },
    ],
    stageLabels: { estimate_sent: "Quote sent", won: "Booked" },
    templates: {
      missed_call_reply: {
        en: "Sorry we missed your call! This is {business_name}. We're probably working on a car. What vehicle is it (year, make, model), and what service would you like? Reply here and we'll get right back to you.",
        es: "¡Disculpe que no pudimos contestar! Le habla {business_name}. Seguramente estamos trabajando en un auto. ¿Qué vehículo es (año, marca, modelo) y qué servicio quiere? Responda aquí y le contestamos pronto.",
      },
      review_request: {
        en: "Thanks for choosing {business_name}, {first_name}! If your ride looks great, would you leave us a quick Google review? It really helps a local business: {review_link}",
        es: "¡Gracias por elegir a {business_name}, {first_name}! Si su auto quedó muy bien, ¿nos deja una reseña en Google? Nos ayuda mucho como negocio local: {review_link}",
      },
    },
    campaignPresets: [
      { key: "campaign_pollen_detail", title: "Pollen season detail", months: [4], text: { en: "Hi {first_name}, {business_name} here. Pollen season is brutal on paint and vents. Book a detail and protect your finish. Reply YES for a time.", es: "Hola {first_name}, le escribe {business_name}. El polen daña la pintura y los ductos. Reserve un detallado y proteja su auto. Responda SÍ para una cita." } },
      { key: "campaign_ceramic", title: "Ceramic coating before summer", months: [5], text: { en: "Hi {first_name}, {business_name} here. Beat the summer sun and salt air with a ceramic coating. Reply YES for a quote.", es: "Hola {first_name}, le escribe {business_name}. Proteja su auto del sol y el aire salado con recubrimiento cerámico. Responda SÍ para un presupuesto." } },
    ],
    qualifyingQuestions: [
      { en: "Year, make and model? Car, SUV or truck?", es: "¿Año, marca y modelo? ¿Auto, SUV o camioneta?" },
      { en: "Interior, exterior, full detail, or coating?", es: "¿Interior, exterior, detallado completo o recubrimiento?" },
      { en: "Pet hair, stains, odors or heavy dirt?", es: "¿Pelo de mascota, manchas, olores o mucha suciedad?" },
      { en: "At our shop, or mobile (and is there water and power at your place)?", es: "¿En el taller o a domicilio (y hay agua y electricidad en su casa)?" },
    ],
    voice: voice({ en: "Thanks for calling {business_name}. What vehicle is it, and what kind of detail are you looking for?", es: "Gracias por llamar a {business_name}. ¿Qué vehículo es y qué tipo de detallado busca?" }),
    credentials: [GARAGEKEEPERS, LIABILITY, { kind: "certification", label: "Detailing or coating certification (e.g. IDA, manufacturer)", note: "Optional; helps sell coatings." }],
    auditChecks: [CHECK.onlineBooking, CHECK.priceRanges, CHECK.photos, { key: "size_pricing", label: "Prices by vehicle size", why: "Detailing prices depend on size; AI assistants can quote you only if sizes are listed.", weight: 2 }],
  },
  {
    key: "auto_repair",
    label: "Auto repair shop",
    hint: "Maintenance, diagnostics, brakes, A/C",
    module: "automotive",
    status: "coming_soon",
    businessType: "project",
    schemaOrg: { type: "AutoRepair" },
    subjectType: "vehicle",
    bookingModes: ["fixed_appointment", "day_capacity"],
    services: [
      { key: "oil_change", name: { en: "Oil change", es: "Cambio de aceite" }, priceFromCents: 5000, priceToCents: 12000, unit: "job", durationMinutes: 45, bookingMode: "fixed_appointment" },
      { key: "diagnostic", name: { en: "Check-engine / diagnostic", es: "Diagnóstico / luz de motor" }, priceFromCents: 9000, priceToCents: 18000, unit: "job", durationMinutes: 60, bookingMode: "fixed_appointment" },
      { key: "brakes", name: { en: "Brake service", es: "Servicio de frenos" }, priceFromCents: 25000, priceToCents: 70000, unit: "job", bookingMode: "day_capacity" },
      { key: "ac", name: { en: "A/C service", es: "Servicio de aire acondicionado" }, priceFromCents: 15000, priceToCents: 45000, unit: "job", bookingMode: "day_capacity" },
      { key: "inspection", name: { en: "Pre-purchase or road-trip inspection", es: "Inspección antes de comprar o viajar" }, priceFromCents: 9000, priceToCents: 15000, unit: "job", durationMinutes: 60, bookingMode: "fixed_appointment" },
    ],
    stageLabels: { estimate_sent: "Estimate sent", won: "Approved" },
    templates: {
      missed_call_reply: {
        en: "Sorry we missed your call! This is {business_name}. We're probably under a car. What vehicle is it, and what's going on with it? Reply here and we'll get right back to you.",
        es: "¡Disculpe que no pudimos contestar! Le habla {business_name}. Seguramente estamos debajo de un auto. ¿Qué vehículo es y qué le pasa? Responda aquí y le contestamos pronto.",
      },
    },
    campaignPresets: [
      { key: "campaign_ac_check", title: "A/C check before summer", months: [4, 5], text: { en: "Hi {first_name}, {business_name} here. Lowcountry summer is coming! Want an A/C check before it gets hot? Reply YES for an appointment.", es: "Hola {first_name}, le escribe {business_name}. ¡Ya viene el verano! ¿Revisamos el aire de su auto antes del calor? Responda SÍ para una cita." } },
      { key: "campaign_road_trip", title: "Road-trip check", months: [6, 11], text: { en: "Hi {first_name}, {business_name} here. Traveling soon? Get a quick road-trip check (tires, brakes, fluids) first. Reply YES for a time.", es: "Hola {first_name}, le escribe {business_name}. ¿Va de viaje? Haga una revisión rápida antes (llantas, frenos, líquidos). Responda SÍ para una cita." } },
    ],
    qualifyingQuestions: [
      { en: "Year, make, model and about how many miles?", es: "¿Año, marca, modelo y cuántas millas más o menos?" },
      { en: "What's it doing (noise, warning light, leak, won't start)?", es: "¿Qué le pasa (ruido, luz de advertencia, fuga, no arranca)?" },
      { en: "Can you drive it in, or does it need a tow?", es: "¿Puede traerlo manejando o necesita grúa?" },
      { en: "When can you drop it off?", es: "¿Cuándo lo puede dejar?" },
    ],
    voice: voice({ en: "Thanks for calling {business_name}. What vehicle is it, and what's going on with it?", es: "Gracias por llamar a {business_name}. ¿Qué vehículo es y qué le pasa?" }, { triggers: ["accident", "smoke from the engine", "brakes failed"], instruction: "Tell them to get to a safe place and call 911 if anyone is hurt. Offer a tow and alert the owner." }, [NO_DIAGNOSIS]),
    credentials: [ASE, EPA_609, GARAGEKEEPERS, LIABILITY],
    auditChecks: [CHECK.onlineBooking, CHECK.licenseVisible, { key: "warranty", label: "Parts and labor warranty stated", why: "Customers compare warranties; AI assistants surface it when it's written down.", weight: 2 }, { key: "shop_software", label: "Front desk connects to shop software (future integration)", why: "We sit in front of your shop system; knowing which one you use shapes the integration.", weight: 1 }],
  },
  {
    key: "mobile_mechanic",
    label: "Mobile mechanic",
    hint: "Repairs at the customer's home or work",
    module: "automotive",
    status: "coming_soon",
    businessType: "project",
    schemaOrg: { type: "AutoRepair" },
    subjectType: "vehicle",
    bookingModes: ["mobile_appointment"],
    services: [
      { key: "diagnostic", name: { en: "Mobile diagnostic", es: "Diagnóstico a domicilio" }, priceFromCents: 9000, priceToCents: 15000, unit: "visit", durationMinutes: 60, bookingMode: "mobile_appointment" },
      { key: "battery", name: { en: "Battery replacement", es: "Cambio de batería" }, priceFromCents: 17500, priceToCents: 30000, unit: "job", durationMinutes: 45, bookingMode: "mobile_appointment" },
      { key: "brakes", name: { en: "Brake pads and rotors", es: "Pastillas y discos de freno" }, priceFromCents: 25000, priceToCents: 60000, unit: "job", durationMinutes: 120, bookingMode: "mobile_appointment" },
      { key: "oil_change", name: { en: "Mobile oil change", es: "Cambio de aceite a domicilio" }, priceFromCents: 7500, priceToCents: 13000, unit: "job", durationMinutes: 45, bookingMode: "mobile_appointment" },
    ],
    stageLabels: { estimate_sent: "Estimate sent", won: "Approved" },
    templates: {
      missed_call_reply: {
        en: "Sorry we missed your call! This is {business_name}. We're probably on a repair. What vehicle is it, what's going on, and where is it parked? Reply here and we'll get right back to you.",
        es: "¡Disculpe que no pudimos contestar! Le habla {business_name}. Seguramente estamos en una reparación. ¿Qué vehículo es, qué le pasa y dónde está estacionado? Responda aquí y le contestamos pronto.",
      },
    },
    qualifyingQuestions: [
      { en: "Year, make and model?", es: "¿Año, marca y modelo?" },
      { en: "What's it doing, and does it start?", es: "¿Qué le pasa, y arranca?" },
      { en: "Where is it parked (home, work, apartment lot), and is there room to work safely?", es: "¿Dónde está estacionado (casa, trabajo, estacionamiento) y hay espacio para trabajar con seguridad?" },
      { en: "What times work for you?", es: "¿Qué horarios le convienen?" },
    ],
    voice: voice({ en: "Thanks for calling {business_name}. What vehicle is it, what's going on, and where is it parked?", es: "Gracias por llamar a {business_name}. ¿Qué vehículo es, qué le pasa y dónde está estacionado?" }, { triggers: ["stranded on the highway", "accident"], instruction: "Tell them to get somewhere safe and call 911 if anyone is hurt or they're in traffic. Then alert the owner." }, [NO_DIAGNOSIS]),
    credentials: [ASE, EPA_609, GARAGEKEEPERS, LIABILITY],
    auditChecks: [CHECK.serviceArea, CHECK.onlineBooking, CHECK.priceRanges],
  },
  {
    key: "window_tinting",
    label: "Window tinting",
    hint: "Auto tint, paint protection film",
    module: "automotive",
    status: "coming_soon",
    businessType: "project",
    schemaOrg: { type: "AutomotiveBusiness" },
    subjectType: "vehicle",
    bookingModes: ["fixed_appointment"],
    services: [
      { key: "full_tint", name: { en: "Full car tint", es: "Polarizado completo" }, priceFromCents: 20000, priceToCents: 45000, unit: "job", durationMinutes: 180, bookingMode: "fixed_appointment" },
      { key: "ceramic_tint", name: { en: "Ceramic tint", es: "Polarizado cerámico" }, priceFromCents: 35000, priceToCents: 80000, unit: "job", durationMinutes: 180, bookingMode: "fixed_appointment" },
      { key: "windshield_strip", name: { en: "Windshield strip", es: "Franja del parabrisas" }, priceFromCents: 5000, priceToCents: 10000, unit: "job", durationMinutes: 30, bookingMode: "fixed_appointment" },
      { key: "ppf", name: { en: "Paint protection film (front)", es: "Película protectora de pintura (frente)" }, priceFromCents: 90000, priceToCents: 200000, unit: "job", durationMinutes: 480, bookingMode: "fixed_appointment" },
    ],
    stageLabels: { estimate_sent: "Quote sent", won: "Booked" },
    templates: {
      missed_call_reply: {
        en: "Sorry we missed your call! This is {business_name}. We're probably tinting a car. What vehicle is it, and which windows or film are you interested in? Reply here and we'll get right back to you.",
        es: "¡Disculpe que no pudimos contestar! Le habla {business_name}. Seguramente estamos polarizando un auto. ¿Qué vehículo es y qué ventanas o película le interesan? Responda aquí y le contestamos pronto.",
      },
    },
    campaignPresets: [
      { key: "campaign_summer_heat", title: "Beat the summer heat", months: [4, 5], text: { en: "Hi {first_name}, {business_name} here. Ceramic tint keeps your car noticeably cooler all summer. Reply YES for a quote.", es: "Hola {first_name}, le escribe {business_name}. El polarizado cerámico mantiene su auto mucho más fresco en verano. Responda SÍ para un presupuesto." } },
    ],
    qualifyingQuestions: [
      { en: "Year, make and model?", es: "¿Año, marca y modelo?" },
      { en: "Which windows, and what shade or film type?", es: "¿Qué ventanas, y qué tono o tipo de película?" },
      { en: "Any old tint that needs removing?", es: "¿Tiene polarizado viejo que haya que quitar?" },
    ],
    voice: voice({ en: "Thanks for calling {business_name}. What vehicle is it, and what kind of tint are you looking for?", es: "Gracias por llamar a {business_name}. ¿Qué vehículo es y qué tipo de polarizado busca?" }, undefined, ["Never promise a tint darker than South Carolina law allows; the installer confirms legal shades."]),
    credentials: [
      { kind: "certification", label: "Film manufacturer certification (e.g. 3M, XPEL, LLumar)", note: "Backs your warranty." },
      { kind: "registration", label: "Follows SC window tint law (SC Code §56-5-5015)", note: "Know the legal light levels and any required labels. Verify current rules with SCDMV." },
      GARAGEKEEPERS,
      LIABILITY,
    ],
    auditChecks: [CHECK.onlineBooking, CHECK.priceRanges, CHECK.photos, { key: "legal_shades", label: "Explains legal tint levels in SC", why: "Customers ask what's legal; answering it online builds trust and saves calls.", weight: 1 }],
  },
];
