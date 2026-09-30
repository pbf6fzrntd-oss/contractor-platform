import { describe, expect, it } from "vitest";
import { buildCalendar, foldLine, icsText, icsTime } from "@/lib/calendar/ics";
import { setupProgress, setupSteps, type SetupState } from "@/lib/setup/checklist";

const fresh: SetupState = {
  businessType: "project",
  hasPhone: false,
  phoneIsPretend: false,
  hasAlertPhone: true,
  hasReviewLink: false,
  callsReceived: 0,
  registrationStatus: "not_started",
  recurringCustomers: 0,
  credentials: 0,
  teamMembers: 1,
  profileAvailable: false,
  profileOn: false,
  bookingAvailable: false,
  bookingOn: false,
};

describe("setup checklist", () => {
  it("starts a new trade business on getting a number", () => {
    const steps = setupSteps(fresh);
    const p = setupProgress(steps);
    expect(p).toMatchObject({ done: 1, total: 5, complete: false });
    expect(p.next?.key).toBe("number");
    expect(steps.map((s) => s.key)).toEqual(["number", "alerts", "test", "registration", "reviews", "licenses", "team"]);
  });

  it("asks lawn businesses to add their customers, and offers booking/profile only when the plan has them", () => {
    const steps = setupSteps({ ...fresh, businessType: "recurring", bookingAvailable: true, profileAvailable: true });
    expect(steps.find((s) => s.key === "customers")?.optional).toBe(false);
    expect(steps.some((s) => s.key === "booking")).toBe(true);
    expect(steps.some((s) => s.key === "profile")).toBe(true);
  });

  it("points pretend numbers at the simulator, real numbers at call forwarding", () => {
    expect(setupSteps({ ...fresh, hasPhone: true, phoneIsPretend: true }).find((s) => s.key === "test")?.href).toBe("/simulator");
    expect(setupSteps({ ...fresh, hasPhone: true }).find((s) => s.key === "test")?.title).toMatch(/Forward/);
  });

  it("is complete when the must-do steps are done (optional ones can wait)", () => {
    const p = setupProgress(setupSteps({ ...fresh, hasPhone: true, callsReceived: 1, registrationStatus: "submitted", hasReviewLink: true }));
    expect(p.complete).toBe(true);
    expect(p.next?.key).toBe("licenses");
  });
});

describe("calendar feed (.ics)", () => {
  it("escapes text and uses UTC times", () => {
    expect(icsText("Roof; repair, back\\side\nGate")).toBe("Roof\; repair\\, back\\\\side\\nGate");
    expect(icsTime("2026-10-06T13:00:00.000Z")).toBe("20261006T130000Z");
  });

  it("folds long lines at 75 bytes (accents count as 2)", () => {
    const line = `SUMMARY:${"Inspección de techo ".repeat(10)}`;
    const folded = foldLine(line);
    for (const part of folded.split("\r\n")) expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75);
    expect(folded.replace(/\r\n /g, "")).toBe(line);
  });

  it("builds a calendar Google and Apple accept", () => {
    const ics = buildCalendar(
      "Palmetto Roofing bookings",
      [
        { uid: "booking-1@x", kind: "timed", start: "2026-10-06T12:00:00Z", end: "2026-10-06T14:00:00Z", title: "Roof inspection: Karen Whitfield", location: "118 Tupelo Ln, Summerville", status: "CONFIRMED" },
        { uid: "route-1@x", kind: "allday", date: "2026-10-07", title: "Route: 8 customers" },
      ],
      new Date("2026-10-01T12:00:00Z"),
    );
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("DTSTART:20261006T120000Z");
    expect(ics).toContain("LOCATION:118 Tupelo Ln\\, Summerville");
    expect(ics).toContain("DTSTART;VALUE=DATE:20261007\r\nDTEND;VALUE=DATE:20261008");
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics).not.toMatch(/[^\r]\n/); // every line ends with CRLF
  });
});
