import "server-only";
import {
  arrivalWindows,
  checkArrivalWindow,
  checkDayCapacity,
  checkDocuments,
  checkFixedAppointment,
  checkMobileAppointment,
  checkOpenTime,
  checkPackage,
  checkStay,
  isOpenDay,
  openStartTimes,
} from "@/lib/booking/rules";
import { openHoursFrom, parseBookingSettings, type BookingSettings } from "@/lib/booking/settings";
import {
  BLOCK_REASON_TEXT,
  type BookingMode,
  type BookingSource,
  type BookingStatus,
  type ExistingBooking,
  type Package,
  type Resource,
  type RuleResult,
  type Service,
  type SubjectDocument,
} from "@/lib/booking/types";
import { evaluateApproval, hasBehaviorWarning, parseApprovalSettings } from "@/lib/approvals/rules";
import type { Tables } from "@/lib/database.types";
import type { Org } from "@/lib/org";
import type { AdminClient } from "@/lib/supabase/admin";
import { addDays, localDateString, zonedTimeToUtc } from "@/lib/time";

/**
 * Connects the pure booking rules to the database. Used by the team's
 * screens, AI assistants, the public booking page and outside agents, so
 * every channel follows exactly the same rules.
 */

type ServiceRow = Tables<"service_catalog">;

export function toService(row: ServiceRow, settings: BookingSettings): Service {
  return {
    id: row.id,
    name: row.name,
    mode: row.booking_mode as BookingMode,
    durationMin: row.duration_minutes,
    windowMinutes: settings.windowMinutes,
    windowCapacity: settings.windowCapacity,
    dailyCapacity: row.daily_capacity ?? 1,
    resourceKind: row.resource_kind,
    requiredDocuments: row.required_documents,
    minNoticeHours: row.min_notice_hours,
    minNights: row.min_nights ?? undefined,
    maxNights: row.max_nights ?? undefined,
  };
}

function toExisting(b: Tables<"bookings">, timeZone: string): ExistingBooking {
  return {
    id: b.id,
    mode: b.mode as BookingMode,
    status: b.status as BookingStatus,
    startMs: Date.parse(b.starts_at),
    endMs: Date.parse(b.ends_at),
    date: b.service_date ?? localDateString(new Date(b.starts_at), timeZone),
    serviceId: b.service_id,
    resourceId: b.resource_id,
    travelBeforeMin: b.travel_before_minutes,
    travelAfterMin: b.travel_after_minutes,
    zip: b.service_zip,
    checkIn: b.check_in,
    checkOut: b.check_out,
    unitClass: b.unit_class,
  };
}

export type BookingData = {
  settings: BookingSettings;
  services: ServiceRow[];
  resources: Resource[];
  existing: ExistingBooking[];
};

/** Everything the rules need for dates between `from` and `to` (inclusive). */
export async function loadBookingData(db: AdminClient, org: Org, from: string, to: string): Promise<BookingData> {
  const [{ data: services }, { data: resources }, { data: bookings }] = await Promise.all([
    db.from("service_catalog").select("*").eq("org_id", org.id).eq("active", true).order("sort_order").order("name"),
    db.from("resources").select("*").eq("org_id", org.id),
    db
      .from("bookings")
      .select("*")
      .eq("org_id", org.id)
      .in("status", ["requested", "pending_approval", "confirmed", "in_progress"])
      // Stays that started before the range can still cover nights inside it.
      .or(`and(service_date.gte.${addDays(from, -1)},service_date.lte.${addDays(to, 1)}),and(check_out.gt.${from},check_in.lte.${to})`),
  ]);
  return {
    settings: parseBookingSettings(org.booking_settings),
    services: services ?? [],
    resources: (resources ?? []).map((r) => ({ id: r.id, name: r.name, kind: r.kind, unitClass: r.unit_class, capacity: r.capacity, active: r.active })),
    existing: (bookings ?? []).map((b) => toExisting(b, org.timezone)),
  };
}

export type Opening =
  | { kind: "window"; startMs: number; endMs: number; label: string; left: number }
  | { kind: "time"; startMs: number; endMs: number; resourceId: string | null }
  | { kind: "day"; date: string; left: number };

