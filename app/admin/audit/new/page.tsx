import type { Metadata } from "next";
import { NewAuditForm } from "./form";
import { CALL_QUESTIONS } from "@/lib/audit/checks";
import { industriesByModule } from "@/lib/industries";

export const metadata: Metadata = { title: "New audit" };

export default function NewAuditPage() {
  const groups = industriesByModule().map((g) => ({
    label: g.label,
    industries: g.industries.map((i) => ({ key: i.key, label: `${i.label}${i.status === "coming_soon" ? " (module coming)" : ""}` })),
  }));
  return (
    <>
      <h1 className="mb-1 text-2xl font-bold">New agent-readiness audit</h1>
      <p className="mb-4 text-sm text-slate-600">
        Enter the prospect&apos;s website and answer what you learn on the call. We check the site automatically; anything you
        don&apos;t know can be filled in later.
      </p>
      <NewAuditForm groups={groups} questions={CALL_QUESTIONS.map((q) => ({ key: q.key, label: q.label }))} />
    </>
  );
}
