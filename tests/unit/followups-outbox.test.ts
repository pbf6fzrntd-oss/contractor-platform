import { describe, expect, it } from "vitest";
import { followUpTemplateKey, planFollowUps } from "@/lib/automation/followups";
import { evaluateScheduledMessage, type OutboxItem, type OutboxState } from "@/lib/automation/outbox";
import { smsSegments } from "@/lib/automation/segments";
import { DEFAULT_SETTINGS, parseSettings } from "@/lib/settings";

const NY = "America/New_York";
const iso = (d: Date) => d.toISOString();

describe("estimate follow-up timing", () => {
  it("defaults to days 2, 5 and 10 at 10am Charleston time", () => {
    // Estimate sent Tuesday Sep 29, 2026 at 4:15pm local.
    const plan = planFollowUps(new Date("2026-09-29T20:15:00Z"), DEFAULT_SETTINGS, NY);
    expect(plan.map((p) => iso(p.sendAt))).toEqual([
      "2026-10-01T14:00:00.000Z", // Thu Oct 1, 10am EDT
      "2026-10-04T14:00:00.000Z", // Sun Oct 4
      "2026-10-09T14:00:00.000Z", // Fri Oct 9
    ]);
    expect(plan.map((p) => p.templateKey)).toEqual(["estimate_followup_1", "estimate_followup_2", "estimate_followup_3"]);
  });

  it("uses the local date, even when the estimate went out late at night", () => {
    // 11:30pm Sep 29 local = 03:30 UTC Sep 30. Day 2 is still Oct 1 local.
    const plan = planFollowUps(new Date("2026-09-30T03:30:00Z"), DEFAULT_SETTINGS, NY);
    expect(iso(plan[0].sendAt)).toBe("2026-10-01T14:00:00.000Z");
  });

  it("keeps 10am local across the daylight-saving change", () => {
    const plan = planFollowUps(new Date("2026-10-30T15:00:00Z"), parseSettings({ followUpDays: [5] }), NY);
    expect(iso(plan[0].sendAt)).toBe("2026-11-04T15:00:00.000Z"); // 10am EST
  });

  it("uses custom days and hour, and reuses the last template for extra steps", () => {
    const settings = parseSettings({ followUpDays: [1, 3, 7, 14, 30], followUpHour: 17 });
    const plan = planFollowUps(new Date("2026-09-29T15:00:00Z"), settings, NY);
    expect(plan).toHaveLength(5);
    expect(iso(plan[0].sendAt)).toBe("2026-09-30T21:00:00.000Z"); // 5pm EDT
    expect(plan[4].templateKey).toBe("estimate_followup_3");
    expect(followUpTemplateKey(1)).toBe("estimate_followup_1");
  });

  it("never schedules outside business hours", () => {
    const settings = parseSettings({ followUpHour: 8, businessHoursStart: 10 });
    const plan = planFollowUps(new Date("2026-09-29T15:00:00Z"), settings, NY);
    expect(iso(plan[0].sendAt)).toBe("2026-10-01T14:00:00.000Z"); // pushed from 8am to 10am
  });

  it("schedules nothing when follow-ups are turned off", () => {
    expect(planFollowUps(new Date(), parseSettings({ followUpsEnabled: false }), NY)).toEqual([]);
  });
});

