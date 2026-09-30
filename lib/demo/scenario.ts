import type { BusinessType, Language } from "@/lib/business-types";
import { getIndustry } from "@/lib/industries";
import type { BookingMode } from "@/lib/industries/types";
import type { LeadStage } from "@/lib/leads/stages";
import { defaultTemplatesFor } from "@/lib/templates/defaults";
import { renderTemplate } from "@/lib/templates/render";
import { addDays, localDateString, weekdayOf, zonedTimeToUtc } from "@/lib/time";
import { RECURRING_OFFERS, STREETS, TOWNS, tradeFor } from "./content";

/**
 * A demo business's whole story as plain data: about 3 months of customers,
 * missed calls, texts, estimates, won jobs, reviews, bookings and (for lawn
 * businesses) recurring customers. Pure: the same inputs give the same story.
 * lib/services/demo.ts writes it to the database.
 */

export type DemoContact = {
  key: string;
  name: string | null;
  phone: string;
  language: Language;
  address: string | null;
  marketingConsentAt?: string;
  reviewRequestedAt?: string;
  serviceTextsAttested?: boolean;
};
export type DemoLead = {
  key: string;
  contactKey: string;
  stage: LeadStage;
  source: "missed_call" | "inbound_text" | "campaign" | "manual";
  createdAt: string;
  firstResponseAt: string | null;
  estimateCents: number | null;
  estimateSentAt: string | null;
  closedAt: string | null;
  unread: boolean;
  lastMessageAt: string;
  broadcastKey?: string;
};
export type DemoMessage = {
  contactKey: string;
  leadKey: string | null;
  direction: "inbound" | "outbound";
  at: string;
  body: string;
  auto: boolean;
  category: "conversational" | "informational" | "marketing" | null;
  broadcastKey?: string;
};
export type DemoCall = { contactKey: string; leadKey: string; at: string; textBack: boolean };
export type DemoJob = { key: string; contactKey: string; leadKey: string | null; recurringKey: string | null; description: string | null; amountCents: number | null; completedOn: string; completedAt: string };
export type DemoScheduled = {
  contactKey: string;
  leadKey: string | null;
  jobKey?: string;
  broadcastKey?: string;
  kind: "estimate_followup" | "review_request" | "broadcast";
  templateKey: string | null;
  category: "informational" | "marketing";
  sendAt: string;
  status: "pending" | "sent" | "skipped";
  skipReason?: string;
  context: Record<string, unknown>;
};
export type DemoRecurring = {
  key: string;
  contactKey: string;
  serviceType: string;
  frequency: "weekly" | "biweekly" | "every_4_weeks";
  serviceDay: number;
  startDate: string;
  priceCents: number;
  status: "active" | "paused" | "canceled";
  pausedUntil: string | null;
  canceledOn: string | null;
  cancelReason: string | null;
};
export type DemoBroadcast = {
  key: string;
  kind: "service_notice" | "campaign";
  name: string;
  templateKey: string | null;
  bodyEn: string;
  bodyEs: string;
  category: "informational" | "marketing";
  serviceDate: string | null;
  newDate: string | null;
  scheduledAt: string;
  recipientCount: number;
};
export type DemoService = { key: string; name: string; nameEs: string; mode: BookingMode; durationMinutes: number; priceFromCents: number | null; priceToCents: number | null };
export type DemoBooking = {
  contactKey: string;
  leadKey: string | null;
  serviceKey: string;
  mode: BookingMode;
  status: "confirmed" | "pending_approval";
  source: "owner" | "customer_link";
  startsAt: string;
  endsAt: string;
  serviceDate: string;
  address: string | null;
};

export type DemoScenario = {
  business: { name: string; ownerName: string; businessType: BusinessType; industry: string; reviewUrl: string };
  contacts: DemoContact[];
  leads: DemoLead[];
  messages: DemoMessage[];
  calls: DemoCall[];
  jobs: DemoJob[];
  scheduled: DemoScheduled[];
  recurring: DemoRecurring[];
  broadcasts: DemoBroadcast[];
  services: DemoService[];
  bookings: DemoBooking[];
  credentials: { kind: "license" | "certification" | "insurance" | "registration" | "bond"; label: string; number: string; issuer: string | null; expiresOn: string | null }[];
  notifications: { kind: "new_lead" | "flagged_reply" | "system"; body: string; link: string; at: string }[];
  smsSentThisMonth: number;
};

