import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { buildDemoScenario, type DemoScenario } from "@/lib/demo/scenario";
import { getIndustry } from "@/lib/industries";
import { defaultTemplatesFor } from "@/lib/templates/defaults";
import type { AdminClient } from "@/lib/supabase/admin";

/**
 * "Try it live" demo businesses. Each visitor gets their OWN private business
 * (so prospects never see each other's clicks), full of realistic history,
 * on a pretend phone number that can never text a real phone. Demo businesses
 * and their logins are deleted after DEMO_TTL_HOURS.
 */
export const DEMO_TTL_HOURS = 24;
export const DEMO_PLAN = "executive";

/** Trades a prospect can pick (the ones businesses can sign up for today). */
export function demoIndustries() {
  return ["lawn_care", "landscaping", "roofing", "hvac", "plumbing", "electrical", "remodeling", "painting", "gutters", "fencing", "tree_service", "handyman"]
    .map((key) => getIndustry(key))
    .filter((i): i is NonNullable<typeof i> => Boolean(i && i.status === "available"));
}

async function must<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>, what: string): Promise<NonNullable<T>> {
  const { data, error } = await p;
  if (error) throw new Error(`demo ${what}: ${error.message}`);
  return data as NonNullable<T>;
}

/** A pretend business number in the 555 area code, which no phone company hands out. */
async function pretendNumber(db: AdminClient): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const e164 = `+1555${String(Math.floor(Math.random() * 9_000_000) + 1_000_000)}`;
    const { count } = await db.from("phone_numbers").select("id", { count: "exact", head: true }).eq("e164", e164);
    if (!count) return e164;
  }
  throw new Error("demo: couldn't find a free pretend number");
}

export type DemoLogin = { email: string; password: string; orgId: string };

/** Creates a demo business for one visitor and returns the login to sign them in with. */
export async function createDemoBusiness(db: AdminClient, industryKey: string, now = new Date()): Promise<DemoLogin> {
  const industry = getIndustry(industryKey);
  if (!industry || !demoIndustries().some((i) => i.key === industryKey)) throw new Error("demo: unknown trade");
  const s = buildDemoScenario(industryKey, now, randomBytes(4).readUInt32BE(0));

  const tag = randomUUID().slice(0, 8);
  const email = `demo-${tag}@demo.example.com`;
  const password = randomBytes(18).toString("base64url");
  const { data: created, error } = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: s.business.ownerName, demo: true } });
  if (error || !created.user) throw new Error(`demo user: ${error?.message}`);
  const userId = created.user.id;

  try {
    const orgId = await loadScenario(db, s, userId, now, tag);
    return { email, password, orgId };
  } catch (e) {
    // Don't leave half a demo behind.
    const { data: m } = await db.from("memberships").select("org_id").eq("user_id", userId);
    for (const row of m ?? []) await db.from("organizations").delete().eq("id", row.org_id);
    await db.auth.admin.deleteUser(userId);
    throw e;
  }
}

