import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({
  serverEnv: { fileSigningSecret: "test-secret-for-manage-links" },
  publicEnv: { siteUrl: "https://app.example.com" },
}));

import { evaluateScheduledMessage, type OutboxItem, type OutboxState } from "@/lib/automation/outbox";
import { normalizeKeyword } from "@/lib/automation/keywords";
import { bookingIdFromToken, manageToken, manageUrl } from "@/lib/booking/manage-link";
import {
  agentBookingVerifyText,
  bookingConfirmedText,
  bookingReminderText,
  bookingCanceledText,
  bookingExpiredText,
} from "@/lib/booking/messages";
import { classifyBookingReply, isApprovalExpired, isVerificationExpired, reminderSendAt } from "@/lib/booking/reminders";
import { arrivalWindows, checkOpenTime, checkStay, isOpenDay } from "@/lib/booking/rules";
import { parseBookingSettings, validateBookingSettings } from "@/lib/booking/settings";
import type { OpenHours } from "@/lib/booking/types";
import { publicLang, words } from "@/lib/public/i18n";
import { bookingWhen } from "@/lib/services/booking";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { zonedTimeToUtc } from "@/lib/time";

const TZ = "America/New_York";
const at = (date: string, h: number, m = 0) => zonedTimeToUtc(date, h, m, TZ).getTime();
const HOURS: OpenHours = { 1: { open: 8, close: 17 }, 2: { open: 8, close: 17 }, 3: { open: 8, close: 17 }, 4: { open: 8, close: 17 }, 5: { open: 8, close: 17 } };

describe("days off (holidays, vacations)", () => {
  const THANKSGIVING = "2026-11-26"; // a Thursday

  it("closes the day even though it's a normal weekday", () => {
    expect(isOpenDay(THANKSGIVING, HOURS)).toBe(true);
    expect(isOpenDay(THANKSGIVING, HOURS, [THANKSGIVING])).toBe(false);
  });

  it("offers no arrival windows that day", () => {
    expect(arrivalWindows(THANKSGIVING, HOURS, 120, TZ).length).toBeGreaterThan(0);
    expect(arrivalWindows(THANKSGIVING, HOURS, 120, TZ, [THANKSGIVING])).toEqual([]);
  });

  it("refuses a time on a day off", () => {
    const input = { startMs: at(THANKSGIVING, 10), endMs: at(THANKSGIVING, 11), nowMs: at("2026-11-01", 9), timeZone: TZ, hours: HOURS };
    expect(checkOpenTime(input).ok).toBe(true);
    expect(checkOpenTime({ ...input, closedDates: [THANKSGIVING] })).toEqual({ ok: false, reason: "closed_day" });
  });

  it("refuses a stay that drops off or picks up on a day off", () => {
    const base = { today: "2026-11-01", unitClass: null, resources: [{ id: "k1", name: "k1", kind: "kennel", unitClass: null, capacity: 1, active: true }], existing: [] };
    expect(checkStay({ ...base, checkIn: "2026-11-24", checkOut: "2026-11-28" }).ok).toBe(true);
    expect(checkStay({ ...base, checkIn: "2026-11-24", checkOut: "2026-11-26", closedDates: ["2026-11-26"] }).ok).toBe(false);
    expect(checkStay({ ...base, checkIn: "2026-11-26", checkOut: "2026-11-28", closedDates: ["2026-11-26"] }).ok).toBe(false);
    // Staying through a day off is fine; only drop-off and pick-up need someone there.
    expect(checkStay({ ...base, checkIn: "2026-11-24", checkOut: "2026-11-28", closedDates: ["2026-11-26"] }).ok).toBe(true);
  });
});

