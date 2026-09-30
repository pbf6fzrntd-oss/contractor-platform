import type { BookingMode } from "@/lib/industries/types";

/**
 * The shared booking engine's vocabulary. Every mode's rules are pure
 * functions (lib/booking/rules.ts): data in, decision out. The database then
 * re-checks capacity under a lock when the booking is saved (book_slot()).
 */

export type { BookingMode };

/** Bookings in these states hold their slot (including ones waiting for the owner's approval). */
export const HOLDING_STATUSES = ["requested", "pending_approval", "confirmed", "in_progress"] as const;
export const BOOKING_STATUSES = [...HOLDING_STATUSES, "completed", "canceled", "no_show"] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const BOOKING_SOURCES = ["owner", "team", "customer_link", "ai_assistant", "outside_agent", "voice"] as const;
export type BookingSource = (typeof BOOKING_SOURCES)[number];

/** A booked (or requested) visit, as the rules see it. Times are epoch milliseconds. */
export type ExistingBooking = {
  id: string;
  mode: BookingMode;
  status: BookingStatus;
  startMs: number;
  endMs: number;
  /** Local calendar date of the start (YYYY-MM-DD). */
  date: string;
  serviceId: string | null;
  resourceId: string | null;
  /** Minutes blocked before/after for travel (mobile). */
  travelBeforeMin: number;
  travelAfterMin: number;
  /** Where a mobile visit happens (ZIP code), for travel time. */
  zip: string | null;
  /** Stays: check-in (inclusive) and check-out (exclusive) dates, plus unit class (e.g. "large" run). */
  checkIn: string | null;
  checkOut: string | null;
  unitClass: string | null;
};

export type Service = {
  id: string;
  name: string;
  mode: BookingMode;
  durationMin: number;
  /** arrival_window: window length and how many visits fit in each window. */
  windowMinutes?: number;
  windowCapacity?: number;
  /** day_capacity: jobs per day. */
  dailyCapacity?: number;
  /** Which kind of resource does the work (groomer, bay, technician, van, run...). */
  resourceKind?: string | null;
  /** Documents the customer's pet/vehicle/property must have on file, unexpired. */
  requiredDocuments?: string[];
  /** Minimum hours between now and the visit. */
  minNoticeHours?: number;
  /** Stays: shortest and longest allowed. */
  minNights?: number;
  maxNights?: number;
};

export type Resource = { id: string; name: string; kind: string; unitClass: string | null; capacity: number; active: boolean };

/** When the business works: weekday (0=Sun) -> open/close hours; missing = closed. */
export type OpenHours = Partial<Record<number, { open: number; close: number }>>;

export type SubjectDocument = { documentType: string; expiresOn: string | null };

export type Package = { id: string; sessionsTotal: number; sessionsUsed: number; expiresOn: string | null; serviceId: string | null };

export type BlockReason =
  | "in_past"
  | "short_notice"
  | "closed_day"
  | "outside_hours"
  | "full"
  | "overlap"
  | "travel_buffer"
  | "outside_service_area"
  | "stay_too_short"
  | "stay_too_long"
  | "bad_dates"
  | "missing_document"
  | "expired_document"
  | "no_sessions_left"
  | "package_expired"
  | "package_wrong_service";

export type RuleResult = { ok: true; resourceId?: string | null } | { ok: false; reason: BlockReason; detail?: string };

export const BLOCK_REASON_TEXT: Record<BlockReason, string> = {
  in_past: "That time has already passed.",
  short_notice: "That's too soon. The business needs more notice.",
  closed_day: "The business is closed that day.",
  outside_hours: "That's outside business hours.",
  full: "That time is full.",
  overlap: "That time overlaps another booking.",
  travel_buffer: "There isn't enough travel time between visits.",
  outside_service_area: "That address is outside the service area.",
  stay_too_short: "That stay is shorter than the minimum.",
  stay_too_long: "That stay is longer than the maximum.",
  bad_dates: "Check-out must be after check-in.",
  missing_document: "A required record isn't on file.",
  expired_document: "A required record will be expired by then.",
  no_sessions_left: "There are no sessions left in the package.",
  package_expired: "The package has expired.",
  package_wrong_service: "That package is for a different service.",
};
