import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { requireAppContext } from "@/lib/auth/context";
import { stageLabel } from "@/lib/leads/stages";
import { parseSettings } from "@/lib/settings";
import { AutomationsForm } from "./form";

export const metadata: Metadata = { title: "Automations" };

export default async function AutomationsPage() {
  const { org, role } = await requireAppContext();
  const estimateWord = stageLabel(org.business_type, "estimate_sent", org.industry).replace(/ sent$/, "");
  return (
    <>
      <PageHeader title="Automations" subtitle="What gets texted automatically, and when." backHref="/settings" />
      <AutomationsForm
        settings={parseSettings(org.settings)}
        canEdit={role === "owner"}
        isRecurring={org.business_type === "recurring"}
        estimateWord={estimateWord}
      />
    </>
  );
}