describe("booking settings (new fields default safely)", () => {
  it("existing businesses get safe defaults", () => {
    const s = parseBookingSettings({ openDays: [1, 2, 3], openHour: 8, closeHour: 17 });
    expect(s.closedDates).toEqual([]);
    expect(s.remindersEnabled).toBe(true);
    expect(s.approvalHoldHours).toBe(24);
    expect(s.agentVerifyMinutes).toBe(120);
  });

  it("rejects bad dates and out-of-range holds", () => {
    const base = { openDays: [1], openHour: 8, closeHour: 17 };
    expect("error" in validateBookingSettings({ ...base, closedDates: ["11/26/2026"] })).toBe(true);
    expect("error" in validateBookingSettings({ ...base, approvalHoldHours: 1 })).toBe(true);
    expect("error" in validateBookingSettings({ ...base, agentVerifyMinutes: 5 })).toBe(true);
    expect("settings" in validateBookingSettings({ ...base, closedDates: ["2026-11-26"], approvalHoldHours: 48 })).toBe(true);
  });
});

describe("reminder timing", () => {
  it("goes out at 5pm the day before", () => {
    const start = new Date(at("2026-10-06", 9)).toISOString();
    expect(reminderSendAt(start, TZ, at("2026-10-01", 9))?.toISOString()).toBe(new Date(at("2026-10-05", 17)).toISOString());
  });

  it("keeps 5pm local across the clock change", () => {
    const start = new Date(at("2026-11-02", 9)).toISOString(); // Monday after DST ends
    expect(reminderSendAt(start, TZ, at("2026-10-20", 9))?.toISOString()).toBe("2026-11-01T22:00:00.000Z"); // 5pm EST
  });

  it("skips the reminder when it's already past 5pm the day before", () => {
    const start = new Date(at("2026-10-06", 9)).toISOString();
    expect(reminderSendAt(start, TZ, at("2026-10-05", 18))).toBeNull();
    expect(reminderSendAt(start, TZ, at("2026-10-05", 16, 58))).toBeNull(); // under 5 minutes away
  });
});

describe("customer replies about a booking", () => {
  const classify = (s: string) => classifyBookingReply(normalizeKeyword(s));

  it.each(["C", "c", "Confirm", "YES", "yes!", "Y", "ok", "Sí", "si", "Confirmo"])("%s confirms", (s) => expect(classify(s)).toBe("confirm"));
  it.each(["R", "r", "Reschedule", "change", "Cambiar", "reprogramar"])("%s asks to reschedule", (s) => expect(classify(s)).toBe("reschedule"));
  it.each(["C u tomorrow", "yes but can you come at 3", "Can we do Tuesday?", "", "STOP"])("%j is an ordinary message", (s) => expect(classify(s)).toBeNull());
});

describe("releasing requests nobody finished", () => {
  const created = "2026-10-01T12:00:00.000Z";
  it("releases an owner-approval request after the hold time", () => {
    expect(isApprovalExpired(created, Date.parse(created) + 23 * 3_600_000, 24)).toBe(false);
    expect(isApprovalExpired(created, Date.parse(created) + 24 * 3_600_000, 24)).toBe(true);
  });
  it("releases an AI-agent request the customer never confirmed", () => {
    expect(isVerificationExpired(null, Date.now())).toBe(false);
    expect(isVerificationExpired(created, Date.parse(created) - 1)).toBe(false);
    expect(isVerificationExpired(created, Date.parse(created))).toBe(true);
  });
});

describe("private reschedule/cancel links", () => {
  const id = "3f2b8c1e-4a5d-4e6f-8a9b-0c1d2e3f4a5b";

  it("round-trips a booking id", () => {
    const token = manageToken(id);
    expect(token).toMatch(/^[0-9a-f]{32}[A-Za-z0-9_-]{22}$/);
    expect(bookingIdFromToken(token)).toBe(id);
    expect(manageUrl(id)).toBe(`https://app.example.com/m/${token}`);
  });

  it("rejects a changed id or signature (can't reach someone else's booking)", () => {
    const token = manageToken(id);
    const otherId = token.replace(/^3/, "4");
    expect(bookingIdFromToken(otherId)).toBeNull();
    expect(bookingIdFromToken(token.slice(0, -1) + (token.endsWith("A") ? "B" : "A"))).toBeNull();
    expect(bookingIdFromToken(`${id.replace(/-/g, "")}`)).toBeNull();
    expect(bookingIdFromToken("../../admin")).toBeNull();
  });
});