/** Small deterministic random numbers, so a demo looks the same every time for the same seed. */
export function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) => Math.floor(next() * (max - min + 1)) + min,
    pick: <T>(list: readonly T[]) => list[Math.floor(next() * list.length)],
    chance: (p: number) => next() < p,
  };
}

const FIRST = ["Karen", "Marcus", "Jennifer", "Tom", "Linda", "David", "Angela", "Greg", "Keisha", "Jim", "Carol", "Wanda", "Frank", "Bill", "Pat", "Shanice", "Brian", "Ashley", "Megan", "Derrick", "Stephanie", "Robert", "Kim", "Chris", "Denise", "Tyler", "Nicole", "Jamal", "Heather", "Paul", "Laura", "Sarah", "Andre", "Beth", "Randy", "Monique", "Kevin", "Tina", "Walter", "Holly"];
const LAST = ["Whitfield", "Green", "Moss", "Brennan", "Park", "Chen", "Ruiz", "Holt", "Williams", "Barton", "Simmons", "Pierce", "Tate", "Rhodes", "O'Neill", "Grant", "Kowalski", "Mitchell", "Lowe", "Jenkins", "Wu", "Manigault", "Nguyen", "Pappas", "Rivers", "Fox", "Bryant", "Washington", "Cole", "Seabrook", "Bennett", "Kline", "Middleton", "Heyward", "Legare", "Ravenel", "Drayton", "Pinckney"];
const FIRST_ES = ["María", "Luis", "Rosa", "Hector", "Ana", "Jorge", "Carmen", "Miguel", "Lucía", "José"];
const LAST_ES = ["González", "Hernández", "Martínez", "Díaz", "Castillo", "Ramírez", "López", "Torres", "Flores", "Morales"];

const TZ = "America/New_York";

