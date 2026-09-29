import { ScheduledList } from "@/components/scheduled-list";
import { SubmitButton } from "@/components/submit-button";
import type { AppContext } from "@/lib/auth/context";
import type { Tables } from "@/lib/database.types";
import { money } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { cancelFollowUps } from "./actions";
import { JobForm } from "./job-form";

/** Automatic texts for this lead (follow-ups, review request) and job completion. */
export async function LeadExtras({
  ctx,
  lead,
  contact,
}: {
  ctx: AppContext;
  lead: Tables<"leads">;
  contact: Tables<"contacts">;
}) {
  const supabase = await createClient();
  const [{ data: scheduled }, { data: jobs }] = await Promise.all([
    supabase
      .from("scheduled_messages")
      .select("id, kind, template_key, send_at, status, skip_reason")
      .eq("org_id", ctx.org.id)
      .or(`lead_id.eq.${lead.id},and(contact_id.eq.${contact.id},kind.eq.review_request)`)
      .order("send_at")
      .limit(20),
    supabase
      .from("jobs")
      .select("id, completed_on, amount_cents, description")
      .eq("org_id", ctx.org.id)
      .eq("contact_id", contact.id)
      .order("completed_on", { ascending: false })
      .limit(10),
  ]);
  const items = scheduled ?? [];
  const pendingFollowUps = items.some((i) => i.status === "pending" && i.kind === "estimate_followup");
  const dateFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

  return (
    <>
      {items.length > 0 && (
        <section className="card mb-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-600">Automatic texts</h2>
          <ScheduledList items={items} timeZone={ctx.org.timezone} />
          {pendingFollowUps && (
            <form action={cancelFollowUps.bind(null, lead.id)} className="mt-3">
              <SubmitButton className="text-sm font-medium text-red-700" pendingText="Canceling…">
                Cancel remaining follow-ups
              </SubmitButton>
            </form>
          )}
        </section>
      )}

      {(lead.stage === "won" || lead.stage === "estimate_sent" || lead.stage === "contacted") && (
        <section className="card mb-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-600">Jobs</h2>
          {(jobs ?? []).length > 0 && (
            <ul className="mb-3 text-sm">
              {(jobs ?? []).map((j) => (
                <li key={j.id} className="flex justify-between">
                  <span>
                    ✓ {dateFmt.format(new Date(j.completed_on))}
                    {j.description ? ` · ${j.description}` : ""}
                  </span>
                  <span>{money(j.amount_cents)}</span>
                </li>
              ))}
            </ul>
          )}
          {contact.review_requested_at && (
            <p className="mb-2 text-sm text-slate-600">
              ⭐ Review requested {dateFmt.format(new Date(contact.review_requested_at))}
            </p>
          )}
          <JobForm
            leadId={lead.id}
            defaultAmount={lead.estimate_amount_cents ? String(lead.estimate_amount_cents / 100) : ""}
          />
        </section>
      )}
    </>
  );
}
