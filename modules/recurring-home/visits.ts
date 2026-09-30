import "server-only";
import type { Tables } from "@/lib/database.types";
import type { Org } from "@/lib/org";
import { recordJobCompleted } from "@/lib/services/jobs";
import { runDispatch } from "@/lib/services/outbox";
import { storeUpload } from "@/lib/services/subjects";
import type { AdminClient } from "@/lib/supabase/admin";
import { MODULE_ID } from "./agreements";
import { outOfRange, reportFields, serviceCompleteText, summarizeReport, type ReportValues } from "./rules/visit-report";

export type VisitInput = {
  recurringServiceId: string;
  date: string;
  values: ReportValues;
  customerNote: string | null;
  privateNote: string | null;
  textCustomer: boolean;
  photos: File[];
  userId: string | null;
};

/**
 * Saves a visit report: marks the visit done (creating the job, which also
 * schedules the review request when it's due), stores the checklist and notes,
 * saves photos privately, and queues the "service complete" text if asked.
 * The caller has already checked the user belongs to `org`.
 */
export async function saveVisitReport(
  db: AdminClient,
  org: Pick<Org, "id" | "name" | "industry">,
  input: VisitInput,
): Promise<{ ok: true; jobId: string; warnings: string[]; texted: "sent" | "queued" | "no" } | { ok: false; error: string }> {
  const { data: service } = await db.from("recurring_services").select("id, contact_id, service_type").eq("id", input.recurringServiceId).eq("org_id", org.id).maybeSingle();
  if (!service) return { ok: false, error: "Customer not found." };

  const { data: existingJob } = await db.from("jobs").select("id").eq("org_id", org.id).eq("recurring_service_id", service.id).eq("completed_on", input.date).limit(1).maybeSingle();
  const jobId = existingJob?.id ?? (await recordJobCompleted(db, org.id, { contactId: service.contact_id, recurringServiceId: service.id, completedOn: input.date, userId: input.userId })).jobId;

  const { data: previous } = await db.from("rh_visit_reports").select("id, texted_at").eq("job_id", jobId).maybeSingle();
  const { data: report, error } = await db
    .from("rh_visit_reports")
    .upsert(
      {
        org_id: org.id,
        job_id: jobId,
        contact_id: service.contact_id,
        recurring_service_id: service.id,
        report: input.values,
        customer_note: input.customerNote,
        private_note: input.privateNote,
        text_customer: input.textCustomer,
        created_by: input.userId,
      },
      { onConflict: "job_id" },
    )
    .select("id")
    .single();
  if (error || !report) return { ok: false, error: "Couldn't save the report. Please try again." };

  for (const photo of input.photos.slice(0, 6)) {
    if (photo.size) await storeUpload(db, { orgId: org.id, contactId: service.contact_id, subjectId: null, kind: "photo", file: photo, userId: input.userId, jobId });
  }

  const fields = reportFields(org.industry);
  let texted: "sent" | "queued" | "no" = "no";
  if (input.textCustomer && !previous?.texted_at) {
    const { data: queued } = await db
      .from("scheduled_messages")
      .insert({
        org_id: org.id,
        contact_id: service.contact_id,
        job_id: jobId,
        kind: "module_notice",
        category: "informational",
        send_at: new Date().toISOString(),
        context: {
          module: MODULE_ID,
          purpose: "service_complete",
          body_en: serviceCompleteText("en", org.name, service.service_type, summarizeReport(fields, input.values, "en"), input.customerNote),
          body_es: serviceCompleteText("es", org.name, service.service_type, summarizeReport(fields, input.values, "es"), input.customerNote),
          guard: { table: "rh_visit_reports", id: report.id, column: "text_customer", equals: true },
        },
      })
      .select("id")
      .single();
    if (queued) {
      await db.from("rh_visit_reports").update({ texted_at: new Date().toISOString() }).eq("id", report.id);
      // Send right away when it's within business hours; otherwise it waits in the outbox until morning.
      const summary = await runDispatch(db, { scheduledIds: [queued.id] });
      texted = summary.sent ? "sent" : "queued";
    }
  }
  return { ok: true, jobId, warnings: outOfRange(fields, input.values), texted };
}

export type VisitReportView = Tables<"rh_visit_reports">;