/** Open choices for one service on one date (stays are checked with checkStay instead). */
export function openingsOn(data: BookingData, service: ServiceRow, date: string, org: Org, nowMs: number, zip?: string | null): Opening[] {
  const s = toService(service, data.settings);
  const hours = openHoursFrom(data.settings);
  if (!isOpenDay(date, hours)) return [];
  if (s.mode === "arrival_window") {
    return arrivalWindows(date, hours, data.settings.windowMinutes, org.timezone)
      .filter((w) => checkOpenTime({ ...w, nowMs, timeZone: org.timezone, hours, minNoticeHours: s.minNoticeHours }).ok)
      .map((w) => {
        const taken = data.existing.filter((b) => b.mode === "arrival_window" && b.startMs === w.startMs && b.endMs === w.endMs).length;
        return { kind: "window" as const, ...w, left: Math.max(0, data.settings.windowCapacity - taken) };
      })
      .filter((w) => w.left > 0);
  }
  if (s.mode === "day_capacity") {
    if (date < localDateString(new Date(nowMs), org.timezone)) return [];
    const taken = data.existing.filter((b) => b.mode === "day_capacity" && b.date === date && b.serviceId === s.id).length;
    const left = (s.dailyCapacity ?? 1) - taken;
    return left > 0 ? [{ kind: "day", date, left }] : [];
  }
  if (s.mode === "fixed_appointment" || s.mode === "mobile_appointment" || s.mode === "package_sessions") {
    return openStartTimes({
      date,
      service: { ...s, mode: s.mode === "mobile_appointment" ? "mobile_appointment" : "fixed_appointment" },
      hours,
      timeZone: org.timezone,
      nowMs,
      resources: data.resources,
      existing: data.existing,
      stepMinutes: data.settings.stepMinutes,
      zip,
      serviceZips: data.settings.serviceZips,
    }).map((t) => ({ kind: "time" as const, ...t }));
  }
  return [];
}

export type BookingRequest = {
  serviceId: string;
  contactId: string;
  leadId?: string | null;
  subjectId?: string | null;
  packageId?: string | null;
  /** Timed modes: the chosen start (ms). Day capacity: `date`. Stays: checkIn/checkOut. */
  startMs?: number;
  date?: string;
  checkIn?: string;
  checkOut?: string;
  unitClass?: string | null;
  zip?: string | null;
  address?: string | null;
  customerNotes?: string | null;
  status?: BookingStatus;
  source: BookingSource;
  userId?: string | null;
};

export type BookingOutcome =
  | { ok: true; bookingId: string; startsAt: string; endsAt: string; status: BookingStatus; approvalReasons: string[] }
  | { ok: false; error: string };

const fail = (r: RuleResult): BookingOutcome => ({ ok: false, error: r.ok ? "Couldn't book that." : `${BLOCK_REASON_TEXT[r.reason]}${r.detail ? ` (${r.detail.replace(/_/g, " ")})` : ""}` });

/**
 * Books a visit: checks every rule for the service's mode (hours, capacity,
 * overlaps, travel, required records, packages), then saves it through
 * book_slot(), which re-checks capacity under a lock.
 */
