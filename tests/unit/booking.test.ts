import { describe, expect, it } from "vitest";
import {
  arrivalWindows,
  checkArrivalWindow,
  checkDayCapacity,
  checkDocuments,
  checkFixedAppointment,
  checkMobileAppointment,
  checkOpenTime,
  checkPackage,
  checkRecurringDay,
  checkStay,
  openStartTimes,
  sessionsLeft,
  stayNights,
} from "@/lib/booking/rules";
import type { ExistingBooking, OpenHours, Resource, Service } from "@/lib/booking/types";
import { zonedTimeToUtc } from "@/lib/time";

const TZ = "America/New_York";
const MON = "2026-10-05";
const at = (date: string, h: number, m = 0) => zonedTimeToUtc(date, h, m, TZ).getTime();
const NOW = at("2026-10-01", 9); // Thursday before
const HOURS: OpenHours = { 1: { open: 8, close: 17 }, 2: { open: 8, close: 17 }, 3: { open: 8, close: 17 }, 4: { open: 8, close: 17 }, 5: { open: 8, close: 17 }, 6: { open: 9, close: 13 } };

let n = 0;
function booking(p: Partial<ExistingBooking>): ExistingBooking {
  return {
    id: `b${++n}`,
    mode: "fixed_appointment",
    status: "confirmed",
    startMs: at(MON, 9),
    endMs: at(MON, 10),
    date: MON,
    serviceId: "svc",
    resourceId: null,
    travelBeforeMin: 0,
    travelAfterMin: 0,
    zip: null,
    checkIn: null,
    checkOut: null,
    unitClass: null,
    ...p,
  };
}
const res = (id: string, kind: string, extra: Partial<Resource> = {}): Resource => ({ id, name: id, kind, unitClass: null, capacity: 1, active: true, ...extra });

describe("opening hours and notice (every timed mode)", () => {
  it("allows a visit inside hours", () => {
    expect(checkOpenTime({ startMs: at(MON, 9), endMs: at(MON, 10), nowMs: NOW, timeZone: TZ, hours: HOURS }).ok).toBe(true);
  });
  it.each([
    ["in the past", at("2026-09-30", 9), at("2026-09-30", 10), "in_past"],
    ["on Sunday (closed)", at("2026-10-04", 10), at("2026-10-04", 11), "closed_day"],
    ["running past closing", at(MON, 16, 30), at(MON, 17, 30), "outside_hours"],
    ["before opening", at(MON, 7), at(MON, 8), "outside_hours"],
    ["on Saturday afternoon", at("2026-10-10", 13), at("2026-10-10", 14), "outside_hours"],
  ])("refuses a visit %s", (_n, start, end, reason) => {
    expect(checkOpenTime({ startMs: start, endMs: end, nowMs: NOW, timeZone: TZ, hours: HOURS })).toMatchObject({ ok: false, reason });
  });
  it("enforces minimum notice", () => {
    const soon = checkOpenTime({ startMs: at("2026-10-01", 11), endMs: at("2026-10-01", 12), nowMs: NOW, timeZone: TZ, hours: HOURS, minNoticeHours: 24 });
    expect(soon).toMatchObject({ ok: false, reason: "short_notice" });
  });
});

describe("arrival windows (estimates, cleaning, pest)", () => {
  it("splits the day into windows in local time, across daylight saving", () => {
    const w = arrivalWindows(MON, HOURS, 120, TZ);
    expect(w.map((x) => x.label)).toEqual(["8am–10am", "10am–12pm", "12pm–2pm", "2pm–4pm"]);
    expect(arrivalWindows("2026-11-02", HOURS, 120, TZ)[0].startMs).toBe(Date.UTC(2026, 10, 2, 13)); // EST: 8am = 13:00 UTC
    expect(arrivalWindows("2026-10-04", HOURS, 120, TZ)).toEqual([]);
  });

  it("fills a window up to its capacity, counting requests waiting for approval", () => {
    const [w] = arrivalWindows(MON, HOURS, 120, TZ);
    const existing = [
      booking({ mode: "arrival_window", startMs: w.startMs, endMs: w.endMs }),
      booking({ mode: "arrival_window", startMs: w.startMs, endMs: w.endMs, status: "pending_approval" }),
    ];
    expect(checkArrivalWindow(w, 3, existing).ok).toBe(true);
    expect(checkArrivalWindow(w, 2, existing)).toMatchObject({ ok: false, reason: "full" });
    // Canceled visits free their spot.
    existing[1].status = "canceled";
    expect(checkArrivalWindow(w, 2, existing).ok).toBe(true);
  });
});

