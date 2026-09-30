/**
 * Wording for demo businesses: what customers text, what the owner answers,
 * typical job sizes. Plain data, one entry per trade that businesses can pick
 * today. Spanish lines are for the Spanish-speaking demo customers.
 */

export type DemoTrade = {
  /** Demo business name. */
  business: string;
  owner: string;
  /** What a new customer texts or says after a missed call. */
  asks: string[];
  asksEs: string[];
  /** Owner's first reply (before the estimate). {first} = customer's first name. */
  reply: string[];
  /** Job descriptions and typical price range in dollars. */
  jobs: { what: string; from: number; to: number }[];
};

const T: Record<string, DemoTrade> = {
  roofing: {
    business: "Palmetto Roofing",
    owner: "Rick Alvarez",
    asks: [
      "We had a storm Friday and there's shingles in the yard. Can someone come look this week?",
      "Leak over the back bedroom when it rains hard. How soon can you come out?",
      "Looking for a quote on a full roof replacement, house is about 2,200 sq ft",
      "Insurance adjuster is coming Tuesday, can you meet them at the house?",
      "Do you do gutter guards too or just roofs?",
      "Need a few shingles replaced and a boot around the vent pipe",
      "Water stain on the ceiling in the living room, pretty sure it's the roof",
      "Buying a house in Nexton, need a roof inspection before closing",
    ],
    asksEs: ["Tengo una gotera en la cocina cuando llueve fuerte. ¿Pueden venir a revisar?", "Necesito un presupuesto para cambiar el techo completo"],
    reply: [
      "Sorry to hear that {first}. I can come take a look Thursday around 10. Does that work?",
      "Happy to help {first}! I can swing by tomorrow afternoon to look.",
      "Thanks {first}. We'll get you on the schedule for a free inspection this week.",
    ],
    jobs: [
      { what: "Full roof replacement (architectural shingles)", from: 9800, to: 16500 },
      { what: "Leak repair and pipe boot", from: 450, to: 1200 },
      { what: "Storm damage repair", from: 1800, to: 6500 },
      { what: "Roof inspection report", from: 0, to: 250 },
    ],
  },
  hvac: {
    business: "Lowcountry Comfort Heating & Air",
    owner: "Marcus Green",
    asks: [
      "AC is blowing warm air and it's 88 inside. Can anyone come today?",
      "Unit outside is making a loud buzzing noise",
      "Looking for a quote on a new system, ours is 18 years old",
      "Do you do maintenance plans? Want spring and fall tune ups",
      "Heat pump keeps freezing up, ice all over the outside unit",
      "Upstairs is 10 degrees warmer than downstairs, can you look at it?",
      "Water leaking from the air handler in the attic",
    ],
    asksEs: ["El aire acondicionado no enfría. ¿Pueden venir hoy?", "¿Cuánto cuesta un sistema nuevo para una casa de 1,800 pies?"],
    reply: [
      "Hi {first}, we can get a tech out this afternoon between 2 and 4. Does that work?",
      "Sorry about that {first}! First thing tomorrow morning okay? Arrival 8–10.",
      "Happy to help {first}. I'll come measure and give you options Thursday.",
    ],
    jobs: [
      { what: "New 3-ton heat pump system", from: 7800, to: 12500 },
      { what: "Capacitor and contactor replacement", from: 280, to: 450 },
      { what: "Refrigerant leak repair and recharge", from: 650, to: 1400 },
      { what: "Maintenance plan (2 visits/year)", from: 189, to: 249 },
    ],
  },
  plumbing: {
    business: "Tidewater Plumbing",
    owner: "Dave Russo",
    asks: [
      "Water heater is leaking all over the garage floor",
      "Kitchen sink is backed up and won't drain",
      "Need a quote to replace a toilet and a vanity faucet",
      "Water bill doubled, think we have a leak somewhere",
      "Low water pressure in the whole house since last week",
      "Shower valve is dripping nonstop",
    ],
    asksEs: ["Se tapó el drenaje de la cocina. ¿Pueden venir hoy?", "El calentador de agua está goteando"],
    reply: [
      "Sorry to hear that {first}! Can you shut the water off at the heater? We can be there by 3.",
      "Hi {first}, we have an opening tomorrow 8–10. Want it?",
      "Thanks {first}. I'll send someone out this afternoon to take a look.",
    ],
    jobs: [
      { what: "50-gallon water heater replacement", from: 1600, to: 2400 },
      { what: "Main drain cleaning", from: 225, to: 450 },
      { what: "Slab leak repair", from: 1200, to: 3800 },
      { what: "Toilet and faucet replacement", from: 480, to: 900 },
    ],
  },
  electrical: {
    business: "Bright Line Electric",
    owner: "Tanya Brooks",
    asks: [
      "Half the outlets in the kitchen stopped working",
      "Looking for a quote on a whole-house generator",
      "Want an EV charger installed in the garage for a new Tesla",
      "Breaker keeps tripping when the dryer runs",
      "Need a panel upgrade, the inspector flagged our Federal Pacific panel",
      "Can you install 6 recessed lights in the living room?",
    ],
    asksEs: ["Se fue la luz en la mitad de la casa", "Quiero instalar un cargador para carro eléctrico"],
    reply: [
      "Hi {first}, sounds like a GFCI or a loose connection. We can check it tomorrow 10–12.",
      "Happy to quote that {first}! I'll come look at your panel Thursday.",
      "Thanks {first}. We'll get you scheduled this week.",
    ],
    jobs: [
      { what: "200A panel upgrade", from: 2400, to: 3800 },
      { what: "Level 2 EV charger install", from: 850, to: 1600 },
      { what: "Whole-house generator", from: 9500, to: 15000 },
      { what: "Recessed lighting (6 cans)", from: 900, to: 1400 },
    ],
  },
  remodeling: {
    business: "Oakline Builders",
    owner: "Chris Whitfield",
    asks: [
      "Looking to redo our master bath, walk-in shower instead of the tub",
      "Want a quote on a kitchen remodel, new cabinets and quartz counters",
      "Screened porch addition on the back of the house, is that something you do?",
      "Need some drywall repair and a door rehung after a water leak",
      "Thinking about opening up the wall between the kitchen and living room",
    ],
    asksEs: ["Queremos remodelar el baño principal", "¿Hacen cocinas? Necesitamos gabinetes nuevos"],
    reply: [
      "Would love to help {first}! Can I come see the space Wednesday at 4?",
      "Great project {first}. I'll bring some samples Thursday afternoon.",
      "Thanks {first}. Let's set up a walk-through this week.",
    ],
    jobs: [
      { what: "Master bath remodel", from: 18000, to: 32000 },
      { what: "Kitchen remodel", from: 35000, to: 68000 },
      { what: "Screened porch addition", from: 22000, to: 38000 },
      { what: "Drywall and trim repair", from: 650, to: 2200 },
    ],
  },
  painting: {
    business: "Sweetgrass Painting",
    owner: "Luis Ortega",
    asks: [
      "Need the exterior of our house painted, 2 story about 2,400 sq ft",
      "Quote for painting 3 bedrooms and a hallway?",
      "Can you paint our kitchen cabinets white?",
      "Deck needs to be stained before summer",
      "Moving out end of the month, need the whole place repainted",
    ],
    asksEs: ["Necesito pintar el exterior de la casa", "¿Cuánto cobran por pintar 3 cuartos?"],
    reply: ["Happy to help {first}! I can stop by Tuesday to measure.", "Hi {first}, I'll come look Thursday and have a price to you the same day."],
    jobs: [
      { what: "Exterior repaint", from: 5500, to: 9800 },
      { what: "Interior: 3 bedrooms + hall", from: 2200, to: 3600 },
      { what: "Cabinet painting", from: 3800, to: 6500 },
      { what: "Deck stain", from: 900, to: 1800 },
    ],
  },
  gutters: {
    business: "Rain Ready Gutters",
    owner: "Sam Pinckney",
    asks: [
      "Gutters are overflowing in the front, need them cleaned",
      "Quote for new seamless gutters on a 1-story ranch?",
      "Do you install gutter guards? Pine needles everywhere",
      "One of the downspouts came off in the storm",
    ],
    asksEs: ["Necesito limpiar las canaletas", "¿Instalan canaletas nuevas?"],
    reply: ["Hi {first}, we can get you on Thursday's cleaning route. Sound good?", "Happy to quote that {first}! I'll measure tomorrow."],
    jobs: [
      { what: "Gutter cleaning", from: 150, to: 275 },
      { what: "Seamless gutters (150 ft)", from: 1400, to: 2600 },
      { what: "Gutter guards", from: 1200, to: 2800 },
    ],
  },
  fencing: {
    business: "Carolina Fence Company",
    owner: "Jordan Hayes",
    asks: [
      "Need a quote on a 6ft privacy fence around the backyard",
      "Hurricane knocked down 3 sections of our fence",
      "Want a vinyl fence for the pool area, has to meet code",
      "Gate is sagging and won't latch",
    ],
    asksEs: ["Necesito una cerca de privacidad en el patio", "Se cayó parte de la cerca con la tormenta"],
    reply: ["Hi {first}, I can come measure Wednesday afternoon.", "Sorry about the storm damage {first}. We can look at it tomorrow."],
    jobs: [
      { what: "6ft wood privacy fence (180 ft)", from: 5200, to: 7800 },
      { what: "Vinyl pool fence", from: 6500, to: 11000 },
      { what: "Storm repair (3 sections)", from: 650, to: 1400 },
      { what: "Gate repair", from: 180, to: 400 },
    ],
  },
  tree_service: {
    business: "Live Oak Tree Service",
    owner: "Wade Simmons",
    asks: [
      "Big limb hanging over the roof after the storm, can you come today?",
      "Need a dead pine taken down before it falls on the shed",
      "Quote for trimming 3 live oaks away from the house?",
      "Stump grinding for 4 stumps in the front yard",
    ],
    asksEs: ["Se cayó una rama grande sobre la cerca", "Necesito cortar un pino muerto"],
    reply: ["Hi {first}, we can take a look this afternoon. Send a photo if you can.", "Happy to quote that {first}! I'll come by tomorrow morning."],
    jobs: [
      { what: "Pine removal", from: 1200, to: 3200 },
      { what: "Live oak trimming (3 trees)", from: 1400, to: 2800 },
      { what: "Emergency limb removal", from: 800, to: 2400 },
      { what: "Stump grinding (4)", from: 400, to: 750 },
    ],
  },
  handyman: {
    business: "Honey-Do Handyman Services",
    owner: "Pete Morrison",
    asks: [
      "I have a list: 2 ceiling fans, a leaky faucet and some caulking. Can you do it all in one visit?",
      "Need a TV mounted over the fireplace",
      "Screen door is ripped and a cabinet hinge is broken",
      "Can you hang some shelves and fix a sticking door?",
    ],
    asksEs: ["Necesito instalar dos ventiladores de techo", "¿Pueden montar una televisión en la pared?"],
    reply: ["Hi {first}, sure thing. I can come Friday morning and knock it all out.", "Happy to help {first}! Tuesday 1–3 work?"],
    jobs: [
      { what: "Punch list (half day)", from: 280, to: 450 },
      { what: "TV mount over fireplace", from: 180, to: 350 },
      { what: "Ceiling fans (2)", from: 250, to: 400 },
    ],
  },
  lawn_care: {
    business: "Summerville Lawn Pros",
    owner: "Dana Brooks",
    asks: [
      "Just moved to Cane Bay, looking for weekly mowing. Corner lot, maybe 1/3 acre. How much?",
      "Do you do fertilizer and weed control too?",
      "Need someone to cut the grass every other week",
      "Looking for a quote on pine straw for the front beds",
      "Our lawn guy retired, are you taking new customers?",
    ],
    asksEs: ["¿Cuánto cobran por cortar el césped cada semana?", "Me interesa la paja de pino para el frente de la casa"],
    reply: ["Hi {first}! I'll swing by tomorrow and send you a price.", "Welcome to the neighborhood {first}! We service Cane Bay on Thursdays."],
    jobs: [
      { what: "Pine straw install (30 bales)", from: 360, to: 520 },
      { what: "Aeration and overseeding", from: 180, to: 320 },
      { what: "Spring cleanup", from: 250, to: 450 },
    ],
  },
  landscaping: {
    business: "Magnolia Landscapes",
    owner: "Grace Holt",
    asks: [
      "Looking for a design for our front beds, the builder landscaping is dying",
      "Need weekly maintenance for a commercial property",
      "Quote for sod in the backyard, about 2,000 sq ft?",
      "Want to add a paver patio and some lighting",
    ],
    asksEs: ["Queremos rediseñar el jardín del frente", "¿Cuánto cuesta poner grama nueva en el patio?"],
    reply: ["Hi {first}, I'd love to see it. Can I stop by Thursday at 4?", "Happy to help {first}! I'll put together a few options."],
    jobs: [
      { what: "Front bed redesign", from: 2800, to: 6500 },
      { what: "Sod install (2,000 sq ft)", from: 1800, to: 2800 },
      { what: "Paver patio + lighting", from: 8500, to: 16000 },
    ],
  },
  house_cleaning: {
    business: "Sweet Tea Cleaning Co",
    owner: "Monique Legare",
    asks: [
      "Looking for someone to clean every other week, 3 bed 2 bath in Nexton",
      "Do you do move-out cleans? Lease ends the 30th",
      "Need a deep clean before my in-laws visit next weekend",
      "We have a vacation rental on Folly, need turnovers every Saturday",
      "How much for a weekly clean? We have two dogs",
    ],
    asksEs: ["Busco limpieza cada dos semanas, casa de 3 habitaciones", "¿Hacen limpieza de mudanza?"],
    reply: ["Hi {first}! We'd love to help. Can I stop by Tuesday for a quick walk-through and quote?", "Thanks {first}! How many bedrooms and bathrooms, and any pets?"],
    jobs: [
      { what: "Deep clean", from: 280, to: 480 },
      { what: "Move-out clean", from: 320, to: 560 },
      { what: "Vacation rental turnover", from: 120, to: 220 },
    ],
  },
  pest_control: {
    business: "Palmetto Pest Pros",
    owner: "Travis Drayton",
    asks: [
      "Seeing roaches in the kitchen at night, the big palmetto bugs. Can you come out?",
      "Need a termite inspection for a closing next week",
      "Mosquitoes are terrible in the backyard, do you do monthly spraying?",
      "Ants all over the bathroom counter",
      "Our termite bond is up for renewal with another company, what do you charge?",
      "Heard something in the attic, think it's squirrels or rats",
    ],
    asksEs: ["Tengo cucarachas en la cocina", "¿Cuánto cuesta el tratamiento de mosquitos?"],
    reply: ["Hi {first}, sorry to hear that! We can treat Thursday. Want to start on our quarterly plan?", "Happy to help {first}. I can get a tech out tomorrow morning."],
    jobs: [
      { what: "Initial pest treatment", from: 150, to: 250 },
      { what: "Termite inspection + bond", from: 350, to: 650 },
      { what: "Rodent exclusion", from: 400, to: 1200 },
    ],
  },
  pool_service: {
    business: "Crystal Coast Pool Care",
    owner: "Sam Ravenel",
    asks: [
      "Pool turned green after the storm, can you help?",
      "Looking for weekly pool service, in-ground saltwater",
      "Need someone to open our pool for the season",
      "Pump is making a grinding noise",
      "Just bought a house with a pool and have no idea what I'm doing",
    ],
    asksEs: ["La piscina se puso verde", "Busco servicio semanal para mi piscina"],
    reply: ["Hi {first}! We can get it back to blue. I'll stop by tomorrow to take a look.", "Welcome {first}! Weekly service starts at $45 a visit. Want me to come see it?"],
    jobs: [
      { what: "Green-to-clean", from: 250, to: 650 },
      { what: "Pool opening", from: 180, to: 300 },
      { what: "Pump repair", from: 250, to: 900 },
    ],
  },
};

