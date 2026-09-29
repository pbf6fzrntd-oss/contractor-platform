import { ScheduledList } from "@/components/scheduled-list";
import { SubmitButton } from "@/components/submit-button";
import type { AppContext } from "@/lib/auth/context";
import type { Tables } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";
import { cancelFollowUps } from "./actions";

/** Automatic texts for this lead (follow-ups) and, from Milestone 4, job completion. */
export async function LeadExtras({
  ctx,
  lead,
}: {
  ctx: AppContext;
  lead: Tables<"leads">;
  contact: Tables<"contacts">;
}) {
  const supabase = await createClient();
  const { data: scheduled } = await supabase
    .from("scheduled_messages")
    .select("id, kind, template_key, send_at, status, skip_reason")
    .eq("org_id", ctx.org.id)
    .eq("lead_id", lead.id)
    .order("send_at")
    .limit(20);
  const items = scheduled ?? [];
  const pendingFollowUps = items.some((i) => i.status === "pending" && i.kind === "estimate_followup");

  if (items.length === 0) return null;
  return (
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
  );
}
