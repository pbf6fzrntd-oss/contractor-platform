import "server-only";
import { planReviewRequest, type ReviewPlan } from "@/lib/automation/reviews";
import type { Json } from "@/lib/database.types";
import { parseSettings } from "@/lib/settings";
import type { AdminClient } from "@/lib/supabase/admin";
import { localDateString } from "@/lib/time";

/**
 * Records a finished job (or recurring visit) and schedules the review request
 * if this customer should get one.
 */
export async function recordJobCompleted(
  db: AdminClient,
  orgId: string,
  input: {
    contactId: string;
    leadId?: string | null;
    recurringServiceId?: string | null;
    description?: string | null;
    amountCents?: number | null;
    completedOn?: string;
    userId?: string | null;
    now?: Date;
  },
): Promise<{ jobId: string; review: ReviewPlan }> {
  const now = input.now ?? new Date();
  const { data: org } = await db.from("organizations").select("timezone, settings, google_review_url").eq("id", orgId).single();
  if (!org) throw new Error("Organization not found");

  const { data: job, error } = await db
    .from("jobs")
    .insert({
      org_id: orgId,
      contact_id: input.contactId,
      lead_id: input.leadId ?? null,
      recurring_service_id: input.recurringServiceId ?? null,
      description: input.description ?? null,
      amount_cents: input.amountCents ?? null,
      completed_on: input.completedOn ?? localDateString(now, org.timezone),
      completed_at: now.toISOString(),
      created_by: input.userId ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;

  const review = await maybeScheduleReview(db, orgId, {
    contactId: input.contactId,
    jobId: job.id,
    leadId: input.leadId ?? null,
    recurring: Boolean(input.recurringServiceId),
    now,
    org,
  });
  return { jobId: job.id, review };
}

async function maybeScheduleReview(
  db: AdminClient,
  orgId: string,
  input: {
    contactId: string;
    jobId: string;
    leadId: string | null;
    recurring: boolean;
    now: Date;
    org: { timezone: string; settings: Json; google_review_url: string | null };
  },
): Promise<ReviewPlan> {
  const [{ data: contact }, { count: pending }, visits] = await Promise.all([
    db.from("contacts").select("review_requested_at, opted_out_at, do_not_autotext").eq("id", input.contactId).single(),
    db
      .from("scheduled_messages")
      .select("id", { count: "exact", head: true })
      .eq("contact_id", input.contactId)
      .eq("kind", "review_request")
      .in("status", ["pending", "processing"]),
    input.recurring
      ? db
          .from("jobs")
          .select("id", { count: "exact", head: true })
          .eq("contact_id", input.contactId)
          .not("recurring_service_id", "is", null)
      : Promise.resolve({ count: null }),
  ]);

  const plan = planReviewRequest({
    completedAt: input.now,
    settings: parseSettings(input.org.settings),
    timezone: input.org.timezone,
    contact: contact!,
    hasReviewLink: Boolean(input.org.google_review_url),
    hasPendingReview: (pending ?? 0) > 0,
    visitCount: input.recurring ? (visits.count ?? 0) : null,
  });

  if (plan.schedule) {
    await db.from("scheduled_messages").insert({
      org_id: orgId,
      contact_id: input.contactId,
      lead_id: input.leadId,
      job_id: input.jobId,
      kind: "review_request",
      template_key: "review_request",
      category: "informational",
      send_at: plan.sendAt.toISOString(),
    });
  }
  return plan;
}