/** Recurring service offerings for lawn businesses: [service, frequency, price in dollars]. */
export const RECURRING_OFFERS: Record<string, [string, "weekly" | "biweekly" | "every_4_weeks", number][]> = {
  lawn_care: [
    ["Mow, edge & blow", "weekly", 45],
    ["Full service", "weekly", 65],
    ["Mowing", "biweekly", 40],
    ["Fert & weed control", "every_4_weeks", 75],
  ],
  house_cleaning: [
    ["Recurring clean", "biweekly", 150],
    ["Recurring clean", "weekly", 130],
    ["Recurring clean", "every_4_weeks", 180],
  ],
  pest_control: [
    ["Quarterly pest service", "every_4_weeks", 55],
    ["Mosquito treatment", "every_4_weeks", 75],
  ],
  pool_service: [
    ["Weekly pool service", "weekly", 45],
    ["Weekly pool service (salt)", "weekly", 50],
    ["Every other week pool check", "biweekly", 55],
  ],
  landscaping: [
    ["Weekly maintenance", "weekly", 85],
    ["Bed maintenance", "biweekly", 95],
    ["Commercial maintenance", "weekly", 240],
    ["Shrub trimming", "every_4_weeks", 120],
  ],
};

export function tradeFor(industry: string): DemoTrade {
  return T[industry] ?? T.handyman;
}

