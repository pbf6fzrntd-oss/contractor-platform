import { automatedSendWindow, SERVICE_NOTICE_WINDOW } from "@/lib/automation/compliance";
import type { OrgSettings } from "@/lib/settings";
import type { MessageCategory } from "@/lib/templates/defaults";
import { isWithinWindow, nextTimeInWindow } from "@/lib/time";

/**
 * The last check before a scheduled text goes out. Things change after a
 * text is scheduled (the customer replies, the job is won, they opt out), so
 * we never trust the schedule alone: everything is re-checked right here.
 */

export type OutboxItem = {
  kind: "estimate_followup" | "review_request" | "broadcast" | "booking_reminder" | "vaccine_reminder" | "module_notice";
  category: MessageCategory;
  context: {
    estimate_sent_at?: string;
    booking_id?: string;
    starts_at?: string;
    file_id?: string;
    /** module_notice: the text to send, and what must still be true right before sending. */
    body_en?: string;
    body_es?: string;
    guard?: ModuleNoticeGuard;
  };
};

export type OutboxState = {
  now: Date;
  timezone: string;
  settings: OrgSettings;
  contact: {
    opted_out_at: string | null;
    marketing_consent_at: string | null;
    do_not_autotext: boolean;
    review_requested_at: string | null;
  } | null;
  lead: { stage: string; estimate_sent_at: string | null } | null;
  /** When the contact last texted the business. */
  lastInboundAt: string | null;
  hasReviewLink: boolean;
  broadcastStatus: string | null;
  /** For booking reminders: the booking as it is now. */
  booking?: { status: string; starts_at: string } | null;
  /** For vaccine reminders: is the record still the latest one on file (not deleted or replaced)? */
  documentCurrent?: boolean;
  /** For module notices: is the guard condition still true? */
  guardOk?: boolean;
};

/**
 * A module text's condition: row `id` in the module's table still has
 * `column` = `equals` (e.g. an agreement's end date hasn't changed).
 */
export type ModuleNoticeGuard = { table: string; id: string; column: string; equals: string | number | boolean };

/** Module tables start with a short module prefix (rh_, pc_, au_, pq_). Anything else is refused. */
export function isModuleTable(name: string): boolean {
  return /^(rh|pc|au|pq)_[a-z_]{2,40}$/.test(name);
}

export type SkipReason =
  | "contact_missing"
  | "opted_out"
  | "no_marketing_consent"
  | "do_not_autotext"
  | "followups_disabled"
  | "lead_missing"
  | "stage_changed"
  | "estimate_resent"
  | "customer_replied"
  | "reviews_disabled"
  | "already_requested"
  | "no_review_link"
  | "broadcast_canceled"
  | "booking_changed"
  | "booking_passed"
  | "record_updated"
  | "no_longer_needed";

export type OutboxDecision =
  | { action: "send" }
  | { action: "skip"; reason: SkipReason }
  | { action: "defer"; until: Date };

const ms = (iso: string | null | undefined) => (iso ? Date.parse(iso) : NaN);

export function evaluateScheduledMessage(item: OutboxItem, state: OutboxState): OutboxDecision {
  const { contact, settings } = state;
  if (!contact) return { action: "skip", reason: "contact_missing" };
  if (contact.opted_out_at) return { action: "skip", reason: "opted_out" };
  if (item.category === "marketing" && !contact.marketing_consent_at) {
    return { action: "skip", reason: "no_marketing_consent" };
  }

  if (item.kind === "estimate_followup") {
    if (!settings.followUpsEnabled) return { action: "skip", reason: "followups_disabled" };
    if (contact.do_not_autotext) return { action: "skip", reason: "do_not_autotext" };
    if (!state.lead) return { action: "skip", reason: "lead_missing" };
    if (state.lead.stage !== "estimate_sent") return { action: "skip", reason: "stage_changed" };
    const scheduledFor = ms(item.context.estimate_sent_at);
    if (!Number.isNaN(scheduledFor) && ms(state.lead.estimate_sent_at) !== scheduledFor) {
      return { action: "skip", reason: "estimate_resent" };
    }
    if (settings.stopFollowUpsOnReply && state.lastInboundAt && ms(state.lastInboundAt) > scheduledFor) {
      return { action: "skip", reason: "customer_replied" };
    }
  }

  if (item.kind === "review_request") {
    if (!settings.reviewsEnabled) return { action: "skip", reason: "reviews_disabled" };
    if (contact.do_not_autotext) return { action: "skip", reason: "do_not_autotext" };
    if (contact.review_requested_at) return { action: "skip", reason: "already_requested" };
    if (!state.hasReviewLink) return { action: "skip", reason: "no_review_link" };
  }

  if (item.kind === "booking_reminder") {
    if (contact.do_not_autotext) return { action: "skip", reason: "do_not_autotext" };
    const b = state.booking;
    // Canceled, moved or no longer confirmed since the reminder was queued: don't send.
    if (!b || b.status !== "confirmed" || ms(b.starts_at) !== ms(item.context.starts_at)) return { action: "skip", reason: "booking_changed" };
    if (ms(b.starts_at) <= state.now.getTime()) return { action: "skip", reason: "booking_passed" };
  }

  if (item.kind === "module_notice") {
    if (contact.do_not_autotext) return { action: "skip", reason: "do_not_autotext" };
    if (!item.context.body_en) return { action: "skip", reason: "no_longer_needed" };
    if (item.context.guard && !state.guardOk) return { action: "skip", reason: "no_longer_needed" };
  }

  if (item.kind === "vaccine_reminder") {
    if (contact.do_not_autotext) return { action: "skip", reason: "do_not_autotext" };
    // The customer already sent a new record (or it was removed): nothing to remind about.
    if (!state.documentCurrent) return { action: "skip", reason: "record_updated" };
  }

  if (item.kind === "broadcast" && state.broadcastStatus === "canceled") {
    return { action: "skip", reason: "broadcast_canceled" };
  }

  // Owner-sent service notices (rain delays) may go out early; other updates wait for business hours.
  const window =
    item.kind === "broadcast" && item.category === "informational"
      ? SERVICE_NOTICE_WINDOW
      : automatedSendWindow(item.category, settings);
  if (window && !isWithinWindow(state.now, state.timezone, window)) {
    return { action: "defer", until: nextTimeInWindow(state.now, state.timezone, window) };
  }
  return { action: "send" };
}

/** Plain-English reasons shown next to skipped texts. */
export const SKIP_REASON_TEXT: Record<string, string> = {
  contact_missing: "Contact was deleted",
  opted_out: "Customer opted out",
  no_marketing_consent: "No marketing consent on file",
  do_not_autotext: "Contact is marked “never auto-text”",
  followups_disabled: "Follow-ups are turned off",
  lead_missing: "Lead was deleted",
  stage_changed: "Lead moved out of the estimate stage",
  estimate_resent: "A newer estimate replaced this one",
  customer_replied: "Customer replied, so follow-ups stopped",
  reviews_disabled: "Review requests are turned off",
  already_requested: "Already asked for a review",
  no_review_link: "No Google review link in Settings",
  broadcast_canceled: "Send was canceled",
  booking_changed: "Booking was canceled or moved",
  booking_passed: "The visit already started",
  record_updated: "A newer record is on file",
  no_longer_needed: "No longer needed (it was changed or canceled)",
  canceled: "Canceled",
};
