import type {
  ExistingBooking,
  OpenHours,
  Package,
  Resource,
  RuleResult,
  Service,
  SubjectDocument,
} from "@/lib/booking/types";
import { HOLDING_STATUSES } from "@/lib/booking/types";
import { addDays, daysBetween, localDateString, weekdayOf, zonedParts, zonedTimeToUtc } from "@/lib/time";

/**
 * Booking rules for every mode. Pure functions: they never read the database
 * or the clock (pass `nowMs`). The same rules run for the owner's screens,
 * the public booking page, AI agents and the voice line.
 */

const MIN = 60_000;
const holds = (b: ExistingBooking) => (HOLDING_STATUSES as readonly string[]).includes(b.status);
const ok = (resourceId?: string | null): RuleResult => ({ ok: true, resourceId });

// ---------------------------------------------------------------------------
// Checks every timed booking shares
// ---------------------------------------------------------------------------

/** Not in the past, enough notice, on an open day and inside opening hours. */
export function checkOpenTime(input: {
  startMs: number;
  endMs: number;
  nowMs: number;
  timeZone: string;
  hours: OpenHours;
  minNoticeHours?: number;
}): RuleResult {
  if (input.startMs < input.nowMs) return { ok: false, reason: "in_past" };
  if (input.minNoticeHours && input.startMs - input.nowMs < input.minNoticeHours * 60 * MIN) return { ok: false, reason: "short_notice" };
  const start = zonedParts(new Date(input.startMs), input.timeZone);
  const day = input.hours[start.weekday];
  if (!day) return { ok: false, reason: "closed_day" };
  const date = localDateString(new Date(input.startMs), input.timeZone);
  const open = zonedTimeToUtc(date, day.open, 0, input.timeZone).getTime();
  const close = zonedTimeToUtc(date, day.close, 0, input.timeZone).getTime();
  if (input.startMs < open || input.endMs > close) return { ok: false, reason: "outside_hours" };
  return ok();
}

/** Is the business open on this date? */
export function isOpenDay(date: string, hours: OpenHours): boolean {
  return Boolean(hours[weekdayOf(date)]);
}

// ---------------------------------------------------------------------------
// arrival_window: "we'll arrive between 8 and 10"
// ---------------------------------------------------------------------------

export type Window = { startMs: number; endMs: number; label: string };

/** The arrival windows on a date, e.g. 8–10, 10–12, 12–2, 2–4. */
export function arrivalWindows(date: string, hours: OpenHours, windowMinutes: number, timeZone: string): Window[] {
  const day = hours[weekdayOf(date)];
  if (!day || windowMinutes <= 0) return [];
  const out: Window[] = [];
  const close = zonedTimeToUtc(date, day.close, 0, timeZone).getTime();
  for (let t = zonedTimeToUtc(date, day.open, 0, timeZone).getTime(); t + windowMinutes * MIN <= close; t += windowMinutes * MIN) {
    out.push({ startMs: t, endMs: t + windowMinutes * MIN, label: `${hourLabel(t, timeZone)}–${hourLabel(t + windowMinutes * MIN, timeZone)}` });
  }
  return out;
}

function hourLabel(ms: number, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone }).format(new Date(ms)).replace(":00", "").replace(" ", "").toLowerCase();
}

/** Room in this window? Capacity is shared by every arrival-window visit. */
export function checkArrivalWindow(window: { startMs: number; endMs: number }, capacity: number, existing: ExistingBooking[]): RuleResult {
  const taken = existing.filter((b) => holds(b) && b.mode === "arrival_window" && b.startMs === window.startMs && b.endMs === window.endMs).length;
  return taken < capacity ? ok() : { ok: false, reason: "full" };
}

// ---------------------------------------------------------------------------
// fixed_appointment: a start time on one resource (groomer, bay, tech)
// ---------------------------------------------------------------------------

/** The time a booking blocks, including travel before and after. */
export function blockedRange(b: Pick<ExistingBooking, "startMs" | "endMs" | "travelBeforeMin" | "travelAfterMin">): [number, number] {
  return [b.startMs - b.travelBeforeMin * MIN, b.endMs + b.travelAfterMin * MIN];
}

const overlaps = (a: [number, number], b: [number, number]) => a[0] < b[1] && b[0] < a[1];

