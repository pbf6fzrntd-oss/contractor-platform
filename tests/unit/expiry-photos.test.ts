import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  credentialAlertDue,
  credentialAlertStage,
  credentialAlertText,
  daysUntil,
  documentLabel,
  vaccineReminderDue,
} from "@/lib/automation/expiry";
import { evaluateScheduledMessage, type OutboxItem, type OutboxState } from "@/lib/automation/outbox";
import { vaccineReminderText } from "@/lib/booking/messages";
import { parseBookingSettings } from "@/lib/booking/settings";
import { isTwilioMediaUrl, mediaFromTwilio, mediaOnlyBody } from "@/lib/files/mms";
import { DEFAULT_SETTINGS } from "@/lib/settings";

const TODAY = "2026-10-01";

describe("license and insurance expiry alerts", () => {
  it("counts days in whole calendar days", () => {
    expect(daysUntil("2026-10-31", TODAY)).toBe(30);
    expect(daysUntil("2026-09-30", TODAY)).toBe(-1);
    expect(daysUntil("2026-11-02", TODAY)).toBe(32); // across the clock change
  });

  it("warns at 30 days, 7 days and when expired", () => {
    expect(credentialAlertStage("2026-11-15", TODAY)).toBeNull();
    expect(credentialAlertStage("2026-10-31", TODAY)).toBe("30");
    expect(credentialAlertStage("2026-10-08", TODAY)).toBe("7");
    expect(credentialAlertStage(TODAY, TODAY)).toBe("7");
    expect(credentialAlertStage("2026-09-30", TODAY)).toBe("expired");
  });

  it("sends each warning once per expiry date", () => {
    const c = { expiresOn: "2026-10-20", alertStage: null, alertFor: null };
    expect(credentialAlertDue(c, TODAY)).toBe("30");
    expect(credentialAlertDue({ ...c, alertStage: "30", alertFor: "2026-10-20" }, TODAY)).toBeNull();
    expect(credentialAlertDue({ ...c, alertStage: "30", alertFor: "2026-10-20" }, "2026-10-13")).toBe("7");
    expect(credentialAlertDue({ ...c, alertStage: "7", alertFor: "2026-10-20" }, "2026-10-21")).toBe("expired");
    expect(credentialAlertDue({ ...c, alertStage: "expired", alertFor: "2026-10-20" }, "2026-11-21")).toBeNull();
  });

  it("starts over when the license is renewed (new date)", () => {
    expect(credentialAlertDue({ expiresOn: "2027-10-20", alertStage: "expired", alertFor: "2026-10-20" }, "2027-09-25")).toBe("30");
    expect(credentialAlertDue({ expiresOn: "2027-10-20", alertStage: "expired", alertFor: "2026-10-20" }, TODAY)).toBeNull();
  });

  it("doesn't send a late 30-day warning for something added 5 days before it expires", () => {
    expect(credentialAlertDue({ expiresOn: "2026-10-06", alertStage: null, alertFor: null }, TODAY)).toBe("7");
  });

  it("ignores items with no expiry date", () => {
    expect(credentialAlertDue({ expiresOn: null, alertStage: null, alertFor: null }, TODAY)).toBeNull();
  });

  it("writes plain owner-facing alerts", () => {
    expect(credentialAlertText("SC residential license", "7", "2026-10-06", TODAY)).toBe(
      "Your SC residential license expires in 5 days (Oct 6, 2026). Renew it, then update the date in Settings → Licenses & insurance.",
    );
    expect(credentialAlertText("Liability insurance", "expired", "2026-09-30", TODAY)).toMatch(/^Your Liability insurance expired on Sep 30, 2026\. It's hidden from your public profile/);
  });
});

describe("vaccine record reminders", () => {
  const r = { expiresOn: "2026-10-10", reminderSentAt: null, hasNewerRecord: false, deleted: false };
  it("reminds within 2 weeks of expiry, once", () => {
    expect(vaccineReminderDue(r, TODAY)).toBe(true);
    expect(vaccineReminderDue({ ...r, expiresOn: "2026-10-15" }, TODAY)).toBe(true);
    expect(vaccineReminderDue({ ...r, expiresOn: "2026-10-16" }, TODAY)).toBe(false);
    expect(vaccineReminderDue({ ...r, reminderSentAt: "2026-09-30T12:00:00Z" }, TODAY)).toBe(false);
  });
  it("skips replaced, deleted and long-expired records", () => {
    expect(vaccineReminderDue({ ...r, hasNewerRecord: true }, TODAY)).toBe(false);
    expect(vaccineReminderDue({ ...r, deleted: true }, TODAY)).toBe(false);
    expect(vaccineReminderDue({ ...r, expiresOn: "2026-09-26" }, TODAY)).toBe(true);
    expect(vaccineReminderDue({ ...r, expiresOn: "2026-09-20" }, TODAY)).toBe(false);
    expect(vaccineReminderDue({ ...r, expiresOn: null }, TODAY)).toBe(false);
  });
  it("is on by default and can be turned off", () => {
    expect(parseBookingSettings({}).vaccineReminders).toBe(true);
    expect(parseBookingSettings({ vaccineReminders: false }).vaccineReminders).toBe(false);
  });
  it("names the vaccine in the customer's language, with no STOP line (the send function adds it)", () => {
    expect(documentLabel("rabies", "es")).toBe("rabia");
    expect(documentLabel("custom_shot", "en")).toBe("custom shot");
    const en = vaccineReminderText("en", "Paws", "Biscuit", "rabies", "Oct 10", false);
    expect(en).toBe("Paws: The rabies record we have for Biscuit expires on Oct 10. You can reply with a photo of the new one.");
    expect(vaccineReminderText("es", "Paws", "Biscuit", "rabia", "10 oct", true)).toMatch(/^Paws: El registro de rabia de Biscuit que tenemos venció/);
    expect(en).not.toMatch(/STOP/);
  });

  const item: OutboxItem = { kind: "vaccine_reminder", category: "informational", context: { file_id: "f1" } };
  const state: OutboxState = {
    now: new Date("2026-10-01T16:00:00Z"),
    timezone: "America/New_York",
    settings: DEFAULT_SETTINGS,
    contact: { opted_out_at: null, marketing_consent_at: null, do_not_autotext: false, review_requested_at: null },
    lead: null,
    lastInboundAt: null,
    hasReviewLink: false,
    broadcastStatus: null,
    documentCurrent: true,
  };
  it("re-checks right before sending", () => {
    expect(evaluateScheduledMessage(item, state)).toEqual({ action: "send" });
    expect(evaluateScheduledMessage(item, { ...state, documentCurrent: false })).toEqual({ action: "skip", reason: "record_updated" });
    expect(evaluateScheduledMessage(item, { ...state, contact: { ...state.contact!, opted_out_at: "2026-09-01" } })).toEqual({ action: "skip", reason: "opted_out" });
    expect(evaluateScheduledMessage(item, { ...state, contact: { ...state.contact!, do_not_autotext: true } })).toEqual({ action: "skip", reason: "do_not_autotext" });
    expect(evaluateScheduledMessage(item, { ...state, now: new Date("2026-10-02T02:00:00Z") }).action).toBe("defer"); // 10pm: waits for business hours
  });
});

describe("photos texted in (MMS)", () => {
  const good = "https://api.twilio.com/2010-04-01/Accounts/AC" + "a".repeat(32) + "/Messages/MM" + "b".repeat(32) + "/Media/ME" + "c".repeat(32);

  it("only downloads from Twilio's own media addresses", () => {
    expect(isTwilioMediaUrl(good)).toBe(true);
    for (const bad of [
      good.replace("https:", "http:"),
      good.replace("api.twilio.com", "api.twilio.com.evil.com"),
      good.replace("api.twilio.com", "api.twilio.com:8443"),
      "https://evil.com/2010-04-01/Accounts/AC" + "a".repeat(32),
      "https://api.twilio.com/2010-04-01/Accounts/AC" + "a".repeat(32) + "/Calls.json",
      "https://user:pw@api.twilio.com/x",
      "not a url",
    ]) expect(isTwilioMediaUrl(bad), bad).toBe(false);
  });

  it("reads the attachments from Twilio's webhook and ignores anything else", () => {
    expect(mediaFromTwilio({ NumMedia: "2", MediaUrl0: good, MediaContentType0: "image/jpeg", MediaUrl1: "https://evil.com/x.jpg", MediaContentType1: "image/jpeg" })).toEqual([
      { url: good, contentType: "image/jpeg" },
    ]);
    expect(mediaFromTwilio({ NumMedia: "0" })).toEqual([]);
    expect(mediaFromTwilio({})).toEqual([]);
    expect(mediaFromTwilio({ NumMedia: "999", ...Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`MediaUrl${i}`, good])) })).toHaveLength(10);
  });

  it("shows photo-only texts in the conversation", () => {
    expect(mediaOnlyBody(1)).toBe("📷 Photo");
    expect(mediaOnlyBody(3)).toBe("📷 3 photos");
  });

  it("never hands photos or file links to AI assistants", () => {
    const dir = path.join(process.cwd(), "lib/agent");
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".ts"))) {
      const src = readFileSync(path.join(dir, f), "utf8");
      expect(src, f).not.toMatch(/from\("files"\)|signedUrl|loadThread/);
    }
  });
});
