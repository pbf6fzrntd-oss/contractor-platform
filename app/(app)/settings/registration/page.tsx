import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { requireOwner } from "@/lib/auth/context";
import { defaultOptIn, defaultUseCase, REGISTRATION_STATUS_TEXT, sampleMessages, type RegistrationInput } from "@/lib/automation/a2p";
import { publicEnv } from "@/lib/env-public";
import { createClient } from "@/lib/supabase/server";
import { RegistrationForm } from "./form";

export const metadata: Metadata = { title: "Carrier registration" };

export default async function RegistrationPage() {
  const { org, userId } = await requireOwner();
  const supabase = await createClient();
  const [{ data: reg }, { data: templates }, { data: profile }] = await Promise.all([
    supabase.from("a2p_registrations").select("*").eq("org_id", org.id).maybeSingle(),
    supabase.from("message_templates").select("key, body").eq("org_id", org.id).eq("language", "en"),
    supabase.from("profiles").select("full_name, email").eq("id", userId).single(),
  ]);
  const status = reg?.status ?? "not_started";
  const savedSamples = Array.isArray(reg?.sample_messages) ? (reg.sample_messages as string[]) : [];

  const initial: RegistrationInput = {
    brand_type: reg?.brand_type === "sole_proprietor" ? "sole_proprietor" : "standard",
    legal_name: reg?.legal_name ?? org.name,
    ein: reg?.ein ?? "",
    business_address: reg?.business_address ?? "",
    website: reg?.website ?? "",
    contact_name: reg?.contact_name ?? profile?.full_name ?? "",
    contact_email: reg?.contact_email ?? profile?.email ?? "",
    contact_phone: reg?.contact_phone ?? org.alert_phone ?? "",
    use_case_description: reg?.use_case_description ?? defaultUseCase(org.name, org.business_type),
    opt_in_description: reg?.opt_in_description ?? defaultOptIn(org.name, publicEnv.siteUrl),
    sample_messages: savedSamples.length ? savedSamples : sampleMessages(templates ?? [], org.name, org.google_review_url),
  };

  return (
    <>
      <PageHeader
        title="Carrier registration"
        subtitle="Phone carriers require every business that texts customers to register. We handle the paperwork."
        backHref="/settings"
      />
      <p
        className={`mb-4 rounded-xl px-3 py-2 text-sm ${
          status === "approved" ? "bg-emerald-50 text-emerald-800" : status === "rejected" ? "bg-red-50 text-red-800" : "bg-slate-100 text-slate-700"
        }`}
      >
        Status: <strong>{REGISTRATION_STATUS_TEXT[status]}</strong>
        {status === "rejected" && reg?.admin_notes ? `. ${reg.admin_notes}` : ""}
      </p>
      {status === "not_started" && (
        <p className="mb-4 text-sm text-slate-600">
          Takes about 5 minutes. Until it&apos;s approved, missed calls and leads are still logged, but texts to customers
          can&apos;t be sent. You can keep testing with the Simulator.
        </p>
      )}
      <RegistrationForm initial={initial} editable={status === "not_started" || status === "rejected"} />
    </>
  );
}