export async function createBooking(db: AdminClient, org: Org, req: BookingRequest, nowMs = Date.now()): Promise<BookingOutcome> {
  const { data: serviceRow } = await db.from("service_catalog").select("*").eq("id", req.serviceId).eq("org_id", org.id).eq("active", true).maybeSingle();
  if (!serviceRow) return { ok: false, error: "That service isn't available." };
  const today = localDateString(new Date(nowMs), org.timezone);
  const from = req.checkIn ?? req.date ?? (req.startMs ? localDateString(new Date(req.startMs), org.timezone) : today);
  const data = await loadBookingData(db, org, from, req.checkOut ?? from);
  const s = toService(serviceRow, data.settings);
  const hours = openHoursFrom(data.settings);
  if (from > addDays(today, data.settings.maxDaysAhead)) return { ok: false, error: `Bookings open up to ${data.settings.maxDaysAhead} days ahead.` };

  let startsAt: Date;
  let endsAt: Date;
  let serviceDate: string;
  let resourceId: string | null = null;
  let scope: "window" | "day" | "nights" | "resource" | "none" = "none";
  let capacity: number | null = null;
  // Travel between mobile stops is checked by the rules (it depends on both addresses).
  const travelBefore = 0;
  const travelAfter = 0;
  let lastDay: string;

  if (s.mode === "multi_day_reservation") {
    if (!req.checkIn || !req.checkOut) return { ok: false, error: "Pick check-in and check-out dates." };
    const r = checkStay({ checkIn: req.checkIn, checkOut: req.checkOut, today, unitClass: req.unitClass ?? serviceRow.unit_class, resources: data.resources, existing: data.existing, minNights: s.minNights, maxNights: s.maxNights });
    if (!r.ok) return fail(r);
    startsAt = zonedTimeToUtc(req.checkIn, data.settings.openHour, 0, org.timezone);
    endsAt = zonedTimeToUtc(req.checkOut, data.settings.openHour, 0, org.timezone);
    serviceDate = req.checkIn;
    lastDay = req.checkOut;
    scope = "nights";
    capacity = data.resources.filter((x) => x.active && x.unitClass === (req.unitClass ?? serviceRow.unit_class)).reduce((n, x) => n + x.capacity, 0);
  } else if (s.mode === "day_capacity") {
    const date = req.date ?? (req.startMs ? localDateString(new Date(req.startMs), org.timezone) : null);
    if (!date) return { ok: false, error: "Pick a day." };
    if (date < today) return fail({ ok: false, reason: "in_past" });
    if (!isOpenDay(date, hours)) return fail({ ok: false, reason: "closed_day" });
    const r = checkDayCapacity(date, s.id, s.dailyCapacity ?? 1, data.existing);
    if (!r.ok) return fail(r);
    startsAt = zonedTimeToUtc(date, data.settings.openHour, 0, org.timezone);
    endsAt = zonedTimeToUtc(date, data.settings.closeHour, 0, org.timezone);
    serviceDate = lastDay = date;
    scope = "day";
    capacity = s.dailyCapacity ?? 1;
  } else if (s.mode === "recurring") {
    return { ok: false, error: "Repeat service is set up from the Customers screen." };
  } else {
    if (!req.startMs) return { ok: false, error: "Pick a time." };
    startsAt = new Date(req.startMs);
    serviceDate = lastDay = localDateString(startsAt, org.timezone);
    if (s.mode === "arrival_window") {
      const window = arrivalWindows(serviceDate, hours, data.settings.windowMinutes, org.timezone).find((w) => w.startMs === req.startMs);
      if (!window) return { ok: false, error: "Pick one of the arrival windows." };
      endsAt = new Date(window.endMs);
      const base = checkOpenTime({ startMs: window.startMs, endMs: window.endMs, nowMs, timeZone: org.timezone, hours, minNoticeHours: s.minNoticeHours });
      if (!base.ok) return fail(base);
      const r = checkArrivalWindow(window, data.settings.windowCapacity, data.existing);
      if (!r.ok) return fail(r);
      scope = "window";
      capacity = data.settings.windowCapacity;
    } else {
      endsAt = new Date(req.startMs + s.durationMin * 60_000);
      const base = checkOpenTime({ startMs: req.startMs, endMs: endsAt.getTime(), nowMs, timeZone: org.timezone, hours, minNoticeHours: s.minNoticeHours });
      if (!base.ok) return fail(base);
      const slot = { startMs: req.startMs, endMs: endsAt.getTime() };
      const r =
        s.mode === "mobile_appointment"
          ? checkMobileAppointment({ slot, zip: req.zip ?? null, serviceZips: data.settings.serviceZips, resources: data.resources, resourceKind: s.resourceKind, existing: data.existing })
          : checkFixedAppointment(slot, data.resources, data.existing, s.resourceKind);
      if (!r.ok) return fail(r);
      resourceId = r.resourceId ?? null;
      scope = resourceId ? "resource" : "none";
    }
  }

  // Required records (e.g. rabies vaccine) must be valid through the last day.
  let vaccineStatus: "ok" | "expiring" | null = null;
  if (s.requiredDocuments?.length) {
    if (!req.subjectId) return { ok: false, error: "Pick which pet or vehicle this is for, so we can check required records." };
    const { data: docs } = await db
      .from("files")
      .select("document_type, expires_on")
      .eq("org_id", org.id)
      .eq("subject_id", req.subjectId)
      .is("deleted_at", null)
      .not("document_type", "is", null);
    const documents: SubjectDocument[] = (docs ?? []).map((d) => ({ documentType: d.document_type!, expiresOn: d.expires_on }));
    const r = checkDocuments(s.requiredDocuments, documents, lastDay);
    if (!r.ok) return fail(r);
    // Valid for the visit but running out within two weeks after it: worth a look.
    vaccineStatus = checkDocuments(s.requiredDocuments, documents, addDays(lastDay, 14)).ok ? "ok" : "expiring";
  }

  if (req.packageId) {
    const [{ data: pkg }, { count: used }] = await Promise.all([
      db.from("packages").select("*").eq("id", req.packageId).eq("org_id", org.id).eq("contact_id", req.contactId).maybeSingle(),
      db.from("bookings").select("id", { count: "exact", head: true }).eq("package_id", req.packageId).neq("status", "canceled"),
    ]);
    if (!pkg) return { ok: false, error: "Package not found." };
    const p: Package = { id: pkg.id, sessionsTotal: pkg.sessions_total, sessionsUsed: used ?? 0, expiresOn: pkg.expires_on, serviceId: pkg.service_id };
    const r = checkPackage(p, s.id, serviceDate);
    if (!r.ok) return fail(r);
  }

  // Approval rules: bookings from outside the team may wait for the owner's OK.
  let status: BookingStatus = req.status ?? "confirmed";
  let approvalReasons: string[] = [];
  if (req.source !== "owner" && req.source !== "team") {
    const [{ count: pastVisits }, { data: priv }] = await Promise.all([
      db.from("bookings").select("id", { count: "exact", head: true }).eq("org_id", org.id).eq("contact_id", req.contactId).eq("status", "completed"),
      req.subjectId ? db.from("subject_private").select("behavior_notes").eq("subject_id", req.subjectId).eq("org_id", org.id).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    const decision = evaluateApproval(parseApprovalSettings(org.approval_settings), {
      source: req.source,
      isNewCustomer: (pastVisits ?? 0) === 0,
      priceCents: serviceRow.price_from_cents,
      hoursUntilStart: (startsAt.getTime() - nowMs) / 3_600_000,
      zip: req.zip ?? null,
      serviceZips: data.settings.serviceZips,
      // Only a yes/no flag is derived from private notes; the notes never leave the team's screens.
      petBehaviorWarning: hasBehaviorWarning(priv?.behavior_notes),
      vaccineStatus,
    });
    if (decision.needsApproval) {
      status = "pending_approval";
      approvalReasons = decision.reasons;
    }
  }

  const row = {
    org_id: org.id,
    contact_id: req.contactId,
    lead_id: req.leadId ?? null,
    subject_id: req.subjectId ?? null,
    service_id: s.id,
    package_id: req.packageId ?? null,
    resource_id: resourceId,
    mode: s.mode,
    status,
    source: req.source,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    service_date: serviceDate,
    check_in: req.checkIn ?? null,
    check_out: req.checkOut ?? null,
    unit_class: s.mode === "multi_day_reservation" ? (req.unitClass ?? serviceRow.unit_class) : null,
    travel_before_minutes: travelBefore,
    travel_after_minutes: travelAfter,
    service_zip: req.zip ?? null,
    address: req.address ?? null,
    price_cents: serviceRow.price_from_cents,
    customer_notes: req.customerNotes ?? null,
    created_by: req.userId ?? null,
  };
  const { data: id, error } = await db.rpc("book_slot", { p_booking: row, p_capacity_scope: scope, p_capacity: capacity ?? undefined });
  if (error || !id) {
    const msg = error?.message ?? "";
    if (/^FULL/.test(msg)) return { ok: false, error: BLOCK_REASON_TEXT.full };
    if (/^OVERLAP/.test(msg)) return { ok: false, error: "That time was just taken. Pick another." };
    if (/^NO_SESSIONS/.test(msg)) return { ok: false, error: BLOCK_REASON_TEXT.no_sessions_left };
    if (/^PACKAGE_EXPIRED/.test(msg)) return { ok: false, error: BLOCK_REASON_TEXT.package_expired };
    console.error("book_slot failed", error);
    return { ok: false, error: "Couldn't save the booking. Please try again." };
  }
  if (status === "pending_approval") {
    await db.from("approval_requests").insert({
      org_id: org.id,
      kind: "booking",
      booking_id: id,
      lead_id: req.leadId ?? null,
      contact_id: req.contactId,
      reasons: approvalReasons,
    });
  }
  return { ok: true, bookingId: id, startsAt: row.starts_at, endsAt: row.ends_at, status, approvalReasons };
}

/** "Mon, Oct 5, 8–10am" style label for a booking. */
export function bookingWhen(b: { mode: string; starts_at: string; ends_at: string; check_in: string | null; check_out: string | null; service_date: string }, timeZone: string): string {
  const day = (iso: string) => new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone }).format(new Date(iso));
  const time = (iso: string) =>
    new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone }).format(new Date(iso)).replace(":00", "").replace(/\s?([AP])M/, (_m, x: string) => `${x.toLowerCase()}m`);
  const plain = (d: string) => new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));
  if (b.mode === "multi_day_reservation" && b.check_in && b.check_out) return `${plain(b.check_in)} → ${plain(b.check_out)}`;
  if (b.mode === "day_capacity") return `${plain(b.service_date)} (all day)`;
  if (b.mode === "arrival_window") return `${day(b.starts_at)}, arriving ${time(b.starts_at)}–${time(b.ends_at)}`;
  return `${day(b.starts_at)}, ${time(b.starts_at)}`;
}
