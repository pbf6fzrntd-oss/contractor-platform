import { describe, expect, it } from "vitest";
import { parseSettings } from "@/lib/settings";
import { computeTwilioSignature, isValidTwilioSignature } from "@/lib/twilio/signature";
import {
  addDays,
  daysBetween,
  isWithinWindow,
  localDateString,
  nextTimeInWindow,
  weekdayOf,
  zonedParts,
  zonedTimeToUtc,
} from "@/lib/time";

const NY = "America/New_York";

describe("time zones", () => {
  it("converts local Charleston time to UTC in summer (EDT) and winter (EST)", () => {
    expect(zonedTimeToUtc("2026-07-15", 10, 0, NY).toISOString()).toBe("2026-07-15T14:00:00.000Z");
    expect(zonedTimeToUtc("2026-12-15", 10, 0, NY).toISOString()).toBe("2026-12-15T15:00:00.000Z");
  });

  it("handles the daylight-saving switch days", () => {
    // Clocks jump forward Mar 8 2026 and back Nov 1 2026.
    expect(zonedTimeToUtc("2026-03-08", 10, 0, NY).toISOString()).toBe("2026-03-08T14:00:00.000Z");
    expect(zonedTimeToUtc("2026-11-01", 10, 0, NY).toISOString()).toBe("2026-11-01T15:00:00.000Z");
  });

  it("reads local date and hour", () => {
    const lateNightUtc = new Date("2026-09-30T02:30:00Z"); // 10:30pm Sep 29 in Charleston
    expect(localDateString(lateNightUtc, NY)).toBe("2026-09-29");
    expect(zonedParts(lateNightUtc, NY).hour).toBe(22);
  });

  it("does calendar math", () => {
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(daysBetween("2026-09-01", "2026-09-29")).toBe(28);
    expect(weekdayOf("2026-09-29")).toBe(2); // Tuesday
  });

  it("moves a time into the allowed window", () => {
    const window = { start: 9, end: 19 };
    const at = (iso: string) => nextTimeInWindow(new Date(iso), NY, window).toISOString();
    expect(at("2026-09-29T15:00:00Z")).toBe("2026-09-29T15:00:00.000Z"); // 11am: fine
    expect(at("2026-09-29T11:00:00Z")).toBe("2026-09-29T13:00:00.000Z"); // 7am -> 9am
    expect(at("2026-09-29T23:30:00Z")).toBe("2026-09-30T13:00:00.000Z"); // 7:30pm -> 9am next day
    expect(isWithinWindow(new Date("2026-09-29T23:00:00Z"), NY, window)).toBe(false); // 7pm is closed
  });
});

describe("automation settings", () => {
  it("fills in defaults", () => {
    expect(parseSettings(null)).toMatchObject({ followUpDays: [2, 5, 10], reviewDelayHours: 2, reviewAfterVisits: 3 });
  });
  it("keeps valid values, sorts follow-up days and replaces bad ones", () => {
    const s = parseSettings({ followUpDays: [10, 3, 3], reviewDelayHours: -5, followUpsEnabled: false });
    expect(s.followUpDays).toEqual([3, 10]);
    expect(s.reviewDelayHours).toBe(2);
    expect(s.followUpsEnabled).toBe(false);
  });
});

describe("Twilio webhook signatures", () => {
  // Reference values from Twilio's own library.
  const url = "https://mycompany.com/myapp.php?foo=1&bar=2";
  const params = {
    CallSid: "CA1234567890ABCDE",
    Caller: "+12349013030",
    Digits: "1234",
    From: "+12349013030",
    To: "+18005551212",
  };

  it("matches Twilio's reference signature", () => {
    expect(computeTwilioSignature("12345", url, params)).toBe("0/KCTR6DLpKmkAf8muzZqo1nDgQ=");
  });

  it("rejects missing or tampered requests", () => {
    expect(isValidTwilioSignature("12345", "0/KCTR6DLpKmkAf8muzZqo1nDgQ=", url, params)).toBe(true);
    expect(isValidTwilioSignature("12345", null, url, params)).toBe(false);
    expect(isValidTwilioSignature("12345", "0/KCTR6DLpKmkAf8muzZqo1nDgQ=", url, { ...params, To: "+19999999999" })).toBe(
      false,
    );
    expect(isValidTwilioSignature("wrong-token", "0/KCTR6DLpKmkAf8muzZqo1nDgQ=", url, params)).toBe(false);
  });
});