async function loadScenario(db: AdminClient, s: DemoScenario, userId: string, now: Date, tag: string): Promise<string> {
  const phone = await pretendNumber(db);
  const org = await must(
    db
      .from("organizations")
      .insert({
        name: s.business.name,
        business_type: s.business.businessType,
        industry: s.business.industry,
        google_review_url: s.business.reviewUrl,
        plan_id: DEMO_PLAN,
        is_demo: true,
        demo_expires_at: new Date(now.getTime() + DEMO_TTL_HOURS * 3_600_000).toISOString(),
        booking_enabled: s.services.length > 0,
        slug: `demo-${tag}`,
        public_profile_enabled: true,
        profile: { about: `${s.business.name} is a family-owned ${getIndustry(s.business.industry)?.label.toLowerCase()} company serving the Charleston area. (This is a demo business.)`, service_area: "Summerville, Goose Creek and Mount Pleasant", show_prices: true },
      })
      .select("id")
      .single(),
    "org",
  );
  const orgId = org.id;
  await must(db.from("memberships").insert({ org_id: orgId, user_id: userId, role: "owner" }), "membership");
  await must(db.from("subscriptions").upsert({ org_id: orgId, status: "manual" }), "subscription");
  await must(db.from("org_modules").upsert({ org_id: orgId, module: "home_services" }, { onConflict: "org_id,module", ignoreDuplicates: true }), "modules");
  await must(db.from("message_templates").insert(defaultTemplatesFor(s.business.businessType, s.business.industry).map((t) => ({ ...t, org_id: orgId }))), "templates");
  await must(db.from("phone_numbers").insert({ org_id: orgId, e164: phone, provider: "simulator" }), "phone");

  // Ids are made here so rows can point at each other without extra lookups.
  const ids = new Map<string, string>();
  const id = (key: string) => {
    if (!ids.has(key)) ids.set(key, randomUUID());
    return ids.get(key)!;
  };
  const opt = (key: string | null | undefined) => (key ? id(key) : null);

  await must(
    db.from("contacts").insert(s.contacts.map((c) => ({ id: id(c.key), org_id: orgId, phone: c.phone, name: c.name, preferred_language: c.language, address: c.address }))),
    "contacts",
  );
  const consent = [
    ...s.contacts.filter((c) => c.marketingConsentAt).map((c) => ({ org_id: orgId, contact_id: id(c.key), kind: "marketing_granted", method: "written_agreement", evidence: "Signed service agreement", created_at: c.marketingConsentAt })),
    ...s.contacts.filter((c) => c.serviceTextsAttested).map((c) => ({ org_id: orgId, contact_id: id(c.key), kind: "service_texts_attested", method: "import_attestation", evidence: "Owner confirmed this customer agreed to texts about their service.", created_at: new Date(now.getTime() - 150 * 86_400_000).toISOString() })),
  ];
  if (consent.length) await must(db.from("consent_events").insert(consent), "consent");
  for (const c of s.contacts.filter((x) => x.marketingConsentAt || x.reviewRequestedAt)) {
    await db.from("contacts").update({ marketing_consent_at: c.marketingConsentAt ?? null, review_requested_at: c.reviewRequestedAt ?? null }).eq("id", id(c.key));
  }

  if (s.broadcasts.length) {
    await must(
      db.from("broadcasts").insert(
        s.broadcasts.map((b) => ({
          id: id(b.key),
          org_id: orgId,
          kind: b.kind,
          name: b.name,
          template_key: b.templateKey,
          body_en: b.bodyEn,
          body_es: b.bodyEs,
          category: b.category,
          service_date: b.serviceDate,
          new_date: b.newDate,
          scheduled_at: b.scheduledAt,
          status: "sent",
          recipient_count: b.recipientCount,
          created_by: userId,
          ...(b.kind === "campaign" ? { audience: { statuses: ["active"], serviceTypes: [] } } : {}),
        })),
      ),
      "broadcasts",
    );
  }

  await must(
    db.from("leads").insert(
      s.leads.map((l) => ({ id: id(l.key), org_id: orgId, contact_id: id(l.contactKey), stage: l.stage, source: l.source, broadcast_id: opt(l.broadcastKey), estimate_amount_cents: l.estimateCents })),
    ),
    "leads",
  );
  for (let i = 0; i < s.messages.length; i += 500) {
    await must(
      db.from("messages").insert(
        s.messages.slice(i, i + 500).map((m) => ({
          org_id: orgId,
          contact_id: id(m.contactKey),
          lead_id: opt(m.leadKey),
          direction: m.direction,
          body: m.body,
          category: m.category,
          sender_type: m.direction === "inbound" ? "contact" : m.auto ? "automation" : "user",
          sent_by: m.direction === "outbound" && !m.auto ? userId : null,
          status: m.direction === "inbound" ? "received" : "delivered",
          broadcast_id: opt(m.broadcastKey),
          created_at: m.at,
        })),
      ),
      "messages",
    );
  }
  // The database stamps lead dates with "now"; set the real history (after the texts, which also touch leads).
  await Promise.all(
    s.leads.map((l) =>
      db
        .from("leads")
        .update({
          created_at: l.createdAt,
          first_response_at: l.firstResponseAt,
          estimate_sent_at: l.estimateSentAt,
          won_at: l.stage === "won" ? l.closedAt : null,
          lost_at: l.stage === "lost" ? l.closedAt : null,
          stage_changed_at: l.closedAt ?? l.estimateSentAt ?? l.createdAt,
          unread: l.unread,
          last_message_at: l.lastMessageAt,
        })
        .eq("id", id(l.key)),
    ),
  );
  if (s.calls.length) {
    await must(db.from("calls").insert(s.calls.map((c) => ({ org_id: orgId, contact_id: id(c.contactKey), lead_id: id(c.leadKey), status: "missed", text_back_sent: c.textBack, created_at: c.at }))), "calls");
  }
  if (s.recurring.length) {
    await must(
      db.from("recurring_services").insert(
        s.recurring.map((r) => ({
          id: id(r.key),
          org_id: orgId,
          contact_id: id(r.contactKey),
          service_type: r.serviceType,
          frequency: r.frequency,
          service_day: r.serviceDay,
          start_date: r.startDate,
          price_cents: r.priceCents,
          status: r.status,
          paused_until: r.pausedUntil,
          canceled_on: r.canceledOn,
          cancel_reason: r.cancelReason,
        })),
      ),
      "recurring",
    );
  }
  if (s.jobs.length) {
    await must(
      db.from("jobs").insert(
        s.jobs.map((j) => ({
          id: id(j.key),
          org_id: orgId,
          contact_id: id(j.contactKey),
          lead_id: opt(j.leadKey),
          recurring_service_id: opt(j.recurringKey),
          description: j.description,
          amount_cents: j.amountCents,
          completed_on: j.completedOn,
          completed_at: j.completedAt,
          created_by: userId,
        })),
      ),
      "jobs",
    );
  }
  if (s.scheduled.length) {
    await must(
      db.from("scheduled_messages").insert(
        s.scheduled.map((m) => ({
          org_id: orgId,
          contact_id: id(m.contactKey),
          lead_id: opt(m.leadKey),
          job_id: opt(m.jobKey),
          broadcast_id: opt(m.broadcastKey),
          kind: m.kind,
          template_key: m.templateKey,
          category: m.category,
          send_at: m.sendAt,
          status: m.status,
          skip_reason: m.skipReason ?? null,
          processed_at: m.status === "pending" ? null : m.sendAt,
          context: m.context as never,
        })),
      ),
      "scheduled",
    );
  }
  if (s.services.length) {
    await must(
      db.from("service_catalog").insert(
        s.services.map((sv, i) => ({
          id: id(`svc:${sv.key}`),
          org_id: orgId,
          key: sv.key,
          name: sv.name,
          name_es: sv.nameEs,
          booking_mode: sv.mode,
          duration_minutes: sv.durationMinutes,
          daily_capacity: sv.mode === "day_capacity" ? 2 : null,
          price_from_cents: sv.priceFromCents,
          price_to_cents: sv.priceToCents,
          sort_order: i,
        })),
      ),
      "services",
    );
  }
  if (s.bookings.length) {
    await must(
      db.from("bookings").insert(
        s.bookings.map((b) => ({
          org_id: orgId,
          contact_id: id(b.contactKey),
          lead_id: opt(b.leadKey),
          service_id: id(`svc:${b.serviceKey}`),
          mode: b.mode,
          status: b.status,
          source: b.source,
          starts_at: b.startsAt,
          ends_at: b.endsAt,
          service_date: b.serviceDate,
          address: b.address,
          created_by: b.source === "owner" ? userId : null,
        })),
      ),
      "bookings",
    );
    const waiting = s.bookings.filter((b) => b.status === "pending_approval");
    if (waiting.length) {
      const { data: rows } = await db.from("bookings").select("id, contact_id, lead_id").eq("org_id", orgId).eq("status", "pending_approval");
      if (rows?.length) await db.from("approval_requests").insert(rows.map((b) => ({ org_id: orgId, booking_id: b.id, lead_id: b.lead_id, contact_id: b.contact_id, reasons: ["New customer"] })));
    }
  }
  if (s.credentials.length) {
    await must(db.from("business_credentials").insert(s.credentials.map((c) => ({ org_id: orgId, kind: c.kind, label: c.label, number: c.number, issuer: c.issuer, expires_on: c.expiresOn }))), "credentials");
  }
  if (s.notifications.length) {
    await db.from("notifications").insert(s.notifications.map((n) => ({ org_id: orgId, kind: n.kind, body: n.body, link: n.link, created_at: n.at })));
  }
  await db.from("usage_counters").upsert({ org_id: orgId, month: `${now.toISOString().slice(0, 8)}01`, sms_sent: s.smsSentThisMonth });
  return orgId;
}

/** Deletes demo businesses (and their logins) whose time is up. Runs with the scheduler. */
export async function deleteExpiredDemos(db: AdminClient, now = new Date(), limit = 20): Promise<number> {
  const { data: orgs } = await db.from("organizations").select("id").eq("is_demo", true).lt("demo_expires_at", now.toISOString()).limit(limit);
  let deleted = 0;
  for (const o of orgs ?? []) {
    const { data: members } = await db.from("memberships").select("user_id").eq("org_id", o.id);
    const { error } = await db.from("organizations").delete().eq("id", o.id).eq("is_demo", true);
    if (error) continue;
    deleted += 1;
    for (const m of members ?? []) {
      // Only demo logins are removed (a real person is never a member of a demo business, but check anyway).
      const { data: u } = await db.auth.admin.getUserById(m.user_id);
      if (u.user?.user_metadata?.demo === true && u.user.email?.endsWith("@demo.example.com")) await db.auth.admin.deleteUser(m.user_id);
    }
  }
  return deleted;
}