/** First resource of the right kind that's free for the whole time (or "overlap"). */
export function checkFixedAppointment(
  slot: { startMs: number; endMs: number },
  resources: Resource[],
  existing: ExistingBooking[],
  resourceKind?: string | null,
): RuleResult {
  const candidates = resources.filter((r) => r.active && (!resourceKind || r.kind === resourceKind));
  if (!candidates.length) {
    // No resources set up: the business itself is one resource.
    const clash = existing.some((b) => holds(b) && b.resourceId === null && b.mode !== "multi_day_reservation" && b.mode !== "day_capacity" && b.mode !== "arrival_window" && overlaps(blockedRange(b), [slot.startMs, slot.endMs]));
    return clash ? { ok: false, reason: "overlap" } : ok(null);
  }
  for (const r of candidates) {
    const busy = existing.some((b) => holds(b) && b.resourceId === r.id && overlaps(blockedRange(b), [slot.startMs, slot.endMs]));
    if (!busy) return ok(r.id);
  }
  return { ok: false, reason: "overlap" };
}

// ---------------------------------------------------------------------------
// day_capacity: "we do 2 moves a day"
// ---------------------------------------------------------------------------

export function checkDayCapacity(date: string, serviceId: string, dailyCapacity: number, existing: ExistingBooking[]): RuleResult {
  const taken = existing.filter((b) => holds(b) && b.mode === "day_capacity" && b.date === date && b.serviceId === serviceId).length;
  return taken < dailyCapacity ? ok() : { ok: false, reason: "full" };
}

// ---------------------------------------------------------------------------
// multi_day_reservation: boarding stays with nightly capacity per unit class
// ---------------------------------------------------------------------------

/** The nights of a stay: check-in date up to (not including) check-out. */
export function stayNights(checkIn: string, checkOut: string): string[] {
  const n = daysBetween(checkIn, checkOut);
  return Array.from({ length: Math.max(0, n) }, (_, i) => addDays(checkIn, i));
}

export function checkStay(input: {
  checkIn: string;
  checkOut: string;
  today: string;
  unitClass: string | null;
  resources: Resource[];
  existing: ExistingBooking[];
  minNights?: number;
  maxNights?: number;
}): RuleResult {
  const nights = stayNights(input.checkIn, input.checkOut);
  if (!nights.length) return { ok: false, reason: "bad_dates" };
  if (input.checkIn < input.today) return { ok: false, reason: "in_past" };
  if (input.minNights && nights.length < input.minNights) return { ok: false, reason: "stay_too_short" };
  if (input.maxNights && nights.length > input.maxNights) return { ok: false, reason: "stay_too_long" };
  const capacity = input.resources.filter((r) => r.active && r.unitClass === input.unitClass).reduce((n, r) => n + r.capacity, 0);
  for (const night of nights) {
    const taken = input.existing.filter(
      (b) => holds(b) && b.mode === "multi_day_reservation" && b.unitClass === input.unitClass && b.checkIn !== null && b.checkOut !== null && b.checkIn <= night && night < b.checkOut,
    ).length;
    if (taken >= capacity) return { ok: false, reason: "full", detail: night };
  }
  return ok();
}

// ---------------------------------------------------------------------------
// mobile_appointment: fixed appointments + service area + travel between stops
// ---------------------------------------------------------------------------

export type TravelFn = (fromZip: string | null, toZip: string | null) => number;

/** Rough drive time between two ZIP codes until a maps service is connected. */
export const defaultTravelMinutes: TravelFn = (a, b) => (!a || !b ? 30 : a === b ? 10 : 25);

export function checkMobileAppointment(input: {
  slot: { startMs: number; endMs: number };
  zip: string | null;
  serviceZips: string[];
  resources: Resource[];
  resourceKind?: string | null;
  existing: ExistingBooking[];
  travel?: TravelFn;
}): RuleResult {
  const travel = input.travel ?? defaultTravelMinutes;
  if (input.serviceZips.length && (!input.zip || !input.serviceZips.includes(input.zip))) return { ok: false, reason: "outside_service_area" };
  const techs = input.resources.filter((r) => r.active && (!input.resourceKind || r.kind === input.resourceKind));
  const pool = techs.length ? techs.map((t) => t.id as string | null) : [null];
  let sawTravelProblem = false;
  for (const techId of pool) {
    const day = input.existing.filter((b) => holds(b) && b.resourceId === techId && (b.mode === "mobile_appointment" || b.mode === "fixed_appointment"));
    if (day.some((b) => overlaps([b.startMs, b.endMs], [input.slot.startMs, input.slot.endMs]))) continue;
    const before = day.filter((b) => b.endMs <= input.slot.startMs).sort((a, b) => b.endMs - a.endMs)[0];
    const after = day.filter((b) => b.startMs >= input.slot.endMs).sort((a, b) => a.startMs - b.startMs)[0];
    const fitsBefore = !before || before.endMs + travel(before.zip, input.zip) * MIN <= input.slot.startMs;
    const fitsAfter = !after || input.slot.endMs + travel(input.zip, after.zip) * MIN <= after.startMs;
    if (fitsBefore && fitsAfter) return ok(techId);
    sawTravelProblem = true;
  }
  return { ok: false, reason: sawTravelProblem ? "travel_buffer" : "overlap" };
}

