import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { parseApprovalSettings, rulesFor } from "@/lib/approvals/rules";
import { requireOwner } from "@/lib/auth/context";
import { getIndustry } from "@/lib/industries";
import { ApprovalRulesForm } from "./form";

export const metadata: Metadata = { title: "Approval rules" };

export default async function ApprovalRulesPage() {
  const { org, modules } = await requireOwner();
  const industryModule = getIndustry(org.industry)?.module;
  const rules = rulesFor([...modules, ...(industryModule ? [industryModule] : [])]);
  return (
    <>
      <PageHeader
        title="Approval rules"
        subtitle="Which bookings wait for your OK before they're confirmed. Waiting bookings show at the top of the Schedule, and the customer gets a text when you decide."
        backHref="/settings"
      />
      <ApprovalRulesForm rules={rules} settings={parseApprovalSettings(org.approval_settings)} />
      <p className="mt-3 text-sm text-slate-600">Bookings you or your team make are never held for approval.</p>
    </>
  );
}
