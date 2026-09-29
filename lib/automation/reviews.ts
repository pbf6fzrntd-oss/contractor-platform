import type { OrgSettings } from "@/lib/settings";
import { nextTimeInWindow } from "@/lib/time";

/**
 * Should finishing this job trigger a Google review request, and when?
 * - Each customer is asked at most once, ever.
 * - One-off jobs: after every first completed job.
 * - Recurring customers: once, after their Nth visit (default 3rd), not after every mow.
 * - Sent a few hours after the job (default 2), during business hours.
 */
export type ReviewPlan =
  | { schedule: true; sendAt: Date }
  | {
      schedule: false;
      reason: "reviews_disabled" | "already_requested" | "already_scheduled" | "opted_out" | "do_not_autotext" | "no_review_link" | "not_enough_visits";
    };

export function planReviewRequest(input: {
  completedAt: Date;
  settings: OrgSettings;
  timezone: string;
  contact: { review_requested_at: string | null; opted_out_at: string | null; do_not_autotext: boolean };
  hasReviewLink: boolean;
  hasPendingReview: boolean;
  /** For recurring service visits: how many visits so far, including this one. Null for one-off jobs. */
  visitCount: number | null;
}): ReviewPlan {
  const { settings, contact } = input;
  if (!settings.reviewsEnabled) return { schedule: false, reason: "reviews_disabled" };
  if (contact.review_requested_at) return { schedule: false, reason: "already_requested" };
  if (input.hasPendingReview) return { schedule: false, reason: "already_scheduled" };
  if (contact.opted_out_at) return { schedule: false, reason: "opted_out" };
  if (contact.do_not_autotext) return { schedule: false, reason: "do_not_autotext" };
  if (!input.hasReviewLink) return { schedule: false, reason: "no_review_link" };
  if (input.visitCount !== null && input.visitCount < settings.reviewAfterVisits) {
    return { schedule: false, reason: "not_enough_visits" };
  }
  const target = new Date(input.completedAt.getTime() + settings.reviewDelayHours * 3_600_000);
  const sendAt = nextTimeInWindow(target, input.timezone, {
    start: settings.businessHoursStart,
    end: settings.businessHoursEnd,
  });
  return { schedule: true, sendAt };
}

export const REVIEW_REASON_TEXT: Record<string, string> = {
  reviews_disabled: "Review requests are turned off in Settings → Automations.",
  already_requested: "This customer was already asked for a review.",
  already_scheduled: "A review request is already scheduled.",
  opted_out: "Customer opted out of texts.",
  do_not_autotext: "Contact is marked “never auto-text”.",
  no_review_link: "Add your Google review link in Settings → Business details to send review requests.",
  not_enough_visits: "Review request goes out after a few more visits.",
};