describe("fixed appointments (grooming, detailing, repair bays)", () => {
  const groomers = [res("g1", "groomer"), res("g2", "groomer")];

  it("puts the visit on the first free groomer", () => {
    const busy = [booking({ resourceId: "g1", startMs: at(MON, 9), endMs: at(MON, 10, 30) })];
    expect(checkFixedAppointment({ startMs: at(MON, 10), endMs: at(MON, 11) }, groomers, busy, "groomer")).toEqual({ ok: true, resourceId: "g2" });
  });

  it("refuses when every groomer overlaps", () => {
    const busy = [booking({ resourceId: "g1" }), booking({ resourceId: "g2", startMs: at(MON, 9, 30), endMs: at(MON, 11) })];
    expect(checkFixedAppointment({ startMs: at(MON, 9, 45), endMs: at(MON, 10, 15) }, groomers, busy, "groomer")).toMatchObject({ ok: false, reason: "overlap" });
  });

  it("allows back-to-back visits (end = next start is not an overlap)", () => {
    const busy = [booking({ resourceId: "g1" }), booking({ resourceId: "g2" })];
    expect(checkFixedAppointment({ startMs: at(MON, 10), endMs: at(MON, 11) }, groomers, busy, "groomer").ok).toBe(true);
  });

  it("ignores inactive resources and other kinds", () => {
    const list = [res("g1", "groomer", { active: false }), res("b1", "bather")];
    expect(checkFixedAppointment({ startMs: at(MON, 9), endMs: at(MON, 10) }, list, [], "groomer").ok).toBe(true); // no groomers set up -> business is one resource
    const one = [res("g1", "groomer")];
    expect(checkFixedAppointment({ startMs: at(MON, 9), endMs: at(MON, 10) }, one, [booking({ resourceId: "g1", status: "canceled" })], "groomer")).toEqual({ ok: true, resourceId: "g1" });
  });

  it("finds open start times around existing bookings", () => {
    const service: Service = { id: "s", name: "Full groom", mode: "fixed_appointment", durationMin: 90, resourceKind: "groomer" };
    const busy = [booking({ resourceId: "g1", startMs: at(MON, 8), endMs: at(MON, 12) })];
    const times = openStartTimes({ date: MON, service, hours: HOURS, timeZone: TZ, nowMs: NOW, resources: [res("g1", "groomer")], existing: busy, stepMinutes: 60 });
    expect(times.map((t) => new Date(t.startMs).toISOString().slice(11, 16))).toEqual(["16:00", "17:00", "18:00", "19:00"]); // 12pm–3pm EDT starts
  });
});

describe("day capacity (moving, junk removal, pressure washing)", () => {
  it("allows up to N jobs a day per service", () => {
    const existing = [booking({ mode: "day_capacity", serviceId: "move" }), booking({ mode: "day_capacity", serviceId: "move" }), booking({ mode: "day_capacity", serviceId: "pack" })];
    expect(checkDayCapacity(MON, "move", 3, existing).ok).toBe(true);
    expect(checkDayCapacity(MON, "move", 2, existing)).toMatchObject({ ok: false, reason: "full" });
    expect(checkDayCapacity("2026-10-06", "move", 2, existing).ok).toBe(true);
  });
});

