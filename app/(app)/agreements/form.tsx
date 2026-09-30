"use client";

import { useActionState, useState } from "react";
import { FormMessage, type FormState } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import type { AgreementPreset } from "@/modules/recurring-home/rules/agreements";

export type AgreementDefaults = {
  contact_id?: string;
  recurring_service_id?: string | null;
  name?: string;
  kind?: string;
  billing?: string;
  price?: string;
  starts_on?: string;
  ends_on?: string | null;
  term_months?: number;
  auto_renew?: boolean;
  renewal_notice_days?: number;
  notes?: string | null;
};

const BILLING_OPTIONS = [
  ["per_visit", "Per visit"],
  ["monthly", "Monthly"],
  ["quarterly", "Quarterly"],
  ["yearly", "Yearly"],
  ["one_time", "One time"],
] as const;

/** New / edit agreement. Quick picks fill in the usual terms for the trade. */
export function AgreementForm({
  action,
  customers,
  presets,
  defaults,
  submitLabel,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  customers: { contactId: string; serviceId: string | null; label: string }[];
  presets: AgreementPreset[];
  defaults: AgreementDefaults;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const [v, setV] = useState({
    name: defaults.name ?? "",
    kind: defaults.kind ?? "service_plan",
    billing: defaults.billing ?? "per_visit",
    term: String(defaults.term_months ?? 12),
    notice: String(defaults.renewal_notice_days ?? 30),
    autoRenew: defaults.auto_renew ?? true,
  });
  const initialCustomer = defaults.contact_id ? `${defaults.contact_id}|${defaults.recurring_service_id ?? ""}` : "";
  const [customer, setCustomer] = useState(initialCustomer);
  const [contactId, serviceId] = customer.split("|");

  return (
    <form action={formAction} className="card flex flex-col gap-4">
      <input type="hidden" name="contact_id" value={contactId ?? ""} />
      <input type="hidden" name="recurring_service_id" value={serviceId ?? ""} />
      <input type="hidden" name="kind" value={v.kind} />
      <div>
        <label htmlFor="customer" className="label">Customer</label>
        <select id="customer" className="input" value={customer} onChange={(e) => setCustomer(e.target.value)} required>
          <option value="" disabled>Pick a customer</option>
          {customers.map((c) => <option key={`${c.contactId}|${c.serviceId ?? ""}`} value={`${c.contactId}|${c.serviceId ?? ""}`}>{c.label}</option>)}
        </select>
      </div>
      {presets.length > 0 && (
        <fieldset>
          <legend className="label">Quick pick</legend>
          <div className="flex flex-wrap gap-2">
            {presets.map((p) => (
              <button
                key={p.name}
                type="button"
                onClick={() => setV({ name: p.name, kind: p.kind, billing: p.billing, term: String(p.termMonths), notice: String(p.noticeDays), autoRenew: p.autoRenew })}
                className={`min-h-11 rounded-full px-3 text-sm ring-1 ${v.name === p.name ? "bg-brand-600 text-white ring-brand-600" : "bg-white text-slate-700 ring-slate-300"}`}
              >
                {p.name}
              </button>
            ))}
          </div>
        </fieldset>
      )}
      <div>
        <label htmlFor="name" className="label">Agreement</label>
        <input id="name" name="name" className="input" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} maxLength={100} required placeholder="Quarterly pest control plan" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="price" className="label">Price</label>
          <input id="price" name="price" className="input" inputMode="decimal" defaultValue={defaults.price ?? ""} placeholder="$129" />
        </div>
        <div>
          <label htmlFor="billing" className="label">Charged</label>
          <select id="billing" name="billing" className="input" value={v.billing} onChange={(e) => setV({ ...v, billing: e.target.value })}>
            {BILLING_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="starts_on" className="label">Starts</label>
          <input id="starts_on" name="starts_on" type="date" className="input" defaultValue={defaults.starts_on} required />
        </div>
        <div>
          <label htmlFor="term_months" className="label">Term (months)</label>
          <input id="term_months" name="term_months" type="number" min={1} max={60} className="input" value={v.term} onChange={(e) => setV({ ...v, term: e.target.value })} />
        </div>
      </div>
      <div>
        <label htmlFor="ends_on" className="label">Ends <span className="font-normal text-slate-500">(blank = one term from the start)</span></label>
        <input id="ends_on" name="ends_on" type="date" className="input" defaultValue={defaults.ends_on ?? ""} />
      </div>
      <label className="flex min-h-12 items-center gap-3">
        <input type="checkbox" name="auto_renew" checked={v.autoRenew} onChange={(e) => setV({ ...v, autoRenew: e.target.checked })} className="h-6 w-6 accent-brand-600" />
        <span>Renews on its own <span className="block text-sm text-slate-500">If not, it ends on the end date and we let you know.</span></span>
      </label>
      <div>
        <label htmlFor="renewal_notice_days" className="label">Text the customer a reminder</label>
        <select id="renewal_notice_days" name="renewal_notice_days" className="input" value={v.notice} onChange={(e) => setV({ ...v, notice: e.target.value })}>
          {[0, 7, 14, 21, 30, 45, 60].map((d) => <option key={d} value={d}>{d === 0 ? "Don't remind them" : `${d} days before it ${v.autoRenew ? "renews" : "ends"}`}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="notes" className="label">Notes <span className="font-normal text-slate-500">(team only)</span></label>
        <textarea id="notes" name="notes" className="input min-h-20" maxLength={2000} defaultValue={defaults.notes ?? ""} />
      </div>
      <FormMessage state={state} />
      <SubmitButton>{submitLabel}</SubmitButton>
    </form>
  );
}
