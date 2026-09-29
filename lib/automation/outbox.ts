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
  kind: "estimate_followup" | "review_request" | "broadcast";
  category: MessageCategory;
  context: { estimate_sent_at?: string };
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
};

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
  | "broadcast_canceled";

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
  canceled: "Canceled",
};
