import { CHECK, LIABILITY, voice } from "@/lib/industries/shared";
import type { IndustryConfig } from "@/lib/industries/types";

/**
 * Module C: Pet Care (grooming, boarding, mobile vet, dog training).
 * Vaccination records and health notes are PRIVATE data: never on public
 * pages, AI agent answers or texts. Mobile vet is scheduling and intake only:
 * no medical records, diagnoses or advice, ever.
 */
const PET_EMERGENCY = {
  triggers: ["not breathing", "hit by a car", "seizure", "ate something poisonous", "bleeding heavily", "collapsed"],
  instruction:
    "Do not give any medical advice. Tell the caller this may be an emergency, give them the emergency vet listed in the business's settings, and alert the owner right away.",
};
const NO_MEDICAL = "Never give medical advice, diagnoses, medication or dosing information about any animal.";

export const PET_CARE_INDUSTRIES: IndustryConfig[] = [
  {
    key: "pet_grooming",
    label: "Pet grooming",
    hint: "Salon or mobile grooming, baths, nails",
    module: "pet_care",
    status: "coming_soon",
    businessType: "project",
    schemaOrg: { type: "LocalBusiness" },
    subjectType: "pet",
    bookingModes: ["fixed_appointment", "mobile_appointment"],
    services: [
      { key: "full_groom_small", name: { en: "Full groom (small dog)", es: "Arreglo completo (perro pequeño)" }, priceFromCents: 6000, priceToCents: 8500, unit: "visit", durationMinutes: 90, bookingMode: "fixed_appointment" },
      { key: "full_groom_large", name: { en: "Full groom (large dog)", es: "Arreglo completo (perro grande)" }, priceFromCents: 9000, priceToCents: 14000, unit: "visit", durationMinutes: 150, bookingMode: "fixed_appointment" },
      { key: "bath_brush", name: { en: "Bath and brush", es: "Baño y cepillado" }, priceFromCents: 4000, priceToCents: 7500, unit: "visit", durationMinutes: 60, bookingMode: "fixed_appointment" },
      { key: "nails", name: { en: "Nail trim", es: "Corte de uñas" }, priceFromCents: 1500, priceToCents: 2500, unit: "visit", durationMinutes: 15, bookingMode: "fixed_appointment" },
      { key: "mobile_groom", name: { en: "Mobile grooming (van comes to you)", es: "Arreglo a domicilio (la camioneta va a su casa)" }, priceFromCents: 9000, priceToCents: 16000, unit: "visit", durationMinutes: 90, bookingMode: "mobile_appointment" },
    ],
    stageLabels: { estimate_sent: "Price sent", won: "Booked" },
    templates: {
      missed_call_reply: {
        en: "Sorry we missed your call! This is {business_name}. We're probably mid-groom. What's your pet's name, breed and size, and what service would you like? Reply here and we'll get right back to you.",
        es: "¡Disculpe que no pudimos contestar! Le habla {business_name}. Seguramente estamos bañando a una mascota. ¿Cómo se llama su mascota, qué raza y tamaño es, y qué servicio quiere? Responda aquí y le contestamos pronto.",
      },
      review_request: {
        en: "Thanks for trusting {business_name} with your pet, {first_name}! If you love the fresh look, would you leave us a quick Google review? It really helps a local business: {review_link}",
        es: "¡Gracias por confiar su mascota a {business_name}, {first_name}! Si le encantó cómo quedó, ¿nos deja una reseña en Google? Nos ayuda mucho como negocio local: {review_link}",
      },
    },
    campaignPresets: [
      { key: "campaign_holiday_groom", title: "Holiday grooming", months: [11], text: { en: "Hi {first_name}, {business_name} here. Holiday grooming spots go fast! Want to book your pet's pre-holiday groom? Reply YES.", es: "Hola {first_name}, le escribe {business_name}. ¡Los turnos de las fiestas se llenan rápido! ¿Reservamos el arreglo de su mascota? Responda SÍ." } },
    ],
    qualifyingQuestions: [
      { en: "What's your pet's name, breed, age and about how much do they weigh?", es: "¿Cómo se llama su mascota, qué raza, edad y cuánto pesa más o menos?" },
      { en: "Are rabies and other vaccines up to date? (We'll ask for a copy.)", es: "¿Tiene al día la vacuna contra la rabia y las demás? (Le pediremos una copia.)" },
      { en: "Any matting, skin issues, or nervousness with grooming, other dogs or handling?", es: "¿Tiene nudos, problemas de piel, o se pone nervioso con el aseo, otros perros o al tocarlo?" },
      { en: "Salon visit or mobile (we come to you)?", es: "¿En el salón o a domicilio?" },
    ],
    voice: voice({ en: "Thanks for calling {business_name}. What's your pet's name, and what service are you looking for?", es: "Gracias por llamar a {business_name}. ¿Cómo se llama su mascota y qué servicio busca?" }, PET_EMERGENCY, [NO_MEDICAL]),
    credentials: [
      LIABILITY,
      { kind: "insurance", label: "Animal bailee (care, custody and control) coverage", note: "Covers pets in your care." },
      { kind: "certification", label: "Groomer certification (e.g. NDGAA, IPG)", note: "Optional, but customers recognize it." },
      { kind: "certification", label: "Pet first aid / CPR", note: "Good to show on your profile." },
      { kind: "registration", label: "Local business license (and mobile vendor permit for vans)", note: "City or county where you operate." },
    ],
    auditChecks: [CHECK.onlineBooking, CHECK.priceRanges, CHECK.policies, { key: "vaccine_policy", label: "Vaccine requirements stated", why: "Pet owners (and AI assistants) check requirements before booking.", weight: 2 }],
  },
  {
    key: "pet_boarding",
    label: "Pet boarding & daycare",
    hint: "Overnight boarding, doggy daycare",
    module: "pet_care",
    status: "coming_soon",
    businessType: "project",
    schemaOrg: { type: "LocalBusiness" },
    subjectType: "pet",
    bookingModes: ["multi_day_reservation", "fixed_appointment", "package_sessions"],
    services: [
      { key: "boarding_dog", name: { en: "Dog boarding (per night)", es: "Hospedaje de perro (por noche)" }, priceFromCents: 4000, priceToCents: 7000, unit: "night", bookingMode: "multi_day_reservation" },
      { key: "boarding_cat", name: { en: "Cat boarding (per night)", es: "Hospedaje de gato (por noche)" }, priceFromCents: 2500, priceToCents: 4000, unit: "night", bookingMode: "multi_day_reservation" },
      { key: "daycare", name: { en: "Doggy daycare (day)", es: "Guardería canina (día)" }, priceFromCents: 3000, priceToCents: 4500, unit: "visit", bookingMode: "fixed_appointment" },
      { key: "daycare_pack", name: { en: "Daycare 10-day pack", es: "Paquete de 10 días de guardería" }, priceFromCents: 25000, priceToCents: 40000, unit: "package", bookingMode: "package_sessions" },
    ],
    stageLabels: { estimate_sent: "Price sent", won: "Reserved" },
    templates: {
      missed_call_reply: {
        en: "Sorry we missed your call! This is {business_name}. We're probably out with the pups. Which dates do you need, and for which pets? Reply here and we'll get right back to you.",
        es: "¡Disculpe que no pudimos contestar! Le habla {business_name}. Seguramente estamos con los perritos. ¿Qué fechas necesita y para qué mascotas? Responda aquí y le contestamos pronto.",
      },
      review_request: {
        en: "Thanks for trusting {business_name} with your pet, {first_name}! If they had a great stay, would you leave us a quick Google review? It really helps a local business: {review_link}",
        es: "¡Gracias por confiar su mascota a {business_name}, {first_name}! Si tuvo una buena estadía, ¿nos deja una reseña en Google? Nos ayuda mucho como negocio local: {review_link}",
      },
    },
    campaignPresets: [
      { key: "campaign_holiday_boarding", title: "Holiday boarding", months: [10], text: { en: "Hi {first_name}, {business_name} here. Holiday boarding fills up fast. Traveling for Thanksgiving or Christmas? Reply YES to hold your pet's spot.", es: "Hola {first_name}, le escribe {business_name}. El hospedaje de las fiestas se llena rápido. ¿Viaja en Acción de Gracias o Navidad? Responda SÍ para apartar el lugar." } },
      { key: "campaign_summer_travel", title: "Summer travel", months: [4, 5], text: { en: "Hi {first_name}, {business_name} here. Planning summer trips? Reserve your pet's stay early. Reply YES and send your dates.", es: "Hola {first_name}, le escribe {business_name}. ¿Planea viajes de verano? Reserve la estadía de su mascota con tiempo. Responda SÍ y envíe sus fechas." } },
    ],
    qualifyingQuestions: [
      { en: "Which dates (drop-off and pick-up), and how many pets?", es: "¿Qué fechas (dejar y recoger), y cuántas mascotas?" },
      { en: "Pet's name, breed, size and age? Spayed/neutered?", es: "¿Nombre, raza, tamaño y edad de la mascota? ¿Está esterilizada?" },
      { en: "Rabies, DHPP and Bordetella up to date? (We'll ask for records.)", es: "¿Tiene al día rabia, DHPP y Bordetella? (Le pediremos los registros.)" },
      { en: "Any history with other dogs, feeding needs or medications we'd give?", es: "¿Cómo se lleva con otros perros, y tiene necesidades de comida o medicinas que debamos darle?" },
    ],
    voice: voice({ en: "Thanks for calling {business_name}. Are you looking for boarding or daycare, and for which dates?", es: "Gracias por llamar a {business_name}. ¿Busca hospedaje o guardería, y para qué fechas?" }, PET_EMERGENCY, [NO_MEDICAL, "Never confirm a reservation; the business confirms after checking space and vaccine records."]),
    credentials: [
      { kind: "registration", label: "County / city kennel or animal facility permit", note: "Requirements differ by county (Charleston, Berkeley, Dorchester). Verify locally." },
      LIABILITY,
      { kind: "insurance", label: "Animal bailee (care, custody and control) coverage", note: "Covers pets in your care." },
      { kind: "certification", label: "Pet first aid / CPR", note: "Good to show on your profile." },
    ],
    auditChecks: [CHECK.onlineBooking, CHECK.priceRanges, CHECK.policies, { key: "vaccine_policy", label: "Vaccine requirements stated", why: "Pet owners (and AI assistants) check requirements before booking.", weight: 2 }, { key: "facility_photos", label: "Photos of the facility and play areas", why: "Owners want to see where their pet will stay.", weight: 1 }],
  },
  {
    key: "mobile_vet",
    label: "Mobile veterinary",
    hint: "House-call vet visits (scheduling and intake only)",
    module: "pet_care",
    status: "coming_soon",
    businessType: "project",
    schemaOrg: { type: "VeterinaryCare", additionalTypes: ["LocalBusiness"] },
    subjectType: "pet",
    bookingModes: ["mobile_appointment"],
    services: [
      { key: "wellness", name: { en: "Wellness house call", es: "Consulta de bienestar a domicilio" }, priceFromCents: 12000, priceToCents: 20000, unit: "visit", durationMinutes: 45, bookingMode: "mobile_appointment" },
      { key: "sick_visit", name: { en: "Sick-pet house call", es: "Consulta a domicilio por enfermedad" }, priceFromCents: 15000, priceToCents: 25000, unit: "visit", durationMinutes: 60, bookingMode: "mobile_appointment" },
      { key: "euthanasia", name: { en: "In-home euthanasia", es: "Eutanasia en casa" }, priceFromCents: 30000, priceToCents: 55000, unit: "visit", durationMinutes: 60, bookingMode: "mobile_appointment" },
    ],
    stageLabels: { estimate_sent: "Info sent", won: "Booked" },
    templates: {
      missed_call_reply: {
        en: "Sorry we missed your call! This is {business_name}. We're probably with a patient. If this is an emergency, please call the nearest emergency vet now. Otherwise, reply here with your pet's name and what you need.",
        es: "¡Disculpe que no pudimos contestar! Le habla {business_name}. Seguramente estamos con un paciente. Si es una emergencia, llame ya a la veterinaria de emergencia más cercana. Si no, responda aquí con el nombre de su mascota y lo que necesita.",
      },
      review_request: {
        en: "Thank you for having {business_name} care for your pet at home, {first_name}. If you were happy with the visit, would you leave us a quick Google review? {review_link}",
        es: "Gracias por dejar que {business_name} atendiera a su mascota en casa, {first_name}. Si quedó contento con la visita, ¿nos deja una reseña en Google? {review_link}",
      },
    },
    qualifyingQuestions: [
      { en: "Is this an emergency? (If yes: send them to the emergency vet in settings and alert the vet.)", es: "¿Es una emergencia? (Si es así: indíqueles la veterinaria de emergencia en la configuración y avise al veterinario.)" },
      { en: "Pet's name, species, breed and age?", es: "¿Nombre, especie, raza y edad de la mascota?" },
      { en: "Reason for the visit, in the owner's own words (no advice given)?", es: "¿Motivo de la visita, en palabras del dueño (sin dar consejos)?" },
      { en: "Address, parking and best times?", es: "¿Dirección, estacionamiento y mejores horarios?" },
    ],
    voice: voice(
      { en: "Thanks for calling {business_name}. If your pet is having an emergency, please tell me right away. Otherwise, what's your pet's name, and what would you like to schedule?", es: "Gracias por llamar a {business_name}. Si su mascota tiene una emergencia, dígamelo de inmediato. Si no, ¿cómo se llama su mascota y qué quiere programar?" },
      PET_EMERGENCY,
      [NO_MEDICAL, "Never store, create or read back medical records, test results or diagnoses. Only collect scheduling and intake details.", "For any health question, say the veterinarian will answer it and offer to schedule a visit."],
    ),
    credentials: [
      { kind: "license", label: "SC veterinary license", note: "SC LLR Board of Veterinary Medical Examiners.", requiredInSC: true },
      { kind: "registration", label: "DEA registration (controlled drugs)", note: "Federal registration for the practicing veterinarian.", requiredInSC: true },
      { kind: "insurance", label: "Professional liability (malpractice) insurance" },
      LIABILITY,
    ],
    auditChecks: [CHECK.licenseVisible, CHECK.serviceArea, CHECK.onlineBooking, { key: "emergency_guidance", label: "Tells visitors where to go in an emergency", why: "Mobile vets can't always come right away; saying so builds trust and protects pets.", weight: 3 }],
  },
  {
    key: "dog_training",
    label: "Dog training",
    hint: "Private lessons, group classes, board-and-train",
    module: "pet_care",
    status: "coming_soon",
    businessType: "project",
    schemaOrg: { type: "LocalBusiness" },
    subjectType: "pet",
    bookingModes: ["package_sessions", "fixed_appointment", "mobile_appointment"],
    services: [
      { key: "evaluation", name: { en: "Evaluation session", es: "Sesión de evaluación" }, priceFromCents: 7500, priceToCents: 15000, unit: "session", durationMinutes: 60, bookingMode: "fixed_appointment" },
      { key: "private_pack", name: { en: "Private lessons (package of 6)", es: "Clases privadas (paquete de 6)" }, priceFromCents: 60000, priceToCents: 120000, unit: "package", durationMinutes: 60, bookingMode: "package_sessions" },
      { key: "group_class", name: { en: "Group class (6 weeks)", es: "Clase grupal (6 semanas)" }, priceFromCents: 18000, priceToCents: 30000, unit: "package", bookingMode: "package_sessions" },
      { key: "in_home", name: { en: "In-home lesson", es: "Clase en casa" }, priceFromCents: 10000, priceToCents: 17500, unit: "session", durationMinutes: 60, bookingMode: "mobile_appointment" },
    ],
    stageLabels: { estimate_sent: "Price sent", won: "Enrolled" },
    templates: {
      missed_call_reply: {
        en: "Sorry we missed your call! This is {business_name}. We're probably in a training session. What's your dog's name and age, and what would you like to work on? Reply here and we'll get right back to you.",
        es: "¡Disculpe que no pudimos contestar! Le habla {business_name}. Seguramente estamos en una clase. ¿Cómo se llama su perro, qué edad tiene y en qué quiere trabajar? Responda aquí y le contestamos pronto.",
      },
      review_request: {
        en: "Thanks for training with {business_name}, {first_name}! If you're seeing progress, would you leave us a quick Google review? It really helps a local business: {review_link}",
        es: "¡Gracias por entrenar con {business_name}, {first_name}! Si está viendo progreso, ¿nos deja una reseña en Google? Nos ayuda mucho como negocio local: {review_link}",
      },
    },
    campaignPresets: [
      { key: "campaign_new_puppy", title: "New puppy class", months: [1, 2], text: { en: "Hi {first_name}, {business_name} here. Got a new puppy over the holidays? Our puppy class starts soon. Reply YES to save a spot.", es: "Hola {first_name}, le escribe {business_name}. ¿Tiene un cachorro nuevo? Nuestra clase para cachorros empieza pronto. Responda SÍ para apartar un lugar." } },
    ],
    qualifyingQuestions: [
      { en: "Dog's name, breed and age?", es: "¿Nombre, raza y edad del perro?" },
      { en: "What would you like to work on (basics, leash, jumping, reactivity, aggression)?", es: "¿En qué quiere trabajar (lo básico, correa, saltar, reactividad, agresión)?" },
      { en: "Has your dog ever bitten a person or another dog?", es: "¿Su perro ha mordido alguna vez a una persona o a otro perro?" },
      { en: "Private lessons, group class, or in-home?", es: "¿Clases privadas, grupales o en casa?" },
    ],
    voice: voice({ en: "Thanks for calling {business_name}. What's your dog's name, and what would you like to work on?", es: "Gracias por llamar a {business_name}. ¿Cómo se llama su perro y en qué quiere trabajar?" }, PET_EMERGENCY, [NO_MEDICAL, "Never give behavior advice for bites or aggression on the phone; offer an evaluation with the trainer."]),
    credentials: [
      { kind: "certification", label: "Professional trainer certification (e.g. CCPDT CPDT-KA)", note: "Optional, but a strong trust signal." },
      LIABILITY,
      { kind: "insurance", label: "Animal bailee coverage (for board-and-train)", note: "Covers dogs in your care overnight." },
    ],
    auditChecks: [CHECK.onlineBooking, CHECK.priceRanges, { key: "methods", label: "Training methods explained", why: "Owners (and AI assistants) look for how you train before choosing.", weight: 1 }],
  },
];