describe("multi-night stays (boarding)", () => {
  const runs = [res("r1", "run", { unitClass: "large", capacity: 2 }), res("r2", "run", { unitClass: "small", capacity: 4 })];
  const stay = (checkIn: string, checkOut: string, unitClass = "large", status: ExistingBooking["status"] = "confirmed") =>
    booking({ mode: "multi_day_reservation", checkIn, checkOut, unitClass, status, date: checkIn });

  it("counts nights from check-in up to, not including, check-out", () => {
    expect(stayNights("2026-11-25", "2026-11-28")).toEqual(["2026-11-25", "2026-11-26", "2026-11-27"]);
    expect(stayNights("2026-11-25", "2026-11-25")).toEqual([]);
  });

  it("refuses a stay when any single night is full", () => {
    const existing = [stay("2026-11-24", "2026-11-27"), stay("2026-11-26", "2026-11-29")];
    const r = checkStay({ checkIn: "2026-11-25", checkOut: "2026-11-28", today: "2026-10-01", unitClass: "large", resources: runs, existing });
    expect(r).toMatchObject({ ok: false, reason: "full", detail: "2026-11-26" });
  });

  it("lets a stay start the day another checks out", () => {
    const existing = [stay("2026-11-20", "2026-11-25"), stay("2026-11-20", "2026-11-25")];
    expect(checkStay({ checkIn: "2026-11-25", checkOut: "2026-11-27", today: "2026-10-01", unitClass: "large", resources: runs, existing }).ok).toBe(true);
  });

  it("keeps unit sizes separate and ignores canceled stays", () => {
    const existing = [stay("2026-11-25", "2026-11-27"), stay("2026-11-25", "2026-11-27")];
    expect(checkStay({ checkIn: "2026-11-25", checkOut: "2026-11-26", today: "2026-10-01", unitClass: "small", resources: runs, existing }).ok).toBe(true);
    existing[0].status = "canceled";
    expect(checkStay({ checkIn: "2026-11-25", checkOut: "2026-11-26", today: "2026-10-01", unitClass: "large", resources: runs, existing }).ok).toBe(true);
  });

  it("enforces dates and length limits", () => {
    const base = { today: "2026-10-01", unitClass: "large", resources: runs, existing: [] };
    expect(checkStay({ ...base, checkIn: "2026-11-25", checkOut: "2026-11-24" })).toMatchObject({ reason: "bad_dates" });
    expect(checkStay({ ...base, checkIn: "2026-09-25", checkOut: "2026-09-27" })).toMatchObject({ reason: "in_past" });
    expect(checkStay({ ...base, checkIn: "2026-11-01", checkOut: "2026-11-02", minNights: 2 })).toMatchObject({ reason: "stay_too_short" });
    expect(checkStay({ ...base, checkIn: "2026-11-01", checkOut: "2026-12-15", maxNights: 30 })).toMatchObject({ reason: "stay_too_long" });
  });

  it("is full when no runs of that size exist", () => {
    expect(checkStay({ checkIn: "2026-11-01", checkOut: "2026-11-02", today: "2026-10-01", unitClass: "xl", resources: runs, existing: [] })).toMatchObject({ reason: "full" });
  });
});

describe("mobile appointments (mobile vet, mobile mechanic, mobile grooming)", () => {
  const techs = [res("t1", "technician")];
  const travel = (a: string | null, b: string | null) => (a === b ? 10 : 40);

  it("refuses addresses outside the service area", () => {
    const r = checkMobileAppointment({ slot: { startMs: at(MON, 9), endMs: at(MON, 10) }, zip: "29401", serviceZips: ["29483", "29485"], resources: techs, existing: [] });
    expect(r).toMatchObject({ ok: false, reason: "outside_service_area" });
  });

  it("requires travel time between stops, based on where they are", () => {
    const existing = [booking({ mode: "mobile_appointment", resourceId: "t1", startMs: at(MON, 9), endMs: at(MON, 10), zip: "29483" })];
    const far = checkMobileAppointment({ slot: { startMs: at(MON, 10, 20), endMs: at(MON, 11, 20) }, zip: "29464", serviceZips: [], resources: techs, existing, travel });
    expect(far).toMatchObject({ ok: false, reason: "travel_buffer" });
    const near = checkMobileAppointment({ slot: { startMs: at(MON, 10, 20), endMs: at(MON, 11, 20) }, zip: "29483", serviceZips: [], resources: techs, existing, travel });
    expect(near).toEqual({ ok: true, resourceId: "t1" });
    const later = checkMobileAppointment({ slot: { startMs: at(MON, 10, 40), endMs: at(MON, 11, 40) }, zip: "29464", serviceZips: [], resources: techs, existing, travel });
    expect(later.ok).toBe(true);
  });

  it("checks travel to the NEXT stop too", () => {
    const existing = [booking({ mode: "mobile_appointment", resourceId: "t1", startMs: at(MON, 12), endMs: at(MON, 13), zip: "29464" })];
    const r = checkMobileAppointment({ slot: { startMs: at(MON, 10, 30), endMs: at(MON, 11, 30) }, zip: "29483", serviceZips: [], resources: techs, existing, travel });
    expect(r).toMatchObject({ ok: false, reason: "travel_buffer" });
  });

  it("uses a second technician when the first can't make it", () => {
    const existing = [booking({ mode: "mobile_appointment", resourceId: "t1", startMs: at(MON, 9), endMs: at(MON, 10), zip: "29483" })];
    const r = checkMobileAppointment({ slot: { startMs: at(MON, 10, 5), endMs: at(MON, 11) }, zip: "29464", serviceZips: [], resources: [...techs, res("t2", "technician")], existing, travel });
    expect(r).toEqual({ ok: true, resourceId: "t2" });
  });
});

