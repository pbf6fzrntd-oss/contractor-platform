import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { SubmitButton } from "@/components/submit-button";
import { requireAppContext } from "@/lib/auth/context";
import { CREDENTIAL_KIND_LABEL, credentialStatus, type CredentialKind } from "@/lib/credentials";
import { getIndustry } from "@/lib/industries";
import { createClient } from "@/lib/supabase/server";
import { localDateString } from "@/lib/time";
import { deleteCredential, toggleCredentialOnProfile } from "./actions";
import { AddCredentialForm } from "./form";

export const metadata: Metadata = { title: "Licenses & insurance" };

export default async function LicensesPage() {
  const { org, role } = await requireAppContext();
  const { data: creds } = await (await createClient())
    .from("business_credentials")
    .select("*")
    .eq("org_id", org.id)
    .order("created_at");
  const today = localDateString(new Date(), org.timezone);
  const industry = getIndustry(org.industry);
  const have = new Set((creds ?? []).map((c) => c.label));
  const suggestions = (industry?.credentials ?? []).filter((c) => !have.has(c.label)).map((c) => ({ kind: c.kind, label: c.label, note: c.note }));

  return (
    <>
      <PageHeader
        title="Licenses & insurance"
        subtitle="Show customers (and AI assistants that recommend businesses) that you're licensed and insured. Checked ones appear on your public profile."
        backHref="/settings"
      />
      {(creds ?? []).length === 0 ? (
        <p className="card mb-4 text-sm text-slate-600">Nothing added yet.</p>
      ) : (
        <ul className="card mb-4 divide-y divide-slate-100 p-0">
          {(creds ?? []).map((c) => {
            const status = credentialStatus(c.expires_on, today);
            return (
              <li key={c.id} className="flex items-start justify-between gap-3 px-4 py-3">
                <span className="min-w-0">
                  <span className="block font-medium">{c.label}</span>
                  <span className="block text-sm text-slate-600">
                    {CREDENTIAL_KIND_LABEL[c.kind as CredentialKind]}
                    {c.number ? ` · #${c.number}` : ""}
                    {c.issuer ? ` · ${c.issuer}` : ""}
                  </span>
                  {c.expires_on && (
                    <span className={`block text-sm ${status === "ok" ? "text-slate-500" : "font-semibold text-red-700"}`}>
                      {status === "expired" ? "Expired" : status === "expiring" ? "Expires soon" : "Expires"} {c.expires_on}
                      {status === "expired" ? " (hidden from your profile until renewed)" : ""}
                    </span>
                  )}
                  <span className="block text-xs text-slate-500">{c.show_on_profile ? "On your public profile" : "Private"}</span>
                </span>
                {role === "owner" && (
                  <span className="flex shrink-0 flex-col gap-1">
                    <form action={toggleCredentialOnProfile.bind(null, c.id, !c.show_on_profile)}>
                      <SubmitButton className="btn-secondary min-h-10 w-full px-3 text-xs" pendingText="…">
                        {c.show_on_profile ? "Hide" : "Show"}
                      </SubmitButton>
                    </form>
                    <form action={deleteCredential.bind(null, c.id)}>
                      <SubmitButton className="btn-danger min-h-10 w-full px-3 text-xs" pendingText="…">Remove</SubmitButton>
                    </form>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {role === "owner" ? (
        <AddCredentialForm suggestions={suggestions} />
      ) : (
        <p className="hint">Only the owner can change licenses and insurance.</p>
      )}
      <p className="mt-4 text-xs text-slate-500">Requirements change. Check with SC LLR, Clemson DPR or your insurer for what applies to you.</p>
    </>
  );
}