export function buildDemoScenario(industryKey: string, now: Date, seed = 1): DemoScenario {
  const industry = getIndustry(industryKey);
  if (!industry) throw new Error(`unknown industry ${industryKey}`);
  const trade = tradeFor(industryKey);
  const r = rng(seed);
  const today = localDateString(now, TZ);
  const at = (daysAgo: number, hour: number, minute = 0) => zonedTimeToUtc(addDays(today, -daysAgo), hour, minute, TZ).toISOString();
  const plus = (iso: string, minutes: number) => new Date(Date.parse(iso) + minutes * 60_000).toISOString();
  const nowIso = now.toISOString();
  const past = (iso: string) => Date.parse(iso) <= now.getTime();
  /** A local time N days after the day of `iso`. */
  const dayAt = (iso: string, days: number, hour: number, minute: number) => zonedTimeToUtc(addDays(localDateString(new Date(iso), TZ), days), hour, minute, TZ).toISOString();
  /** Keeps a planned moment in the past (demo history) but after `notBefore`. */
  const clampPast = (iso: string, notBefore: string) => {
    const latest = now.getTime() - 5 * 60_000;
    const t = Math.min(Date.parse(iso), latest);
    return new Date(Math.max(t, Math.min(Date.parse(notBefore), latest))).toISOString();
  };
  const businessType = industry.businessType;
  const recurring = businessType === "recurring";

  const templates = defaultTemplatesFor(businessType, industryKey);
  const tpl = (key: string, lang: Language) =>
    templates.find((t) => t.key === key && t.language === lang)?.body ?? templates.find((t) => t.key === key && t.language === "en")?.body ?? "";
  const reviewUrl = `https://g.page/r/${trade.business.toLowerCase().replace(/[^a-z0-9]+/g, "-")}/review`;
  const render = (key: string, lang: Language, first: string | null) =>
    renderTemplate(tpl(key, lang), { business_name: trade.business, business_phone: "(843) 555-0100", first_name: first, review_link: reviewUrl });
  const FOOTER: Record<Language, string> = { en: "\nReply STOP to opt out.", es: "\nResponda STOP para no recibir más mensajes." };

  const out: DemoScenario = {
    business: { name: trade.business, ownerName: trade.owner, businessType, industry: industryKey, reviewUrl },
    contacts: [],
    leads: [],
    messages: [],
    calls: [],
    jobs: [],
    scheduled: [],
    recurring: [],
    broadcasts: [],
    services: [],
    bookings: [],
    credentials: [],
    notifications: [],
    smsSentThisMonth: 0,
  };

  // --- People -------------------------------------------------------------
  const usedPhones = new Set<string>();
  const usedNames = new Set<string>();
  let contactN = 0;
  function newContact(opts: { spanish?: boolean; unnamed?: boolean } = {}): DemoContact {
    const spanish = opts.spanish ?? r.chance(0.12);
    let name = "";
    for (let tries = 0; tries < 50; tries++) {
      name = spanish ? `${r.pick(FIRST_ES)} ${r.pick(LAST_ES)}` : `${r.pick(FIRST)} ${r.pick(LAST)}`;
      if (!usedNames.has(name)) break;
    }
    usedNames.add(name);
    let phone = "";
    do phone = `+1843555${String(r.int(1000, 9999))}`;
    while (usedPhones.has(phone));
    usedPhones.add(phone);
    const c: DemoContact = {
      key: `c${++contactN}`,
      name: opts.unnamed ? null : name,
      phone,
      language: spanish ? "es" : "en",
      address: `${r.int(12, 980)} ${r.pick(STREETS)}, ${r.pick(TOWNS)}`,
    };
    out.contacts.push(c);
    return c;
  }
  const firstName = (c: DemoContact) => c.name?.split(" ")[0] ?? null;
  /** Fills in the customer's first name; without a name, the greeting just drops it ("Happy to help!"). */
  const say = (text: string, c: DemoContact) => {
    const first = firstName(c);
    return first ? text.replace(/\{first\}/g, first) : text.replace(/ \{first\}/g, "").replace(/\{first\}/g, "");
  };

  // --- Leads over the last 12 weeks (a busy, growing season) ----------------
  const perWeek = recurring ? [2, 2, 3, 2, 3, 3, 4, 3, 4, 4, 3, 5] : [3, 2, 4, 3, 4, 5, 4, 5, 6, 5, 5, 7];
  let leadN = 0;
  let jobN = 0;
  const recentOpenLeads: { lead: DemoLead; contact: DemoContact }[] = [];

  for (let w = 0; w < perWeek.length; w++) {
    const weeksAgo = perWeek.length - 1 - w;
    for (let i = 0; i < perWeek[w]; i++) {
      // Newest week: spread over the days so far; the very first two land today.
      // Week N covers exactly days 7N..7N+6 ago, so the dashboard's "last 7 days" matches the newest week.
      const daysAgo = weeksAgo === 0 ? (i < 2 ? 0 : r.int(1, 6)) : weeksAgo * 7 + r.int(0, 6);
      if (daysAgo < 0) continue;
      const hour = r.int(7, 18);
      let createdAt = at(daysAgo, hour, r.int(0, 59));
      if (!past(createdAt)) createdAt = plus(nowIso, -r.int(15, 90));
      const contact = newContact({ unnamed: daysAgo === 0 && i === 0 });
      const source: DemoLead["source"] = r.chance(0.48) ? "missed_call" : r.chance(0.8) ? "inbound_text" : "manual";
      const age = (now.getTime() - Date.parse(createdAt)) / 86_400_000;

      // Where this lead is now.
      let stage: LeadStage;
      if (age < 1) stage = r.chance(0.6) ? "new" : "contacted";
      else if (age < 4) stage = r.pick(["contacted", "estimate_sent", "estimate_sent"] as LeadStage[]);
      else if (age < 14) stage = r.pick(["estimate_sent", "won", "won", "contacted", "lost"] as LeadStage[]);
      else stage = r.chance(0.58) ? "won" : r.chance(0.6) ? "lost" : "estimate_sent";
      if (stage === "estimate_sent" && age > 24) stage = "lost";
      // Always at least one quote waiting this week, so the automatic follow-ups have something to show.
      if (weeksAgo === 0 && i === 2) stage = "estimate_sent";

      const job = r.pick(trade.jobs);
      const dollars = Math.max(job.from, 150) + Math.round((r.next() * (job.to - Math.max(job.from, 150))) / 25) * 25;
      const lang = contact.language;
      const ask = lang === "es" ? r.pick(trade.asksEs) : r.pick(trade.asks);
      // Timeline: the ask, the owner's reply, a visit, the estimate (late afternoon), the answer.
      const askAt = source === "missed_call" ? plus(createdAt, r.int(2, 9)) : createdAt;
      const responseMin = r.chance(0.75) ? r.int(3, 18) : r.int(25, 95);
      const firstResponseAt = stage === "new" ? null : clampPast(plus(askAt, responseMin), askAt);
      const needsEstimate = stage === "estimate_sent" || stage === "won" || stage === "lost";
      const estimateSentAt = needsEstimate ? clampPast(dayAt(createdAt, r.int(1, 2), r.int(15, 18), r.int(0, 59)), plus(firstResponseAt!, 45)) : null;
      const closedAt = stage === "won" || stage === "lost" ? clampPast(dayAt(estimateSentAt!, r.int(1, 4), r.int(8, 19), r.int(0, 59)), plus(estimateSentAt!, 30)) : null;

      const key = `l${++leadN}`;
      const msgs: DemoMessage[] = [];
      const m = (direction: DemoMessage["direction"], atIso: string, body: string, extra: Partial<DemoMessage> = {}) =>
        msgs.push({ contactKey: contact.key, leadKey: key, direction, at: atIso, body, auto: false, category: direction === "inbound" ? null : "conversational", ...extra });

      let firstOutbound = true;
      const footer = () => {
        const f = firstOutbound ? FOOTER[lang] : "";
        firstOutbound = false;
        return f;
      };
      if (source === "missed_call") {
        out.calls.push({ contactKey: contact.key, leadKey: key, at: createdAt, textBack: true });
        m("outbound", plus(createdAt, 0.2), render("missed_call_reply", lang, null) + footer(), { auto: true });
        m("inbound", askAt, ask);
      } else if (source === "inbound_text") {
        m("inbound", createdAt, ask);
      }
      if (firstResponseAt) {
        if (source === "manual") m("outbound", firstResponseAt, say(`Hi {first}, it's ${trade.owner.split(" ")[0]} with ${trade.business}. Got your info from the referral. When's a good time to come take a look?`, contact) + footer());
        else m("outbound", firstResponseAt, say(lang === "es" ? "¡Hola {first}! Con gusto le ayudamos. ¿Le queda bien mañana en la tarde para ir a ver?" : r.pick(trade.reply), contact) + footer());
        if (stage !== "new" && source !== "manual") m("inbound", plus(firstResponseAt, r.int(4, 40)), lang === "es" ? "Sí, perfecto. Gracias." : r.pick(["That works, thanks!", "Perfect, see you then", "Sounds good 👍", "Yes please. Gate code is 1947"]));
      }
      if (estimateSentAt) {
        const amount = `$${dollars.toLocaleString("en-US")}`;
        m("outbound", estimateSentAt, lang === "es" ? say(`{first}, su presupuesto para ${job.what.toLowerCase()} es ${amount}. Cualquier pregunta, aquí estamos.`, contact) : say(`Hi {first}, your estimate for ${job.what.toLowerCase()} is ${amount}. Let me know if you have any questions!`, contact));
        // Automatic follow-ups at 2, 5 and 10 days (stop when they answer).
        const sent = localDateString(new Date(estimateSentAt), TZ);
        for (const [step, days] of [[1, 2], [2, 5], [3, 10]] as const) {
          const sendAt = zonedTimeToUtc(addDays(sent, days), 10, 0, TZ).toISOString();
          const answered = closedAt && Date.parse(closedAt) < Date.parse(sendAt);
          const s: DemoScheduled = { contactKey: contact.key, leadKey: key, kind: "estimate_followup", templateKey: `estimate_followup_${step}`, category: "informational", sendAt, status: "pending", context: { estimate_sent_at: estimateSentAt, step } };
          if (answered) {
            s.status = "skipped";
            s.skipReason = stage === "won" || stage === "lost" ? "stage_changed" : "customer_replied";
          } else if (past(sendAt)) {
            s.status = "sent";
            m("outbound", sendAt, render(`estimate_followup_${step}`, lang, firstName(contact)), { auto: true, category: "informational" });
          }
          if (s.status !== "pending" || stage === "estimate_sent") out.scheduled.push(s);
        }
      }
      if (stage === "won" && closedAt) {
        m("inbound", closedAt, lang === "es" ? "Vamos a hacerlo. ¿Cuándo pueden empezar?" : r.pick(["Let's do it. When can you start?", "We're going with you guys. What's next?", "Approved! Let us know the date.", "Go ahead and book it"]));
        m("outbound", plus(closedAt, r.int(5, 40)), lang === "es" ? say("¡Gracias {first}! Le confirmamos la fecha hoy.", contact) : say("Thanks {first}! We'll get you on the schedule and confirm the date today.", contact));
        const doneDay = addDays(localDateString(new Date(closedAt), TZ), r.int(2, 8));
        const completedAt = zonedTimeToUtc(doneDay, r.int(12, 16), 0, TZ).toISOString();
        if (past(completedAt)) {
          const jk = `j${++jobN}`;
          out.jobs.push({ key: jk, contactKey: contact.key, leadKey: key, recurringKey: null, description: job.what, amountCents: dollars * 100, completedOn: doneDay, completedAt });
          const reviewAt = plus(completedAt, 120);
          if (past(reviewAt)) {
            m("outbound", reviewAt, render("review_request", lang, firstName(contact)), { auto: true, category: "informational" });
            out.scheduled.push({ contactKey: contact.key, leadKey: key, jobKey: jk, kind: "review_request", templateKey: "review_request", category: "informational", sendAt: reviewAt, status: "sent", context: {} });
            contact.reviewRequestedAt = reviewAt;
            if (r.chance(0.5)) m("inbound", plus(reviewAt, r.int(20, 600)), lang === "es" ? "¡Listo! Les dejé 5 estrellas." : r.pick(["Done! 5 stars, you guys were great", "Just left you a review 👍", "Happy to, great work!"]));
          }
        }
      }
      if (stage === "lost" && closedAt) {
        m("inbound", closedAt, lang === "es" ? "Gracias, pero vamos a esperar por ahora." : r.pick(["We decided to go with another company, thanks anyway", "Going to hold off for now, thanks", "Found someone cheaper, thank you though"]));
      }

      const ordered = msgs.filter((x) => past(x.at)).sort((a, b) => a.at.localeCompare(b.at));
      out.messages.push(...ordered);
      const lastMessageAt = ordered.at(-1)?.at ?? createdAt;
      const lead: DemoLead = {
        key,
        contactKey: contact.key,
        stage,
        source,
        createdAt,
        firstResponseAt,
        estimateCents: estimateSentAt ? dollars * 100 : null,
        estimateSentAt,
        closedAt,
        unread: stage === "new" || (ordered.at(-1)?.direction === "inbound" && age < 1),
        lastMessageAt,
      };
      out.leads.push(lead);
      if ((stage === "contacted" || stage === "new" || stage === "estimate_sent") && age < 8) recentOpenLeads.push({ lead, contact });
      if (age < 1) out.notifications.push({ kind: "new_lead", body: `New lead (${source === "missed_call" ? "missed call" : "new text"}): ${contact.name ?? contact.phone}`, link: `/inbox`, at: createdAt });
    }
  }

  // --- Lawn/landscaping: recurring customers, a rain delay, a campaign -------
  if (recurring) {
    const offers = RECURRING_OFFERS[industryKey] ?? RECURRING_OFFERS.lawn_care;
    const todayDow = weekdayOf(today);
    const workDays = [1, 2, 3, 4, 5];
    let recN = 0;
    for (let i = 0; i < 26; i++) {
      const c = newContact();
      c.serviceTextsAttested = true;
      if (r.chance(0.6)) c.marketingConsentAt = at(r.int(90, 200), 10);
      const [service, frequency, price] = r.pick(offers);
      // A good crowd on today's list (if today is a workday), the rest spread over the week.
      const serviceDay = i < 7 && workDays.includes(todayDow) ? todayDow : r.pick(workDays);
      const status: DemoRecurring["status"] = i >= 23 ? "canceled" : i === 22 ? "paused" : "active";
      const weeksBack = r.int(8, 40);
      // Line biweekly customers up so the ones due today are really due today.
      const startDate = addDays(today, -(weeksBack * 7) + ((serviceDay - todayDow + 7) % 7) - (frequency === "biweekly" && (weeksBack % 2) ? 7 : 0));
      const rec: DemoRecurring = {
        key: `r${++recN}`,
        contactKey: c.key,
        serviceType: service,
        frequency,
        serviceDay,
        startDate,
        priceCents: price * 100,
        status,
        pausedUntil: status === "paused" ? addDays(today, 21) : null,
        canceledOn: status === "canceled" ? addDays(today, -r.int(3, 40)) : null,
        cancelReason: status === "canceled" ? r.pick(["Price", "Moving", "Doing it themselves"]) : null,
      };
      out.recurring.push(rec);
      if (status !== "active") continue;
      // Visits in the last 4 weeks
      const step = frequency === "weekly" ? 7 : frequency === "biweekly" ? 14 : 28;
      const offset = (todayDow - serviceDay + 7) % 7;
      for (let back = offset === 0 ? step : offset; back <= 28; back += step) {
        const day = addDays(today, -back);
        if (day < startDate) continue;
        out.jobs.push({ key: `j${++jobN}`, contactKey: c.key, leadKey: null, recurringKey: rec.key, description: null, amountCents: null, completedOn: day, completedAt: zonedTimeToUtc(day, r.int(10, 16), 0, TZ).toISOString() });
      }
    }

    // Rain delay last week, moved to the next day
    const lastWeek = addDays(today, -7);
    const dayEn = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const dayEs = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
    const d0 = weekdayOf(lastWeek);
    const rainAt = at(7, 6, 42);
    const rainAudience = out.recurring.filter((x) => x.status === "active" && x.serviceDay === d0).slice(0, 8);
    out.broadcasts.push({
      key: "rain",
      kind: "service_notice",
      name: "Rain delay",
      templateKey: "rain_delay",
      bodyEn: "{business_name}: Rain today, so your {service_day} service is moving to {new_day}. No need to reply. Thanks for understanding!",
      bodyEs: "{business_name}: Hoy llueve, así que su servicio del {service_day} pasa al {new_day}. No necesita responder. ¡Gracias por su comprensión!",
      category: "informational",
      serviceDate: lastWeek,
      newDate: addDays(lastWeek, 1),
      scheduledAt: rainAt,
      recipientCount: rainAudience.length,
    });
    for (const rec of rainAudience) {
      const c = out.contacts.find((x) => x.key === rec.contactKey)!;
      out.messages.push({
        contactKey: c.key,
        leadKey: null,
        direction: "outbound",
        at: rainAt,
        auto: true,
        category: "informational",
        broadcastKey: "rain",
        body:
          c.language === "es"
            ? `${trade.business}: Hoy llueve, así que su servicio del ${dayEs[d0]} pasa al ${dayEs[(d0 + 1) % 7]}. No necesita responder. ¡Gracias por su comprensión!`
            : `${trade.business}: Rain today, so your ${dayEn[d0]} service is moving to ${dayEn[(d0 + 1) % 7]}. No need to reply. Thanks for understanding!`,
      });
      out.scheduled.push({ contactKey: c.key, leadKey: null, broadcastKey: "rain", kind: "broadcast", templateKey: null, category: "informational", sendAt: rainAt, status: "sent", context: { service_date: lastWeek, new_date: addDays(lastWeek, 1) } });
    }

    // A seasonal campaign 10 days ago to customers who agreed to offers; two replies became leads.
    const preset = industry.campaignPresets?.[0];
    if (preset) {
      const sentAt = at(10, 10, 0);
      const audience = out.recurring.filter((x) => x.status !== "canceled").map((x) => out.contacts.find((c) => c.key === x.contactKey)!).filter((c) => c.marketingConsentAt);
      out.broadcasts.push({ key: "campaign", kind: "campaign", name: preset.title, templateKey: `campaign_${preset.key}`, bodyEn: preset.text.en, bodyEs: preset.text.es, category: "marketing", serviceDate: null, newDate: null, scheduledAt: sentAt, recipientCount: audience.length });
      for (const c of audience) {
        out.messages.push({
          contactKey: c.key,
          leadKey: null,
          direction: "outbound",
          at: sentAt,
          auto: true,
          category: "marketing",
          broadcastKey: "campaign",
          body: renderTemplate(c.language === "es" ? preset.text.es : preset.text.en, { business_name: trade.business, first_name: firstName(c), business_phone: null, review_link: null }) + FOOTER[c.language],
        });
        out.scheduled.push({ contactKey: c.key, leadKey: null, broadcastKey: "campaign", kind: "broadcast", templateKey: null, category: "marketing", sendAt: sentAt, status: "sent", context: {} });
      }
      audience.slice(0, 2).forEach((c, i) => {
        const t = plus(sentAt, 90 + i * 400);
        const key = `l${++leadN}`;
        const won = i === 0;
        const dollars = won ? 420 : 360;
        const msgs: DemoMessage[] = [
          { contactKey: c.key, leadKey: key, direction: "inbound", at: t, body: c.language === "es" ? "Sí, me interesa. ¿Cuánto cuesta?" : ["lawn_care", "landscaping"].includes(industryKey) ? "YES! Front beds and around the oak tree please" : "YES! Please get me on the schedule", auto: false, category: null },
          { contactKey: c.key, leadKey: key, direction: "outbound", at: plus(t, 18), body: c.language === "es" ? `¡Hola ${firstName(c)}! Son $${dollars}, instalado.` : `Great ${firstName(c)}! That's $${dollars} installed. We can do it with your next visit.`, auto: false, category: "conversational" },
        ];
        if (won) msgs.push({ contactKey: c.key, leadKey: key, direction: "inbound", at: plus(t, 60 * 20), body: "Perfect, book it", auto: false, category: null });
        out.messages.push(...msgs);
        out.leads.push({ key, contactKey: c.key, stage: won ? "won" : "estimate_sent", source: "campaign", broadcastKey: "campaign", createdAt: t, firstResponseAt: plus(t, 18), estimateCents: dollars * 100, estimateSentAt: plus(t, 18), closedAt: won ? plus(t, 60 * 20) : null, unread: false, lastMessageAt: msgs.at(-1)!.at });
      });
    }
  }

  // --- Booking: services from the industry and a week of visits ------------
  for (const s of industry.services) {
    if (!s.bookingMode || s.bookingMode === "recurring") continue;
    out.services.push({ key: s.key, name: s.name.en, nameEs: s.name.es, mode: s.bookingMode, durationMinutes: s.durationMinutes ?? 60, priceFromCents: s.priceFromCents ?? null, priceToCents: s.priceToCents ?? null });
  }
  const windowService = out.services.find((s) => s.mode === "arrival_window");
  if (windowService) {
    const slots: [number, number][] = [[8, 10], [10, 12], [13, 15]];
    let day = today;
    const toBook = recentOpenLeads.slice(0, 6);
    toBook.forEach(({ lead, contact }, i) => {
      do day = addDays(day, 1);
      while ([0, 6].includes(weekdayOf(day)));
      const [from, to] = slots[i % slots.length];
      out.bookings.push({
        contactKey: contact.key,
        leadKey: lead.key,
        serviceKey: windowService.key,
        mode: "arrival_window",
        status: i === toBook.length - 1 ? "pending_approval" : "confirmed",
        source: i % 3 === 2 ? "customer_link" : "owner",
        startsAt: zonedTimeToUtc(day, from, 0, TZ).toISOString(),
        endsAt: zonedTimeToUtc(day, to, 0, TZ).toISOString(),
        serviceDate: day,
        address: contact.address,
      });
      if (i % 2) day = addDays(day, -1); // two visits on some days
    });
  }

  // --- Licenses & insurance (one expiring soon, to show the alert) ---------
  const suggestions = industry.credentials.slice(0, 2);
  suggestions.forEach((cr, i) =>
    out.credentials.push({ kind: cr.kind, label: cr.label, number: cr.kind === "insurance" ? `GL-${r.int(100000, 999999)}` : `${r.int(10000, 99999)}`, issuer: cr.kind === "insurance" ? "Palmetto Mutual" : "SC LLR", expiresOn: i === 0 ? addDays(today, 300) : addDays(today, 19) }),
  );

  out.smsSentThisMonth = out.messages.filter((x) => x.direction === "outbound" && x.at.slice(0, 7) === nowIso.slice(0, 7)).length;
  return out;
}
