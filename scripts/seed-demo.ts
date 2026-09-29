/**
 * Loads realistic DEMO data: two businesses with customers, leads, texts,
 * jobs, a campaign and a rain delay, so you can show the app to prospects.
 *
 * ONLY run this against a dev/demo database, never production.
 *
 *   npm run demo:seed
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (from .env.local).
 * Re-running it deletes and recreates the two demo businesses and logins:
 *   lawn care:  dana@lawn.test / password123   (Summerville Lawn Pros)
 *   roofing:    rick@roof.test / password123   (Rick's Roofing)
 * Both businesses use pretend 555 numbers, so nothing is ever really texted.
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../lib/database.types";
import { defaultTemplatesFor } from "../lib/templates/defaults";
import { addDays, localDateString, weekdayOf, zonedTimeToUtc } from "../lib/time";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (e.g. `node --env-file=.env.local ...`).");
  process.exit(1);
}
if (!process.argv.includes("--yes") && !/localhost|127\.0\.0\.1/.test(url)) {
  console.error(`This writes demo data to ${url}. Re-run with --yes if that's your DEV project.`);
  process.exit(1);
}

const db = createClient<Database>(url, key, { auth: { persistSession: false } });
const TZ = "America/New_York";
const now = new Date();
const today = localDateString(now, TZ);

/** A moment N days ago at a local time. */
function at(daysAgo: number, hour: number, minute = 0): string {
  return zonedTimeToUtc(addDays(today, -daysAgo), hour, minute, TZ).toISOString();
}
const minutesAfter = (iso: string, m: number) => new Date(Date.parse(iso) + m * 60_000).toISOString();

async function must<T>(p: PromiseLike<{ data: T; error: unknown }>, what: string): Promise<NonNullable<T>> {
  const { data, error } = await p;
  if (error) throw new Error(`${what}: ${JSON.stringify(error)}`);
  return data as NonNullable<T>;
}