describe("last check before a booking reminder goes out", () => {
  const startsAt = "2026-10-06T13:00:00.000Z";
  const item: OutboxItem = { kind: "booking_reminder", category: "informational", context: { booking_id: "b1", starts_at: startsAt } };
  const state: OutboxState = {
    now: new Date("2026-10-05T21:00:00Z"), // 5pm local the day before
    timezone: TZ,
    settings: DEFAULT_SETTINGS,
    contact: { opted_out_at: null, marketing_consent_at: null, do_not_autotext: false, review_requested_at: null },
    lead: null,
    lastInboundAt: null,
    hasReviewLink: false,
    broadcastStatus: null,
    booking: { status: "confirmed", starts_at: startsAt },
  };

  it("sends when the booking is unchanged (even with no lead)", () => expect(evaluateScheduledMessage(item, state)).toEqual({ action: "send" }));
  it.each([
    ["the booking was canceled", { ...state, booking: { status: "canceled", starts_at: startsAt } }, "booking_changed"],
    ["the booking was moved", { ...state, booking: { status: "confirmed", starts_at: "2026-10-07T13:00:00.000Z" } }, "booking_changed"],
    ["the booking was deleted", { ...state, booking: null }, "booking_changed"],
    ["the visit already started", { ...state, now: new Date("2026-10-06T13:30:00Z") }, "booking_passed"],
    ["the customer opted out", { ...state, contact: { ...state.contact!, opted_out_at: "2026-10-02T00:00:00Z" } }, "opted_out"],
    ["the customer is do-not-autotext", { ...state, contact: { ...state.contact!, do_not_autotext: true } }, "do_not_autotext"],
  ])("skips when %s", (_l, s, reason) => expect(evaluateScheduledMessage(item, s as OutboxState)).toEqual({ action: "skip", reason }));
});

describe("booking texts", () => {
  it("never include the opt-out line (the send function adds it)", () => {
    for (const lang of ["en", "es"] as const) {
      for (const t of [
        bookingReminderText(lang, "Paws", "Tue, Oct 6, 9:00 AM", "https://x/m/abc"),
        agentBookingVerifyText(lang, "Paws", "Tue, Oct 6, 9:00 AM", 120),
        bookingConfirmedText(lang, "Paws", "Tue", "https://x/m/abc"),
        bookingCanceledText(lang, "Paws", "Tue"),
        bookingExpiredText(lang, "Paws", "Tue"),
      ]) {
        expect(t.startsWith("Paws:")).toBe(true);
        expect(t).not.toMatch(/STOP/);
      }
    }
  });

  it("asks for YES (or SI) within the owner's time", () => {
    expect(agentBookingVerifyText("en", "Paws", "Tue", 120)).toContain("Reply YES within 2 hours");
    expect(agentBookingVerifyText("en", "Paws", "Tue", 30)).toContain("30 minutes");
    expect(agentBookingVerifyText("es", "Paws", "Tue", 240)).toContain("Responda SI en 4 horas");
  });

  it("writes the time in Spanish for Spanish speakers", () => {
    const b = { mode: "fixed_appointment", starts_at: "2026-10-06T13:00:00.000Z", ends_at: "2026-10-06T14:00:00.000Z", check_in: null, check_out: null, service_date: "2026-10-06" };
    expect(bookingWhen(b, TZ)).toMatch(/Tue, Oct 6/);
    expect(bookingWhen(b, TZ, "es")).toMatch(/mar/);
  });
});

describe("Spanish public pages", () => {
  it("only switches on an exact ?lang=es", () => {
    expect(publicLang("es")).toBe("es");
    expect(publicLang("ES")).toBe("en");
    expect(publicLang(["es"])).toBe("en");
    expect(publicLang(undefined)).toBe("en");
  });
  it("has every English phrase in Spanish", () => {
    const en = words("en");
    const es = words("es");
    expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort());
    expect(Object.keys(es.status).sort()).toEqual(Object.keys(en.status).sort());
    expect(es.request).not.toBe(en.request);
  });
});