// ---------------------------------------------------------------------------
// package_sessions: "6 lessons", "10-day daycare pack"
// ---------------------------------------------------------------------------

export function sessionsLeft(pkg: Package): number {
  return Math.max(0, pkg.sessionsTotal - pkg.sessionsUsed);
}

export function checkPackage(pkg: Package, serviceId: string, date: string): RuleResult {
  if (pkg.serviceId && pkg.serviceId !== serviceId) return { ok: false, reason: "package_wrong_service" };
  if (pkg.expiresOn && date > pkg.expiresOn) return { ok: false, reason: "package_expired" };
  if (sessionsLeft(pkg) <= 0) return { ok: false, reason: "no_sessions_left" };
  return ok();
}

// ---------------------------------------------------------------------------
// recurring: route capacity per weekday (existing lawn schedules stay as they are)
// ---------------------------------------------------------------------------

export function checkRecurringDay(activeOnThatWeekday: number, maxPerDay: number | null): RuleResult {
  return maxPerDay === null || activeOnThatWeekday < maxPerDay ? ok() : { ok: false, reason: "full" };
}

// ---------------------------------------------------------------------------
// Required documents (e.g. rabies vaccine for grooming/boarding)
// ---------------------------------------------------------------------------

/**
 * Every required document must be on file and still valid on the last day of
 * the visit (for a stay: the check-out date).
 */
export function checkDocuments(required: string[] | undefined, documents: SubjectDocument[], validThrough: string): RuleResult {
  for (const type of required ?? []) {
    const onFile = documents.filter((d) => d.documentType === type);
    if (!onFile.length) return { ok: false, reason: "missing_document", detail: type };
    if (!onFile.some((d) => d.expiresOn === null || d.expiresOn >= validThrough)) return { ok: false, reason: "expired_document", detail: type };
  }
  return ok();
}

// ---------------------------------------------------------------------------
// Finding open times
// ---------------------------------------------------------------------------

/** Start times on a date (every `stepMinutes`) where a timed service fits, with the resource that would take it. */
export function openStartTimes(input: {
  date: string;
  service: Service;
  hours: OpenHours;
  timeZone: string;
  nowMs: number;
  resources: Resource[];
  existing: ExistingBooking[];
  stepMinutes?: number;
  zip?: string | null;
  serviceZips?: string[];
  travel?: TravelFn;
}): { startMs: number; endMs: number; resourceId: string | null }[] {
  const day = input.hours[weekdayOf(input.date)];
  if (!day) return [];
  const step = (input.stepMinutes ?? 30) * MIN;
  const duration = input.service.durationMin * MIN;
  const close = zonedTimeToUtc(input.date, day.close, 0, input.timeZone).getTime();
  const out: { startMs: number; endMs: number; resourceId: string | null }[] = [];
  for (let t = zonedTimeToUtc(input.date, day.open, 0, input.timeZone).getTime(); t + duration <= close; t += step) {
    const slot = { startMs: t, endMs: t + duration };
    const base = checkOpenTime({ ...slot, nowMs: input.nowMs, timeZone: input.timeZone, hours: input.hours, minNoticeHours: input.service.minNoticeHours });
    if (!base.ok) continue;
    const fit =
      input.service.mode === "mobile_appointment"
        ? checkMobileAppointment({ slot, zip: input.zip ?? null, serviceZips: input.serviceZips ?? [], resources: input.resources, resourceKind: input.service.resourceKind, existing: input.existing, travel: input.travel })
        : checkFixedAppointment(slot, input.resources, input.existing, input.service.resourceKind);
    if (fit.ok) out.push({ ...slot, resourceId: fit.resourceId ?? null });
  }
  return out;
}