export const DEMO_TRADES = Object.keys(T);

/** Customer names (Lowcountry mix). Spanish speakers are marked "es". */
export const NAMES: [string, "en" | "es"][] = [
  ["Karen Whitfield", "en"], ["Marcus Green", "en"], ["Jennifer Moss", "en"], ["Tom Brennan", "en"], ["Linda Park", "en"],
  ["David Chen", "en"], ["Angela Ruiz", "en"], ["Greg Holt", "en"], ["María González", "es"], ["Keisha Williams", "en"],
  ["Jim Barton", "en"], ["Luis Hernández", "es"], ["Carol Simmons", "en"], ["Wanda Pierce", "en"], ["Frank Tate", "en"],
  ["Rosa Martínez", "es"], ["Bill Rhodes", "en"], ["Pat O'Neill", "en"], ["Tom Heyward", "en"], ["Shanice Grant", "en"],
  ["Brian Kowalski", "en"], ["Ashley Mitchell", "en"], ["Hector Díaz", "es"], ["Megan Lowe", "en"], ["Derrick Jenkins", "en"],
  ["Stephanie Wu", "en"], ["Robert Manigault", "en"], ["Kim Nguyen", "en"], ["Chris Pappas", "en"], ["Denise Rivers", "en"],
  ["Ana Castillo", "es"], ["Tyler Fox", "en"], ["Nicole Bryant", "en"], ["Jamal Washington", "en"], ["Heather Cole", "en"],
  ["Paul Seabrook", "en"], ["Laura Bennett", "en"], ["Jorge Ramírez", "es"], ["Sarah Kline", "en"], ["Andre Middleton", "en"],
];

export const STREETS = [
  "Azalea Ct", "Palmetto Blvd", "Old Trolley Rd", "Cypress Way", "Main St", "Magnolia Dr", "Live Oak Ln", "Sweetgrass Cir",
  "Berlin G Myers Pkwy", "Dorchester Rd", "Wisteria Way", "Central Ave", "Tupelo Ln", "Oak Forest Dr", "Carriage Ln",
  "Marsh Hawk Dr", "Pinewood Ave", "Bees Ferry Rd", "Sea Island Pkwy", "Rivers Ave",
];
export const TOWNS = ["Summerville", "Goose Creek", "Mount Pleasant", "Ladson", "North Charleston", "James Island", "Moncks Corner", "Nexton"];
