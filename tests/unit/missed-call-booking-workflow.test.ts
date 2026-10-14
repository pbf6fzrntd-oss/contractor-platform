import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Tables } from "@/lib/database.types";
import { handleInboundSms, handleMissedCall, type BusinessLine } from "@/lib/services/inbound";
import { changeLeadStage, replyToLead } from "@/lib/services/lead-actions";
import { runDispatch } from "@/lib/services/outbox";
import { requestPublicBooking, type PublicBusiness } from "@/lib/services/public-booking";
import { decideBooking } from "@/lib/services/approvals";
import { toOrg } from "@/lib/org";
import { workflowDb } from "../fixtures/workflow-db";

const provider = vi.hoisted(() => ({ sendSms: vi.fn() }));
vi.mock("@/lib/messaging/provider", () => ({ getProvider: () => provider, mapTwilioStatus: (status: string) => status }));
const NOW = new Date("2026-10-14T14:00:00Z");
const FIRST_DUE = new Date("2026-10-15T14:00:00Z");
const PHONE = "+18435550142";

function fixture() {
  const org = {
    id: "org", name: "Synthetic Roofing", business_type: "project", default_language: "en", timezone: "America/New_York", plan_id: "pilot", alert_phone: null,
    settings: { followUpDays: [1, 2], businessHoursEnd: 20 }, booking_settings: {}, approval_settings: {}, google_review_url: null,
  } as unknown as Tables<"organizations">;
  const phone = { id: "line", org_id: org.id, e164: "+18435550199", provider: "simulator", messaging_service_sid: null } as Tables<"phone_numbers">;
  const service = { id: "roof-visit", org_id: org.id, name: "Roof inspection", active: true, booking_mode: "arrival_window", duration_minutes: 60, min_notice_hours: 0, required_documents: [], price_from_cents: 5000 };
  const store = workflowDb({
    organizations: [org], phone_numbers: [phone], plans: [{ id: "pilot", monthly_sms_limit: 1000 }], subscriptions: [{ org_id: org.id, status: "active" }], service_catalog: [service],
    message_templates: [
      { key: "missed_call_reply", body: "{business_name}: Sorry we missed your call!", category: "conversational" },
      { key: "estimate_followup_1", body: "{business_name}: Ready to book the estimate?", category: "informational" },
      { key: "estimate_followup_2", body: "{business_name}: Any questions about the estimate?", category: "informational" },
      { key: "opt_out_confirmation", body: "{business_name}: You are unsubscribed.", category: "conversational" },
    ].map(template => ({ ...template, org_id: org.id, language: "en" })),
  });
  const line: BusinessLine = { org, phone };
  return { ...store, line, biz: { org: toOrg(org), profile: { booking_available: true, services: [service] } } as unknown as PublicBusiness };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  vi.stubEnv("SUPABASE_SECRET_KEY", "synthetic-signing-key");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
  provider.sendSms.mockReset().mockImplementation(async () => ({ ok: true, sid: `SIM${randomUUID()}`, status: "delivered" }));
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

async function missedCallAndEstimate(f = fixture()) {
  const call = await handleMissedCall(f.db, f.line, { from: PHONE, callSid: "SIMCA-workflow", now: NOW });
  expect(call.texted).toBe(true);
  expect(await changeLeadStage(f.db, "org", call.leadId, "estimate_sent", 450000)).toBe(true);
  expect(f.rows("scheduled_messages")).toHaveLength(2);
  return { ...f, leadId: call.leadId };
}

describe("missed call → follow-up → approved booking (synthetic service pipeline)", () => {
  it("keeps one contact/lead, sends a due follow-up once, confirms the booking and stops follow-ups after the reply", async () => {
    const f = fixture();
    const call = await handleMissedCall(f.db, f.line, { from: PHONE, callSid: "SIMCA-workflow", now: NOW });
    expect(call.texted).toBe(true);
    expect(provider.sendSms).toHaveBeenCalledTimes(1);
    expect(provider.sendSms.mock.calls[0][0].body).toContain("Reply STOP");
    expect(await handleMissedCall(f.db, f.line, { from: PHONE, callSid: "SIMCA-workflow", now: NOW })).toMatchObject({ texted: false, reason: "already_sent", leadId: call.leadId });
    expect(await replyToLead(f.db, "org", call.leadId, "Your estimate is $4,500.", { type: "user", userId: null }, "reply-workflow")).toMatchObject({ status: "sent" });
    expect(await changeLeadStage(f.db, "org", call.leadId, "estimate_sent", 450000)).toBe(true);
    expect(await runDispatch(f.db, { now: NOW })).toEqual({ sent: 0, skipped: 0, deferred: 0, failed: 0 });
    vi.setSystemTime(FIRST_DUE);
    expect(await runDispatch(f.db, { now: FIRST_DUE })).toEqual({ sent: 1, skipped: 0, deferred: 0, failed: 0 });
    const sends = provider.sendSms.mock.calls.length;
    expect(await runDispatch(f.db, { now: FIRST_DUE })).toEqual({ sent: 0, skipped: 0, deferred: 0, failed: 0 });
    expect(provider.sendSms).toHaveBeenCalledTimes(sends);

    vi.setSystemTime(new Date("2026-10-15T15:00:00Z"));
    await handleInboundSms(f.db, f.line, { from: PHONE, body: "Yes, I'll book Monday.", messageSid: "SIMSM-customer-reply" });
    const booking = await requestPublicBooking(f.db, f.biz, {
      serviceId: "roof-visit", startMs: Date.parse("2026-10-19T14:00:00Z"), name: "Fixture Customer", phone: PHONE,
      language: "en", consentText: "Synthetic fixture consent for booking updates", channel: "customer_link",
    });
    expect(booking).toMatchObject({ ok: true, status: "pending_approval", texted: true });
    expect(f.rows("contacts")).toHaveLength(1);
    expect(f.rows("leads")).toHaveLength(1);
    expect(f.rows("bookings")[0]).toMatchObject({ lead_id: call.leadId, contact_id: f.rows("contacts")[0].id });
    const bookingId = String(f.rows("bookings")[0].id);
    expect(await decideBooking(f.db, f.biz.org, bookingId, "approve", null)).toEqual({ done: true, texted: true });
    expect(f.rows("approval_requests")[0].status).toBe("approved");
    expect(f.rows("scheduled_messages").filter(row => row.kind === "booking_reminder")).toHaveLength(1);
    const afterConfirmation = provider.sendSms.mock.calls.length;
    expect(await decideBooking(f.db, f.biz.org, bookingId, "approve", null)).toEqual({ done: false, texted: false });
    expect(provider.sendSms).toHaveBeenCalledTimes(afterConfirmation);
    expect(await runDispatch(f.db, { now: new Date("2026-10-16T14:00:00Z") })).toEqual({ sent: 0, skipped: 1, deferred: 0, failed: 0 });
    expect(f.rows("scheduled_messages").find(row => row.status === "skipped")?.skip_reason).toBe("customer_replied");
    expect(await runDispatch(f.db, { now: new Date("2026-10-18T21:00:00Z") })).toEqual({ sent: 1, skipped: 0, deferred: 0, failed: 0 });
    expect(provider.sendSms.mock.calls.at(-1)?.[0].body).toContain("Reply C");
  });

  it("does not resend the same missed call after ambiguous delivery and the cooldown expires", async () => {
    const f = fixture();
    provider.sendSms.mockRejectedValueOnce(new Error("Synthetic response lost"));
    expect(await handleMissedCall(f.db, f.line, { from: PHONE, callSid: "SIMCA-ambiguous", now: NOW })).toMatchObject({ texted: false, reason: "delivery_unknown" });
    const later = new Date(NOW.getTime() + 13 * 3_600_000);
    vi.setSystemTime(later);
    expect(await handleMissedCall(f.db, f.line, { from: PHONE, callSid: "SIMCA-ambiguous", now: later })).toMatchObject({ texted: false, reason: "delivery_unknown" });
    expect(provider.sendSms).toHaveBeenCalledOnce();
  });

  it("honors STOP received after scheduling and never sends the follow-ups", async () => {
    const f = await missedCallAndEstimate();
    await handleInboundSms(f.db, f.line, { from: PHONE, body: "STOP", messageSid: "SIMSM-stop" });
    const sends = provider.sendSms.mock.calls.length;
    expect(await runDispatch(f.db, { now: new Date("2026-10-16T14:00:00Z") })).toEqual({ sent: 0, skipped: 2, deferred: 0, failed: 0 });
    expect(provider.sendSms).toHaveBeenCalledTimes(sends);
    expect(f.rows("scheduled_messages").every(row => row.skip_reason === "opted_out")).toBe(true);
  });

  it("records ambiguous provider delivery without resending on the next scheduler tick", async () => {
    const f = await missedCallAndEstimate();
    provider.sendSms.mockRejectedValueOnce(new Error("Synthetic timeout after acceptance"));
    expect(await runDispatch(f.db, { now: FIRST_DUE })).toEqual({ sent: 0, skipped: 0, deferred: 0, failed: 1 });
    expect(f.rows("scheduled_messages").find(row => row.status === "failed")?.skip_reason).toBe("delivery_unknown");
    const sends = provider.sendSms.mock.calls.length;
    await runDispatch(f.db, { now: FIRST_DUE });
    expect(provider.sendSms).toHaveBeenCalledTimes(sends);
  });

  it("fails closed when the reply check cannot be read, while processing the next claimed item", async () => {
    const f = await missedCallAndEstimate();
    f.failNext("messages");
    expect(await runDispatch(f.db, { now: new Date("2026-10-16T14:00:00Z") })).toEqual({ sent: 1, skipped: 0, deferred: 0, failed: 1 });
    expect(provider.sendSms).toHaveBeenCalledTimes(2); // missed-call reply + unaffected second item
    expect(f.rows("scheduled_messages").filter(row => row.status === "failed")).toHaveLength(1);
  });

  it("never reports a sent text when its scheduled receipt cannot be saved", async () => {
    const f = await missedCallAndEstimate();
    f.failNext("scheduled_messages", "update");
    expect(await runDispatch(f.db, { now: FIRST_DUE })).toEqual({ sent: 0, skipped: 0, deferred: 0, failed: 1 });
    expect(f.rows("sms_attempts").at(-1)?.state).toBe("accepted");
    expect(f.rows("scheduled_messages").find(row => row.status === "failed")?.skip_reason).toBe("error");
  });
});
