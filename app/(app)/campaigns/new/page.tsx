import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { requireAppContext } from "@/lib/auth/context";
import { CAMPAIGN_TEMPLATES } from "@/lib/automation/campaigns";
import { previewCampaign, loadRecipientData } from "@/lib/services/broadcasts";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { localDateString } from "@/lib/time";
import { CampaignForm } from "./campaign-form";

export const metadata: Metadata = { title: "New campaign" };

const list = (v: string | string[] | undefined) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

export default async function NewCampaignPage({ searchParams }: PageProps<"/campaigns/new">) {
  const { org } = await requireAppContext("/campaigns");
  const params = await searchParams;
  const template = CAMPAIGN_TEMPLATES.find((t) => t.key === params.template) ?? CAMPAIGN_TEMPLATES[0];
  const statuses = list(params.status).filter((s) => s === "active" || s === "past") as ("active" | "past")[];
  const effectiveStatuses: ("active" | "past")[] = params.status === undefined ? ["active"] : statuses;
  const serviceTypes = list(params.type);
  const today = localDateString(new Date(), org.timezone);

  const db = createAdminClient();
  const [selection, data] = await Promise.all([
    previewCampaign(db, org.id, { statuses: effectiveStatuses, serviceTypes }, today),
    loadRecipientData(db, org.id),
  ]);
  const allServiceTypes = [...new Set(data.services.map((s) => s.service_type))].sort();

  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("message_templates")
    .select("language, body")
    .eq("org_id", org.id)
    .eq("key", template.key);
  const season = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: org.timezone }).format(new Date());

  return (
    <>
      <PageHeader title="New campaign" backHref="/campaigns" />
      <CampaignForm
        key={template.key}
        templateKey={template.key}
        templates={[...CAMPAIGN_TEMPLATES]}
        initialName={`${template.label}: ${season}`}
        initialEn={rows?.find((r) => r.language === "en")?.body ?? ""}
        initialEs={rows?.find((r) => r.language === "es")?.body ?? ""}
        statuses={effectiveStatuses}
        serviceTypes={serviceTypes}
        allServiceTypes={allServiceTypes}
        counts={{
          recipients: selection.recipients.length,
          spanish: selection.recipients.filter((r) => r.language === "es").length,
          noConsent: selection.excluded.no_marketing_consent,
          optedOut: selection.excluded.opted_out,
        }}
        businessName={org.name}
        today={today}
      />
    </>
  );
}