describe("session packages (dog training, daycare packs)", () => {
  const pkg = { id: "p", sessionsTotal: 6, sessionsUsed: 5, expiresOn: "2026-12-31", serviceId: "lesson" };
  it("counts sessions left and stops at zero", () => {
    expect(sessionsLeft(pkg)).toBe(1);
    expect(checkPackage(pkg, "lesson", MON).ok).toBe(true);
    expect(checkPackage({ ...pkg, sessionsUsed: 6 }, "lesson", MON)).toMatchObject({ reason: "no_sessions_left" });
    expect(sessionsLeft({ ...pkg, sessionsUsed: 9 })).toBe(0);
  });
  it("refuses expired packages and other services", () => {
    expect(checkPackage(pkg, "lesson", "2027-01-02")).toMatchObject({ reason: "package_expired" });
    expect(checkPackage(pkg, "boarding", MON)).toMatchObject({ reason: "package_wrong_service" });
    expect(checkPackage({ ...pkg, serviceId: null }, "boarding", MON).ok).toBe(true);
  });
});

describe("recurring routes (lawn, pest, pool, cleaning)", () => {
  it("caps stops per weekday when the business sets a limit", () => {
    expect(checkRecurringDay(24, 25).ok).toBe(true);
    expect(checkRecurringDay(25, 25)).toMatchObject({ reason: "full" });
    expect(checkRecurringDay(500, null).ok).toBe(true);
  });
});

describe("required records, e.g. vaccines", () => {
  const docs = [{ documentType: "rabies", expiresOn: "2026-11-26" }, { documentType: "bordetella", expiresOn: null }];
  it("passes when every record is on file and valid through the last day", () => {
    expect(checkDocuments(["rabies", "bordetella"], docs, "2026-11-26").ok).toBe(true);
  });
  it("blocks a boarding stay that outlasts the rabies vaccine", () => {
    expect(checkDocuments(["rabies"], docs, "2026-11-28")).toMatchObject({ ok: false, reason: "expired_document", detail: "rabies" });
  });
  it("blocks when a record is missing, and passes when nothing is required", () => {
    expect(checkDocuments(["dhpp"], docs, MON)).toMatchObject({ ok: false, reason: "missing_document", detail: "dhpp" });
    expect(checkDocuments(undefined, [], MON).ok).toBe(true);
  });
  it("accepts a renewed record even if an old one expired", () => {
    expect(checkDocuments(["rabies"], [{ documentType: "rabies", expiresOn: "2026-01-01" }, { documentType: "rabies", expiresOn: "2027-06-01" }], "2026-12-01").ok).toBe(true);
  });
});

import { bookingWhen } from "@/lib/services/booking";
import { openHoursFrom, parseBookingSettings, validateBookingSettings } from "@/lib/booking/settings";

describe("booking labels and settings", () => {
  it("describes bookings in plain words", () => {
    const base = { check_in: null, check_out: null, service_date: MON };
    expect(bookingWhen({ ...base, mode: "arrival_window", starts_at: new Date(at(MON, 8)).toISOString(), ends_at: new Date(at(MON, 10)).toISOString() }, TZ)).toBe("Mon, Oct 5, arriving 8am–10am");
    expect(bookingWhen({ ...base, mode: "fixed_appointment", starts_at: new Date(at(MON, 13, 30)).toISOString(), ends_at: new Date(at(MON, 14, 30)).toISOString() }, TZ)).toBe("Mon, Oct 5, 1:30pm");
    expect(bookingWhen({ mode: "multi_day_reservation", starts_at: "", ends_at: "", check_in: "2026-11-25", check_out: "2026-11-28", service_date: "2026-11-25" }, TZ)).toBe("Wed, Nov 25 → Sat, Nov 28");
    expect(bookingWhen({ ...base, mode: "day_capacity", starts_at: "", ends_at: "" }, TZ)).toBe("Mon, Oct 5 (all day)");
  });

  it("defaults to weekdays 8–5 and rejects impossible hours", () => {
    const s = parseBookingSettings({});
    expect(openHoursFrom(s)).toEqual({ 1: { open: 8, close: 17 }, 2: { open: 8, close: 17 }, 3: { open: 8, close: 17 }, 4: { open: 8, close: 17 }, 5: { open: 8, close: 17 } });
    expect(validateBookingSettings({ openHour: 17, closeHour: 9 })).toEqual({ error: "Closing time must be after opening time." });
    expect(validateBookingSettings({ openDays: [] })).toMatchObject({ error: expect.stringMatching(/at least one day/) });
    expect(parseBookingSettings({ windowCapacity: "lots" }).windowCapacity).toBe(2); // bad saved data falls back to defaults
  });
});
