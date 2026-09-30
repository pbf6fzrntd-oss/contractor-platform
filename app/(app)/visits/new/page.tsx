import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { requireModule } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { localDateString } from "@/lib/time";
import { MODULE_ID } from "@/modules/recurring-home/agreements";
import { contactName } from "@/modules/recurring-home/queries";
import { reportFields } from "@/modules/recurring-home/rules/visit-report";
import { saveVisit } from "../actions";
import { VisitForm } from "../form";

export const metadata: Metadata = { title: "Visit report" };

export default async function NewVisitPage({ searchParams }: PageProps<"/visits/new">) {
  const { org } = await requireModule(MODULE_ID);
  const sp = await searchParams;
  const serviceId = typeof sp.service === "string" ? sp.service : "";
  const date = typeof sp.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : localDateString(new Date(), org.timezone);
  const supabase = await createClient();
  const { data: service } = await supabase.from("recurring_services").select("id, contact_id, service_type").eq("id", serviceId).eq("org_id", org.id).maybeSingle();
  if (!service) notFound();
  const [{ data: contact }, { data: job }] = await Promise.all([
    supabase.from("contacts").select("name, phone, preferred_language, address").eq("id", service.contact_id).single(),
    supabase.from("jobs").select("id").eq("recurring_service_id", service.id).eq("completed_on", date).limit(1).maybeSingle(),
  ]);
  const { data: existing } = job ? await supabase.from("rh_visit_reports").select("*").eq("job_id", job.id).maybeSingle() : { data: null };
  const day = new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });

  return (
    <>
      <PageHeader title={contactName(contact)} subtitle={`${service.service_type} · ${day}${contact?.address ? ` · ${contact.address}` : ""}`} backHref={`/today?date=${date}`} />
      <VisitForm
        action={saveVisit.bind(null, service.id, date)}
        fields={reportFields(org.industry)}
        defaults={{
          values: (existing?.report as Record<string, boolean | number | string>) ?? {},
          customerNote: existing?.customer_note ?? "",
          privateNote: existing?.private_note ?? "",
          textCustomer: existing ? existing.text_customer : true,
        }}
        business={org.name}
        service={service.service_type}
        lang={contact?.preferred_language === "es" ? "es" : "en"}
        alreadyTexted={Boolean(existing?.texted_at)}
      />
    </>
  );
}
