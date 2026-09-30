import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { formatUSPhone } from "@/lib/phone";
import { createAdminClient } from "@/lib/supabase/admin";
import { SubmitButton } from "@/components/submit-button";
import { industriesByModule, MODULE_LABELS } from "@/lib/industries";
import { MODULE_IDS } from "@/lib/industries/types";
import { assignNumber, setOrgModule, updateAccount, updateOrgIndustry, updateRegistration } from "../actions";

export const metadata: Metadata = { title: "Admin · Business" };

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="grid grid-cols-3 gap-2 py-1 text-sm">
      <dt className="text-slate-500">{label}</dt>
      <dd className="col-span-2 whitespace-pre-wrap break-words select-all">{value || "—"}</dd>
    </div>
  );
}

export default async function AdminOrgPage({ params }: PageProps<"/admin/[orgId]">) {
  const { orgId } = await params;
  const db = createAdminClient();
  const { data: org } = await db.from("organizations").select("*").eq("id", orgId).maybeSingle();
  if (!org) notFound();
  const [{ data: reg }, { data: phone }, { data: sub }, { data: plans }, { data: members }, { data: orgModules }, { data: catalog }] = await Promise.all([
    db.from("a2p_registrations").select("*").eq("org_id", orgId).maybeSingle(),
    db.from("phone_numbers").select("*").eq("org_id", orgId).maybeSingle(),
    db.from("subscriptions").select("*").eq("org_id", orgId).maybeSingle(),
    db.from("plans").select("id, name").order("sort_order"),
    db.from("memberships").select("user_id, role").eq("org_id", orgId),
    db.from("org_modules").select("module, enabled, source").eq("org_id", orgId),
    db.from("addon_catalog").select("key, name, status").order("sort_order"),
  ]);
  const moduleKeys = ["home_services", ...(catalog ?? []).map((c) => c.key)];
  const moduleName = (k: string) => (catalog ?? []).find((c) => c.key === k)?.name ?? MODULE_LABELS[k as keyof typeof MODULE_LABELS] ?? k;
  const { data: people } = await db.from("profiles").select("id, full_name, email").in("id", (members ?? []).map((m) => m.user_id));
  const samples = Array.isArray(reg?.sample_messages) ? (reg.sample_messages as string[]) : [];

  return (
    <>
      <h1 className="text-2xl font-bold">{org.name}</h1>
      <p className="mb-4 text-sm text-slate-600">
        {org.business_type === "recurring" ? "Lawn care" : "Project trade"} · {(people ?? []).map((p) => `${p.full_name ?? ""} <${p.email}>`).join(", ")}
      </p>

      <section className="card mb-4">
        <h2 className="mb-2 font-semibold">Carrier registration details (copy into Twilio)</h2>
        <dl>
          <Row label="Status" value={reg?.status} />
          <Row label="Brand type" value={reg?.brand_type === "sole_proprietor" ? "Sole proprietor" : "Standard (EIN)"} />
          <Row label="Legal name" value={reg?.legal_name} />
          <Row label="EIN" value={reg?.ein} />
          <Row label="Address" value={reg?.business_address} />
          <Row label="Website" value={reg?.website} />
          <Row label="Contact" value={[reg?.contact_name, reg?.contact_email, reg?.contact_phone].filter(Boolean).join(" · ")} />
          <Row label="Use case" value={org.business_type === "recurring" ? "Mixed (customer care + marketing)" : "Mixed (customer care + account notifications)"} />
          <Row label="Description" value={reg?.use_case_description} />
          <Row label="Opt-in" value={reg?.opt_in_description} />
          {samples.map((s, i) => <Row key={i} label={`Sample ${i + 1}`} value={s} />)}
        </dl>
      </section>

      <section className="card mb-4">
        <h2 className="mb-2 font-semibold">Update registration</h2>
        <ActionForm action={updateRegistration.bind(null, orgId)}>
          <select name="status" defaultValue={reg?.status ?? "not_started"} className="input">
            {["not_started", "submitted", "in_review", "approved", "rejected"].map((s) => <option key={s}>{s}</option>)}
          </select>
          <input name="twilio_brand_sid" defaultValue={reg?.twilio_brand_sid ?? ""} placeholder="Brand SID (BN...)" className="input" />
          <input name="twilio_campaign_sid" defaultValue={reg?.twilio_campaign_sid ?? ""} placeholder="Campaign SID (CM...)" className="input" />
          <input name="messaging_service_sid" defaultValue={phone?.messaging_service_sid ?? ""} placeholder="Messaging Service SID (MG...)" className="input" />
          <textarea name="admin_notes" defaultValue={reg?.admin_notes ?? ""} placeholder="Notes (shown to the owner if rejected)" rows={3} className="input py-2" />
        </ActionForm>
      </section>

      <section className="card mb-4">
        <h2 className="mb-2 font-semibold">Phone number</h2>
        {phone ? (
          <p className="text-sm">
            {formatUSPhone(phone.e164)} · {phone.provider} · {phone.setup_mode} · SID {phone.provider_sid ?? "—"}
          </p>
        ) : (
          <ActionForm action={assignNumber.bind(null, orgId)} submitLabel="Assign number">
            <input name="e164" placeholder="(843) 555-0100 (bought in Twilio)" className="input" />
            <input name="provider_sid" placeholder="Number SID (PN...)" className="input" />
          </ActionForm>
        )}
      </section>

      <section className="card mb-4">
        <h2 className="mb-2 font-semibold">Industry & edition</h2>
        <ActionForm action={updateOrgIndustry.bind(null, orgId)}>
          <select name="industry" defaultValue={org.industry ?? ""} className="input" aria-label="Industry">
            <option value="">Generic (no specific industry)</option>
            {industriesByModule().map((g) => (
              <optgroup key={g.module} label={g.label}>
                {g.industries.map((i) => <option key={i.key} value={i.key}>{i.label}{i.status === "coming_soon" ? " (module coming)" : ""}</option>)}
              </optgroup>
            ))}
          </select>
          <select name="edition" defaultValue={org.edition} className="input" aria-label="Edition">
            {MODULE_IDS.map((m) => <option key={m} value={m}>{MODULE_LABELS[m]} edition</option>)}
          </select>
        </ActionForm>
      </section>

      <section className="card mb-4">
        <h2 className="mb-2 font-semibold">Modules & add-ons</h2>
        <ul className="divide-y divide-slate-100">
          {moduleKeys.map((k) => {
            const row = (orgModules ?? []).find((m) => m.module === k);
            const on = Boolean(row?.enabled);
            return (
              <li key={k} className="flex items-center justify-between gap-3 py-2">
                <span className="text-sm">
                  <span className="font-medium">{moduleName(k)}</span>
                  <span className="block text-slate-500">{on ? `On (${row?.source})` : "Off"}{(catalog ?? []).find((c) => c.key === k)?.status === "coming_soon" ? " · module not built yet" : ""}</span>
                </span>
                <form action={setOrgModule.bind(null, orgId, k, !on)}>
                  <SubmitButton className="btn-secondary min-h-10 px-3 text-xs" pendingText="…">{on ? "Turn off" : "Turn on"}</SubmitButton>
                </form>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-xs text-slate-500">Paid add-ons are switched automatically by Stripe. Use this for pilots and modules included with Executive.</p>
      </section>

      <section className="card">
        <h2 className="mb-2 font-semibold">Plan & billing</h2>
        <p className="mb-2 text-sm text-slate-600">Billing status: {sub?.status ?? "manual"}{sub?.stripe_customer_id ? ` · Stripe ${sub.stripe_customer_id}` : ""}</p>
        <ActionForm action={updateAccount.bind(null, orgId)}>
          <select name="plan_id" defaultValue={org.plan_id} className="input">
            {(plans ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="manual_billing" className="h-5 w-5 accent-brand-600" /> Mark as billed by invoice (turns sending back on)
          </label>
        </ActionForm>
      </section>
    </>
  );
}
