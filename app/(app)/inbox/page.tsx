import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";
import { PageHeader } from "@/components/page-header";
import { requireAppContext } from "@/lib/auth/context";
import { LEAD_STAGES, stageLabel } from "@/lib/leads/stages";

export const metadata: Metadata = { title: "Inbox" };

export default async function InboxPage() {
  const { org } = await requireAppContext("/inbox");

  return (
    <>
      <PageHeader title="Inbox" subtitle="Every call and text from potential customers, in one place." />
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {LEAD_STAGES.map((stage) => (
          <span key={stage} className="shrink-0 rounded-full bg-white px-3 py-1.5 text-sm text-slate-700 ring-1 ring-slate-200">
            {stageLabel(org.business_type, stage)}
          </span>
        ))}
      </div>
      <ComingSoon milestone="Milestone 2">
        Missed calls and texts will show up here as leads you can reply to.
      </ComingSoon>
    </>
  );
}