async function resetUser(email: string, fullName: string): Promise<string> {
  const { data: list } = await db.auth.admin.listUsers({ perPage: 1000 });
  const existing = list?.users.find((u) => u.email === email);
  if (existing) {
    const { data: memberships } = await db.from("memberships").select("org_id").eq("user_id", existing.id);
    for (const m of memberships ?? []) await db.from("organizations").delete().eq("id", m.org_id);
    await db.auth.admin.deleteUser(existing.id);
  }
  const { data, error } = await db.auth.admin.createUser({
    email,
    password: "password123",
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error || !data.user) throw new Error(`create user ${email}: ${error?.message}`);
  return data.user.id;
}

async function createBusiness(input: {
  ownerId: string;
  name: string;
  type: "project" | "recurring";
  industry: string;
  phone: string;
  alertPhone: string;
  reviewUrl: string;
}) {
  await db.from("phone_numbers").delete().eq("e164", input.phone);
  const org = await must(
    db
      .from("organizations")
      .insert({
        name: input.name,
        business_type: input.type,
        industry: input.industry,
        alert_phone: input.alertPhone,
        google_review_url: input.reviewUrl,
        plan_id: "pilot",
      })
      .select("*")
      .single(),
    "org",
  );
  await must(db.from("memberships").insert({ org_id: org.id, user_id: input.ownerId, role: "owner" }), "membership");
  await must(db.from("subscriptions").upsert({ org_id: org.id, status: "manual" }), "subscription");
  await must(db.from("org_modules").insert({ org_id: org.id, module: "home_services" }), "modules");
  await must(
    db.from("message_templates").insert(defaultTemplatesFor(input.type, input.industry).map((t) => ({ ...t, org_id: org.id }))),
    "templates",
  );
  await must(
    db.from("phone_numbers").insert({ org_id: org.id, e164: input.phone, provider: "simulator", forward_to: input.alertPhone }),
    "phone",
  );
  return org;
}

type Msg = { dir: "in" | "out"; at: string; body: string; auto?: boolean; category?: "conversational" | "informational" | "marketing"; broadcastId?: string };

function helpers(orgId: string) {
  let n = 0;
  const sid = (prefix: string) => `${prefix}DEMO${orgId.slice(0, 8)}${String(++n).padStart(5, "0")}`;

  async function contact(c: {
    phone: string;
    name: string | null;
    language?: "en" | "es";
    address?: string;
    marketing?: string;
    reviewRequestedAt?: string;
  }) {
    const row = await must(
      db
        .from("contacts")
        .insert({
          org_id: orgId,
          phone: c.phone,
          name: c.name,
          preferred_language: c.language ?? "en",
          address: c.address ?? null,
        })
        .select("*")
        .single(),
      "contact",
    );
    const updates: { marketing_consent_at?: string; review_requested_at?: string } = {};
    if (c.marketing) {
      await db.from("consent_events").insert({
        org_id: orgId,
        contact_id: row.id,
        kind: "marketing_granted",
        method: "written_agreement",
        evidence: "Signed service agreement",
        created_at: c.marketing,
      });
      updates.marketing_consent_at = c.marketing;
    }
    if (c.reviewRequestedAt) updates.review_requested_at = c.reviewRequestedAt;
    if (Object.keys(updates).length) await db.from("contacts").update(updates).eq("id", row.id);
    return row;
  }

  async function lead(l: {
    contactId: string;
    stage: "new" | "contacted" | "estimate_sent" | "won" | "lost";
    source: "missed_call" | "inbound_text" | "campaign" | "manual";
    createdAt: string;
    firstResponseAt?: string;
    estimateCents?: number;
    estimateSentAt?: string;
    closedAt?: string;
    unread?: boolean;
    lastMessageAt?: string;
    broadcastId?: string;
    notes?: string;
  }) {
    const row = await must(
      db
        .from("leads")
        .insert({
          org_id: orgId,
          contact_id: l.contactId,
          stage: l.stage,
          source: l.source,
          broadcast_id: l.broadcastId ?? null,
          estimate_amount_cents: l.estimateCents ?? null,
          notes: l.notes ?? null,
        })
        .select("*")
        .single(),
      "lead",
    );
    // The database stamps stage dates with "now"; backdate them for realistic history.
    await db
      .from("leads")
      .update({
        created_at: l.createdAt,
        first_response_at: l.firstResponseAt ?? null,
        estimate_sent_at: l.estimateSentAt ?? null,
        won_at: l.stage === "won" ? (l.closedAt ?? l.createdAt) : null,
        lost_at: l.stage === "lost" ? (l.closedAt ?? l.createdAt) : null,
        stage_changed_at: l.closedAt ?? l.estimateSentAt ?? l.createdAt,
        unread: l.unread ?? false,
        last_message_at: l.lastMessageAt ?? l.createdAt,
      })
      .eq("id", row.id);
    return row;
  }

  async function thread(contactId: string, leadId: string | null, msgs: Msg[]) {
    if (!msgs.length) return;
    await must(
      db.from("messages").insert(
        msgs.map((m) => ({
          org_id: orgId,
          contact_id: contactId,
          lead_id: leadId,
          direction: m.dir === "in" ? "inbound" : "outbound",
          body: m.body,
          category: m.dir === "in" ? null : (m.category ?? "conversational"),
          sender_type: m.dir === "in" ? "contact" : m.auto ? "automation" : "user",
          provider_sid: sid("SM"),
          status: m.dir === "in" ? "received" : "delivered",
          broadcast_id: m.broadcastId ?? null,
          created_at: m.at,
        })),
      ),
      "messages",
    );
  }

  async function missedCall(contactId: string, leadId: string, when: string, textBack = true) {
    await must(
      db.from("calls").insert({
        org_id: orgId,
        contact_id: contactId,
        lead_id: leadId,
        provider_sid: sid("CA"),
        status: "missed",
        text_back_sent: textBack,
        created_at: when,
      }),
      "call",
    );
  }

  return { contact, lead, thread, missedCall };
}

const FOOTER = "\nReply STOP to opt out.";

// ---------------------------------------------------------------------------
// Rick's Roofing (project-based trade)
// ---------------------------------------------------------------------------
async function seedRoofing() {
  const ownerId = await resetUser("rick@roof.test", "Rick Alvarez");
  const org = await createBusiness({
    ownerId,
    name: "Rick's Roofing",
    type: "project",
    industry: "roofing",
    phone: "+18435550200",
    alertPhone: "+18435557777",
    reviewUrl: "https://g.page/r/ricks-roofing/review",
  });
  const h = helpers(org.id);
  const missedReply = (name = "Rick's Roofing") =>
    `Sorry we missed your call! This is ${name}. We're probably on a job site. What can we help you with? Reply here and we'll get right back to you.`;

  // 1. Brand-new missed call, 20 minutes ago, customer replied: unread
  {
    const c = await h.contact({ phone: "+18435550311", name: null });
    const t = minutesAfter(now.toISOString(), -22);
    const l = await h.lead({ contactId: c.id, stage: "new", source: "missed_call", createdAt: t, unread: true, lastMessageAt: minutesAfter(t, 4) });
    await h.missedCall(c.id, l.id, t);
    await h.thread(c.id, l.id, [
      { dir: "out", at: minutesAfter(t, 0.2), body: missedReply() + FOOTER, auto: true },
      { dir: "in", at: minutesAfter(t, 4), body: "Hi, we had a storm come through Friday and there's shingles in the yard. Can someone come look this week?" },
    ]);
  }
  // 2. New text lead this morning
  {
    const c = await h.contact({ phone: "+18435550312", name: "Karen Whitfield", address: "118 Tupelo Ln, Summerville" });
    const t = at(0, 8, 12);
    const l = await h.lead({ contactId: c.id, stage: "new", source: "inbound_text", createdAt: t, unread: true });
    await h.thread(c.id, l.id, [{ dir: "in", at: t, body: "Do you do gutter guards too or just roofs?" }]);
  }
  // 3. Contacted, inspection booked
  {
    const c = await h.contact({ phone: "+18435550313", name: "Marcus Green", address: "44 Oak Forest Dr, Goose Creek" });
    const t = at(2, 13, 5);
    const l = await h.lead({ contactId: c.id, stage: "contacted", source: "missed_call", createdAt: t, firstResponseAt: minutesAfter(t, 9), lastMessageAt: minutesAfter(t, 40) });
    await h.missedCall(c.id, l.id, t);
    await h.thread(c.id, l.id, [
      { dir: "out", at: minutesAfter(t, 0.2), body: missedReply() + FOOTER, auto: true },
      { dir: "in", at: minutesAfter(t, 3), body: "Leak over the back bedroom when it rains hard" },
      { dir: "out", at: minutesAfter(t, 9), body: "Sorry to hear that Marcus. I can come take a look Thursday around 10. Does that work?" },
      { dir: "in", at: minutesAfter(t, 40), body: "Thursday at 10 works, thanks!" },
    ]);
  }
  // 4. Estimate sent 1 day ago -> follow-ups scheduled
  {
    const c = await h.contact({ phone: "+18435550314", name: "Jennifer Moss", address: "9 Carriage Ln, Summerville" });
    const created = at(4, 9, 30);
    const sent = at(1, 16, 20);
    const l = await h.lead({ contactId: c.id, stage: "estimate_sent", source: "inbound_text", createdAt: created, firstResponseAt: minutesAfter(created, 14), estimateCents: 1_240_000, estimateSentAt: sent, lastMessageAt: sent });
    await h.thread(c.id, l.id, [
      { dir: "in", at: created, body: "Looking for a quote on a full roof replacement, house is about 2,200 sq ft" },
      { dir: "out", at: minutesAfter(created, 14), body: "Happy to help Jennifer! I can measure Monday afternoon." + FOOTER },
      { dir: "out", at: sent, body: "Hi Jennifer, your estimate for the architectural shingle replacement is in your email. $12,400 including tear-off and new drip edge." },
    ]);
    for (const [step, days] of [[1, 2], [2, 5], [3, 10]] as const) {
      await db.from("scheduled_messages").insert({
        org_id: org.id,
        contact_id: c.id,
        lead_id: l.id,
        kind: "estimate_followup",
        template_key: `estimate_followup_${step}`,
        category: "informational",
        send_at: zonedTimeToUtc(addDays(localDateString(new Date(sent), TZ), days), 10, 0, TZ).toISOString(),
        context: { estimate_sent_at: sent, step },
      });
    }
  }
  // 5. Estimate sent 6 days ago: first follow-up already went out, customer replied
  {
    const c = await h.contact({ phone: "+18435550315", name: "Tom Brennan", address: "301 Main St, Summerville" });
    const created = at(9, 11, 0);
    const sent = at(6, 15, 0);
    const l = await h.lead({ contactId: c.id, stage: "estimate_sent", source: "missed_call", createdAt: created, firstResponseAt: minutesAfter(created, 25), estimateCents: 385_000, estimateSentAt: sent, lastMessageAt: at(3, 18, 5) });
    await h.missedCall(c.id, l.id, created);
    const fu1 = at(4, 10, 0);
    await h.thread(c.id, l.id, [
      { dir: "out", at: minutesAfter(created, 0.2), body: missedReply() + FOOTER, auto: true },
      { dir: "in", at: minutesAfter(created, 20), body: "Need a few shingles replaced and a boot around the vent pipe" },
      { dir: "out", at: minutesAfter(created, 25), body: "Got it Tom, I'll swing by tomorrow afternoon to look." },
      { dir: "out", at: sent, body: "Estimate for the repair is $3,850. Let me know if you have questions!" },
      { dir: "out", at: fu1, body: "Hi Tom, it's Rick's Roofing. Just checking that you got our estimate. Any questions we can answer?", auto: true, category: "informational" },
      { dir: "in", at: at(3, 18, 5), body: "Got it, talking it over with my wife this weekend" },
    ]);
    await db.from("scheduled_messages").insert([
      { org_id: org.id, contact_id: c.id, lead_id: l.id, kind: "estimate_followup", template_key: "estimate_followup_1", category: "informational", send_at: fu1, status: "sent", processed_at: fu1, context: { estimate_sent_at: sent, step: 1 } },
      { org_id: org.id, contact_id: c.id, lead_id: l.id, kind: "estimate_followup", template_key: "estimate_followup_2", category: "informational", send_at: at(1, 10, 0), status: "skipped", skip_reason: "customer_replied", processed_at: at(1, 10, 0), context: { estimate_sent_at: sent, step: 2 } },
      { org_id: org.id, contact_id: c.id, lead_id: l.id, kind: "estimate_followup", template_key: "estimate_followup_3", category: "informational", send_at: at(-4, 10, 0), status: "pending", context: { estimate_sent_at: sent, step: 3 } },
    ]);
  }
  // 6-8. Won jobs with review requests
  const wins: [string, string, number, number, string][] = [
    ["+18435550316", "Linda Park", 11, 890_000, "Full replacement"],
    ["+18435550317", "David Chen", 13, 145_000, "Leak repair"],
    ["+18435550318", "Angela Ruiz", 8, 620_000, "Storm damage repair"],
  ];
  for (const [phone, name, ago, cents, desc] of wins) {
    const created = at(ago, 10, 15);
    const wonAt = at(ago - 3, 14, 0);
    const reviewAt = at(ago - 5, 11, 0);
    const c = await h.contact({ phone, name, reviewRequestedAt: reviewAt });
    const l = await h.lead({ contactId: c.id, stage: "won", source: ago % 2 ? "missed_call" : "inbound_text", createdAt: created, firstResponseAt: minutesAfter(created, 12 + ago), estimateCents: cents, estimateSentAt: at(ago - 1, 16, 0), closedAt: wonAt, lastMessageAt: reviewAt });
    const job = await must(db.from("jobs").insert({ org_id: org.id, contact_id: c.id, lead_id: l.id, description: desc, amount_cents: cents, completed_on: addDays(today, -(ago - 5)), completed_at: at(ago - 5, 9, 0), created_by: ownerId }).select("id").single(), "job");
    await h.thread(c.id, l.id, [
      { dir: "in", at: created, body: "Hi, looking for someone to look at my roof" },
      { dir: "out", at: minutesAfter(created, 12 + ago), body: `Hi ${name.split(" ")[0]}, Rick here. Happy to come take a look.` + FOOTER },
      { dir: "in", at: wonAt, body: "Let's go ahead with it. When can you start?" },
      { dir: "out", at: reviewAt, body: `Thanks for choosing Rick's Roofing, ${name.split(" ")[0]}! If you were happy with our work, would you leave us a quick Google review? It really helps a local business: https://g.page/r/ricks-roofing/review`, auto: true, category: "informational" },
    ]);
    await db.from("scheduled_messages").insert({ org_id: org.id, contact_id: c.id, lead_id: l.id, job_id: job.id, kind: "review_request", template_key: "review_request", category: "informational", send_at: reviewAt, status: "sent", processed_at: reviewAt });
  }
  // 9. Lost
  {
    const c = await h.contact({ phone: "+18435550319", name: "Greg Holt" });
    const created = at(12, 9, 0);
    const l = await h.lead({ contactId: c.id, stage: "lost", source: "inbound_text", createdAt: created, firstResponseAt: minutesAfter(created, 45), estimateCents: 1_050_000, estimateSentAt: at(10, 15, 0), closedAt: at(4, 12, 0) });
    await h.thread(c.id, l.id, [
      { dir: "in", at: created, body: "Quote for a metal roof?" },
      { dir: "out", at: minutesAfter(created, 45), body: "Sure Greg, I can come measure Wednesday." + FOOTER },
      { dir: "in", at: at(4, 12, 0), body: "We decided to go with another company, thanks anyway" },
    ]);
  }
  // Missed call last week that got a text back (for the dashboard)
  {
    const c = await h.contact({ phone: "+18435550320", name: "Supplier – ABC Supply" });
    await db.from("contacts").update({ do_not_autotext: true }).eq("id", c.id);
  }
  await db.from("usage_counters").upsert({ org_id: org.id, month: `${today.slice(0, 8)}01`, sms_sent: 64 });
  await db.from("notifications").insert([
    { org_id: org.id, kind: "new_lead", body: "New lead (missed call): (843) 555-0311", link: "/inbox", created_at: minutesAfter(now.toISOString(), -22) },
    { org_id: org.id, kind: "new_lead", body: "New lead (new text): Karen Whitfield (843) 555-0312", link: "/inbox", created_at: at(0, 8, 12) },
  ]);
  return org;
}

// ---------------------------------------------------------------------------
// Summerville Lawn Pros (recurring service)
// ---------------------------------------------------------------------------
async function seedLawn() {
  const ownerId = await resetUser("dana@lawn.test", "Dana Brooks");
  const org = await createBusiness({
    ownerId,
    name: "Summerville Lawn Pros",
    type: "recurring",
    industry: "lawn_care",
    phone: "+18435550100",
    alertPhone: "+18435558888",
    reviewUrl: "https://g.page/r/summerville-lawn-pros/review",
  });
  const h = helpers(org.id);
  const todayDow = weekdayOf(today);
  const sameDayLastWeek = addDays(today, -7);

  // Customers: [name, phone, lang, address, service, frequency, dayOffsetFromToday, price, marketing?, status]
  type C = [string, string, "en" | "es", string, string, "weekly" | "biweekly" | "every_4_weeks", number, number, boolean, "active" | "paused" | "canceled"];
  const customers: C[] = [
    ["Tom Heyward", "+18435552001", "en", "12 Azalea Ct", "Mow, edge & blow", "weekly", 0, 45, true, "active"],
    ["María González", "+18435552002", "es", "208 Palmetto Blvd", "Full service", "weekly", 0, 65, true, "active"],
    ["Bill Rhodes", "+18435552003", "en", "77 Old Trolley Rd", "Mowing", "biweekly", 0, 40, false, "active"],
    ["Rosa Martínez", "+18435552004", "es", "15 Cypress Way", "Mow, edge & blow", "weekly", 0, 45, true, "active"],
    ["Pat O'Neill", "+18435552005", "en", "403 Main St", "Full service", "weekly", 0, 70, false, "active"],
    ["Keisha Williams", "+18435552006", "en", "9 Magnolia Dr", "Mow, edge & blow", "weekly", 1, 45, true, "active"],
    ["Jim Barton", "+18435552007", "en", "56 Live Oak Ln", "Mowing", "weekly", 1, 40, false, "active"],
    ["Luis Hernández", "+18435552008", "es", "31 Sweetgrass Cir", "Full service", "biweekly", 2, 65, true, "active"],
    ["Carol Simmons", "+18435552009", "en", "120 Berlin G Myers Pkwy", "Shrub trimming", "every_4_weeks", 3, 85, false, "active"],
    ["Wanda Pierce", "+18435552010", "en", "88 Dorchester Rd", "Mowing", "weekly", 1, 40, false, "paused"],
    ["Frank Tate", "+18435552011", "en", "5 Wisteria Way", "Mowing", "weekly", 2, 40, true, "canceled"],
    ["Hector Díaz", "+18435552012", "es", "240 Central Ave", "Mow, edge & blow", "biweekly", 3, 45, false, "canceled"],
  ];

  const contacts: Record<string, { id: string; serviceId: string }> = {};
  for (const [name, phone, lang, address, service, frequency, offset, price, marketing, status] of customers) {
    const c = await h.contact({
      phone,
      name,
      language: lang,
      address: `${address}, Summerville`,
      marketing: marketing ? at(120, 10) : undefined,
      reviewRequestedAt: ["Tom Heyward", "Rosa Martínez", "Keisha Williams"].includes(name) ? at(40, 11) : undefined,
    });
    await db.from("consent_events").insert({ org_id: org.id, contact_id: c.id, kind: "service_texts_attested", method: "import_attestation", evidence: "Owner confirmed this customer agreed to texts about their service.", created_at: at(130, 9) });
    const serviceDay = (todayDow + offset) % 7;
    // Biweekly customers who are due today started an even number of weeks ago.
    const start = addDays(today, -(frequency === "biweekly" && offset === 0 ? 70 : 84) + offset);
    const svc = await must(
      db
        .from("recurring_services")
        .insert({
          org_id: org.id,
          contact_id: c.id,
          service_type: service,
          frequency,
          service_day: serviceDay,
          start_date: name === "Keisha Williams" ? addDays(today, -13) : start,
          price_cents: price * 100,
          status,
          paused_until: status === "paused" ? addDays(today, 21) : null,
          canceled_on: status === "canceled" ? (name === "Frank Tate" ? addDays(today, -9) : addDays(today, -75)) : null,
          cancel_reason: status === "canceled" ? (name === "Frank Tate" ? "Price" : "Moving") : null,
        })
        .select("id")
        .single(),
      "service",
    );
    contacts[name] = { id: c.id, serviceId: svc.id };
  }

  // Past visits (last 3 weeks) for active customers
  for (const [name, , , , , frequency, offset, , , status] of customers) {
    if (status !== "active") continue;
    const step = frequency === "weekly" ? 7 : frequency === "biweekly" ? 14 : 28;
    for (let back = step - offset; back <= 28; back += step) {
      await db.from("jobs").insert({
        org_id: org.id,
        contact_id: contacts[name].id,
        recurring_service_id: contacts[name].serviceId,
        completed_on: addDays(today, -back),
        completed_at: at(back, 15),
        created_by: ownerId,
      });
    }
  }

  // Rain delay last week (same weekday), moved to the next day
  const rain = await must(
    db
      .from("broadcasts")
      .insert({
        org_id: org.id,
        kind: "service_notice",
        name: "Rain delay",
        template_key: "rain_delay",
        body_en: "{business_name}: Rain today, so your {service_day} service is moving to {new_day}. No need to reply. Thanks for understanding!",
        body_es: "{business_name}: Hoy llueve, así que su servicio del {service_day} pasa al {new_day}. No necesita responder. ¡Gracias por su comprensión!",
        category: "informational",
        service_date: sameDayLastWeek,
        new_date: addDays(sameDayLastWeek, 1),
        scheduled_at: at(7, 6, 42),
        status: "sent",
        recipient_count: 5,
        created_by: ownerId,
      })
      .select("id")
      .single(),
    "rain broadcast",
  );
  const dayEn = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const dayEs = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const d0 = weekdayOf(sameDayLastWeek);
  for (const name of ["Tom Heyward", "María González", "Rosa Martínez", "Pat O'Neill", "Bill Rhodes"]) {
    const es = ["María González", "Rosa Martínez"].includes(name);
    await h.thread(contacts[name].id, null, [
      {
        dir: "out",
        at: at(7, 6, 42),
        auto: true,
        category: "informational",
        broadcastId: rain.id,
        body: es
          ? `Summerville Lawn Pros: Hoy llueve, así que su servicio del ${dayEs[d0]} pasa al ${dayEs[(d0 + 1) % 7]}. No necesita responder. ¡Gracias por su comprensión!`
          : `Summerville Lawn Pros: Rain today, so your ${dayEn[d0]} service is moving to ${dayEn[(d0 + 1) % 7]}. No need to reply. Thanks for understanding!`,
      },
    ]);
  }
  await db.from("scheduled_messages").insert(
    ["Tom Heyward", "María González", "Rosa Martínez", "Pat O'Neill", "Bill Rhodes"].map((name) => ({
      org_id: org.id,
      contact_id: contacts[name].id,
      broadcast_id: rain.id,
      kind: "broadcast",
      category: "informational",
      send_at: at(7, 6, 42),
      status: "sent",
      processed_at: at(7, 6, 43),
    })),
  );

  // Pine straw campaign 5 days ago to customers with marketing consent
  const campaign = await must(
    db
      .from("broadcasts")
      .insert({
        org_id: org.id,
        kind: "campaign",
        name: "Pine straw: fall refresh",
        template_key: "campaign_pine_straw",
        body_en: "Hi {first_name}, {business_name} here. Time to refresh your pine straw! We're booking installs now. Reply YES for a free quote.",
        body_es: "Hola {first_name}, le escribe {business_name}. ¡Es hora de renovar la paja de pino! Estamos programando instalaciones. Responda SÍ para un presupuesto gratis.",
        category: "marketing",
        audience: { statuses: ["active", "past"], serviceTypes: [] },
        scheduled_at: at(5, 10, 0),
        status: "scheduled",
        recipient_count: 6,
        excluded: { opted_out: 0, no_marketing_consent: 6 },
        created_by: ownerId,
      })
      .select("id")
      .single(),
    "campaign",
  );
  const consented = customers.filter((c) => c[8]).map((c) => c[0]);
  for (const name of consented) {
    const es = customers.find((c) => c[0] === name)![2] === "es";
    const first = name.split(" ")[0];
    await h.thread(contacts[name].id, null, [
      {
        dir: "out",
        at: at(5, 10, 0),
        auto: true,
        category: "marketing",
        broadcastId: campaign.id,
        body: es
          ? `Hola ${first}, le escribe Summerville Lawn Pros. ¡Es hora de renovar la paja de pino! Estamos programando instalaciones. Responda SÍ para un presupuesto gratis.\nResponda STOP para no recibir más mensajes.`
          : `Hi ${first}, Summerville Lawn Pros here. Time to refresh your pine straw! We're booking installs now. Reply YES for a free quote.${FOOTER}`,
      },
    ]);
    await db.from("scheduled_messages").insert({ org_id: org.id, contact_id: contacts[name].id, broadcast_id: campaign.id, kind: "broadcast", category: "marketing", send_at: at(5, 10, 0), status: "sent", processed_at: at(5, 10, 1) });
  }
  // Two replies became leads; one won
  {
    const k = contacts["Keisha Williams"];
    const t = at(5, 12, 30);
    const l = await h.lead({ contactId: k.id, stage: "won", source: "campaign", broadcastId: campaign.id, createdAt: t, firstResponseAt: minutesAfter(t, 18), estimateCents: 42_000, estimateSentAt: minutesAfter(t, 18), closedAt: at(4, 9, 0), lastMessageAt: at(4, 9, 0) });
    await h.thread(k.id, l.id, [
      { dir: "in", at: t, body: "YES! Front beds and around the oak tree please" },
      { dir: "out", at: minutesAfter(t, 18), body: "Great Keisha! For front beds + the oak ring it's $420 for about 30 bales. We can do it Thursday with your mow." },
      { dir: "in", at: at(4, 9, 0), body: "Perfect, book it" },
    ]);
  }
  {
    const l2 = contacts["Luis Hernández"];
    const t = at(4, 17, 45);
    const l = await h.lead({ contactId: l2.id, stage: "estimate_sent", source: "campaign", broadcastId: campaign.id, createdAt: t, firstResponseAt: minutesAfter(t, 35), estimateCents: 36_000, estimateSentAt: at(3, 9, 15), lastMessageAt: at(3, 9, 15) });
    await h.thread(l2.id, l.id, [
      { dir: "in", at: t, body: "Sí, me interesa. ¿Cuánto cuesta para el patio de atrás?" },
      { dir: "out", at: minutesAfter(t, 35), body: "¡Hola Luis! Paso mañana a medir y le mando el precio." },
      { dir: "out", at: at(3, 9, 15), body: "Luis, para el patio de atrás son $360 (unas 25 pacas), instalado." },
    ]);
    await db.from("scheduled_messages").insert({ org_id: org.id, contact_id: l2.id, lead_id: l.id, kind: "estimate_followup", template_key: "estimate_followup_2", category: "informational", send_at: zonedTimeToUtc(addDays(today, 2), 10, 0, TZ).toISOString(), context: { estimate_sent_at: at(3, 9, 15), step: 2 } });
  }
  // New lead: missed call this morning from a prospect wanting weekly service
  {
    const c = await h.contact({ phone: "+18435552101", name: null });
    const t = at(0, 7, 48);
    const l = await h.lead({ contactId: c.id, stage: "new", source: "missed_call", createdAt: t, unread: true, lastMessageAt: minutesAfter(t, 6) });
    await h.missedCall(c.id, l.id, t);
    await h.thread(c.id, l.id, [
      { dir: "out", at: minutesAfter(t, 0.2), body: "Sorry we missed your call! This is Summerville Lawn Pros. Our crew is out in the field. What can we help you with? Reply here and we'll get right back to you." + FOOTER, auto: true },
      { dir: "in", at: minutesAfter(t, 6), body: "Hi! Just moved to Cane Bay, looking for weekly mowing. Corner lot, maybe 1/3 acre. How much?" },
    ]);
  }
  // Existing customer texting about a gate
  {
    const pat = contacts["Pat O'Neill"];
    const t = at(0, 9, 5);
    const l = await h.lead({ contactId: pat.id, stage: "contacted", source: "inbound_text", createdAt: t, firstResponseAt: minutesAfter(t, 7), lastMessageAt: minutesAfter(t, 7) });
    await h.thread(pat.id, l.id, [
      { dir: "in", at: t, body: "Heads up, the back gate code changed to 4471" },
      { dir: "out", at: minutesAfter(t, 7), body: "Thanks Pat, got it. Crew will be there this afternoon." },
    ]);
  }
  await db.from("usage_counters").upsert({ org_id: org.id, month: `${today.slice(0, 8)}01`, sms_sent: 187 });
  await db.from("notifications").insert({ org_id: org.id, kind: "new_lead", body: "New lead (missed call): (843) 555-2101", link: "/inbox", created_at: at(0, 7, 48) });
  return org;
}

async function main() {
  const roof = await seedRoofing();
  const lawn = await seedLawn();
  console.log(`Demo data ready.
  Lawn care: dana@lawn.test / password123  (${lawn.name})
  Roofing:   rick@roof.test / password123  (${roof.name})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
