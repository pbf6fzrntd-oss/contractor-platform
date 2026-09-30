import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { requireModule } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { localDateString } from "@/lib/time";
import { MODULE_ID } from "@/modules/recurring-home/agreements";
import { agreementCustomers } from "@/modules/recurring-home/queries";
import { agreementPresets } from "@/modules/recurring-home/rules/agreements";
import { saveAgreement } from "../actions";
import { AgreementForm } from "../form";

export const metadata: Metadata = { title: "New agreement" };

export default async function NewAgreementPage({ searchParams }: PageProps<"/agreements/new">) {
  const { org } = await requireModule(MODULE_ID, "/agreements");
  const sp = await searchParams;
  const customers = await agreementCustomers(await createClient(), org.id);
  const pick = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const chosen = customers.find((c) => c.serviceId === pick("service")) ?? customers.find((c) => c.contactId === pick("contact"));
  const first = agreementPresets(org.industry)[0];

  return (
    <>
      <PageHeader title="New agreement" backHref="/agreements" />
      {customers.length === 0 ? (
        <p className="card text-slate-600">Add your customers first (Customers → Add or Import), then add their agreements here.</p>
      ) : (
        <AgreementForm
          action={saveAgreement.bind(null, null)}
          customers={customers}
          presets={agreementPresets(org.industry)}
          defaults={{
            contact_id: chosen?.contactId,
            recurring_service_id: chosen?.serviceId,
            starts_on: localDateString(new Date(), org.timezone),
            name: first.name,
            kind: first.kind,
            billing: first.billing,
            term_months: first.termMonths,
            renewal_notice_days: first.noticeDays,
            auto_renew: first.autoRenew,
          }}
          submitLabel="Save agreement"
        />
      )}
    </>
  );
}