describe("last check before a scheduled text goes out", () => {
  const sentAt = "2026-09-29T20:15:00.000Z";
  const noon = new Date("2026-10-01T16:00:00Z"); // noon local
  const followUp: OutboxItem = { kind: "estimate_followup", category: "informational", context: { estimate_sent_at: sentAt } };
  const state: OutboxState = {
    now: noon,
    timezone: NY,
    settings: DEFAULT_SETTINGS,
    contact: { opted_out_at: null, marketing_consent_at: null, do_not_autotext: false, review_requested_at: null },
    lead: { stage: "estimate_sent", estimate_sent_at: sentAt },
    lastInboundAt: null,
    hasReviewLink: true,
    broadcastStatus: null,
  };
  const withContact = (c: Partial<NonNullable<OutboxState["contact"]>>) => ({ ...state, contact: { ...state.contact!, ...c } });

  it("sends a follow-up when nothing changed", () => {
    expect(evaluateScheduledMessage(followUp, state)).toEqual({ action: "send" });
  });

  it.each([
    ["the lead was won", { ...state, lead: { stage: "won", estimate_sent_at: sentAt } }, "stage_changed"],
    ["the lead was lost", { ...state, lead: { stage: "lost", estimate_sent_at: sentAt } }, "stage_changed"],
    ["the lead was deleted", { ...state, lead: null }, "lead_missing"],
    ["a new estimate was sent", { ...state, lead: { stage: "estimate_sent", estimate_sent_at: "2026-09-30T12:00:00.000Z" } }, "estimate_resent"],
    ["the customer replied", { ...state, lastInboundAt: "2026-09-30T13:00:00.000Z" }, "customer_replied"],
    ["the customer opted out", withContact({ opted_out_at: "2026-09-30T00:00:00Z" }), "opted_out"],
    ["the contact is do-not-autotext", withContact({ do_not_autotext: true }), "do_not_autotext"],
    ["follow-ups were turned off", { ...state, settings: parseSettings({ followUpsEnabled: false }) }, "followups_disabled"],
  ])("skips the follow-up when %s", (_label, s, reason) => {
    expect(evaluateScheduledMessage(followUp, s as OutboxState)).toEqual({ action: "skip", reason });
  });

  it("ignores replies from before the estimate was sent", () => {
    expect(evaluateScheduledMessage(followUp, { ...state, lastInboundAt: "2026-09-28T13:00:00.000Z" }).action).toBe("send");
  });

  it("keeps following up after a reply if the owner turned that off", () => {
    const s = { ...state, lastInboundAt: "2026-09-30T13:00:00.000Z", settings: parseSettings({ stopFollowUpsOnReply: false }) };
    expect(evaluateScheduledMessage(followUp, s).action).toBe("send");
  });

  it("waits for business hours instead of texting at night", () => {
    const night = new Date("2026-10-02T02:00:00Z"); // 10pm local
    expect(evaluateScheduledMessage(followUp, { ...state, now: night })).toEqual({
      action: "defer",
      until: new Date("2026-10-02T13:00:00Z"), // 9am next morning
    });
  });

  describe("review requests", () => {
    const review: OutboxItem = { kind: "review_request", category: "informational", context: {} };
    it("sends once", () => expect(evaluateScheduledMessage(review, state).action).toBe("send"));
    it("never asks twice", () =>
      expect(evaluateScheduledMessage(review, withContact({ review_requested_at: "2026-09-01" }))).toEqual({
        action: "skip",
        reason: "already_requested",
      }));
    it("needs a review link", () =>
      expect(evaluateScheduledMessage(review, { ...state, hasReviewLink: false })).toEqual({
        action: "skip",
        reason: "no_review_link",
      }));
  });

  describe("bulk sends", () => {
    const rain: OutboxItem = { kind: "broadcast", category: "informational", context: {} };
    const promo: OutboxItem = { kind: "broadcast", category: "marketing", context: {} };
    const sixThirty = new Date("2026-10-01T10:30:00Z"); // 6:30am local

    it("lets a rain-delay notice go out early in the morning", () =>
      expect(evaluateScheduledMessage(rain, { ...state, now: sixThirty }).action).toBe("send"));
    it("holds a promotion until 8am", () =>
      expect(evaluateScheduledMessage(promo, { ...withContact({ marketing_consent_at: "2026-01-01" }), now: sixThirty })).toEqual({
        action: "defer",
        until: new Date("2026-10-01T12:00:00Z"),
      }));
    it("never sends a promotion without marketing consent", () =>
      expect(evaluateScheduledMessage(promo, state)).toEqual({ action: "skip", reason: "no_marketing_consent" }));
    it("skips when the owner canceled the send", () =>
      expect(evaluateScheduledMessage(rain, { ...state, broadcastStatus: "canceled" })).toEqual({
        action: "skip",
        reason: "broadcast_canceled",
      }));
  });
});

describe("SMS segment counting", () => {
  it("fits 160 plain characters in one text", () => {
    expect(smsSegments("a".repeat(160))).toEqual({ encoding: "GSM-7", characters: 160, segments: 1 });
    expect(smsSegments("a".repeat(161)).segments).toBe(2);
  });
  it("uses the smaller limit for Spanish accents like á", () => {
    expect(smsSegments("Aireación").encoding).toBe("UCS-2");
    expect(smsSegments("á".repeat(71)).segments).toBe(2);
  });
  it("keeps ñ and ¿ in the plain alphabet", () => {
    expect(smsSegments("¿Mañana?").encoding).toBe("GSM-7");
  });
});
