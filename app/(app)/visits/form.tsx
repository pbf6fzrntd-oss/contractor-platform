"use client";

import { useActionState, useState } from "react";
import { FormMessage, type FormState } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { serviceCompleteText, summarizeReport, type ReportField, type ReportValues } from "@/modules/recurring-home/rules/visit-report";

/** The crew's checklist for one stop, with a live preview of the customer's text. */
export function VisitForm({
  action,
  fields,
  defaults,
  business,
  service,
  lang,
  alreadyTexted,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  fields: ReportField[];
  defaults: { values: ReportValues; customerNote: string; privateNote: string; textCustomer: boolean };
  business: string;
  service: string;
  lang: "en" | "es";
  alreadyTexted: boolean;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const [values, setValues] = useState<ReportValues>(defaults.values);
  const [note, setNote] = useState(defaults.customerNote);
  const [textIt, setTextIt] = useState(defaults.textCustomer);
  const set = (k: string, v: boolean | number | string | null) =>
    setValues((prev) => {
      const next = { ...prev };
      if (v === null || v === false || v === "") delete next[k];
      else next[k] = v;
      return next;
    });
  const preview = serviceCompleteText(lang, business, service, summarizeReport(fields, values, lang), note || null);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <section className="card flex flex-col gap-3">
        {fields.some((f) => f.type === "number") && (
          <div className="grid grid-cols-3 gap-2">
            {fields.map((f) =>
              f.type === "number" ? (
                <label key={f.key} className="text-sm">
                  <span className="block font-medium">{f.label}</span>
                  <input
                    name={f.key}
                    type="number"
                    inputMode="decimal"
                    step={f.step}
                    min={f.min}
                    max={f.max}
                    className="input"
                    defaultValue={typeof values[f.key] === "number" ? String(values[f.key]) : ""}
                    onChange={(e) => set(f.key, e.target.value === "" ? null : Number(e.target.value))}
                  />
                  <span className="block text-xs text-slate-500">Good: {f.ideal[0]}–{f.ideal[1]}{f.unit ? ` ${f.unit}` : ""}</span>
                </label>
              ) : null,
            )}
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          {fields.map((f) =>
            f.type === "check" ? (
              <label key={f.key} className="flex min-h-12 cursor-pointer items-center gap-2 rounded-xl px-3 text-sm ring-1 ring-slate-300 has-[:checked]:bg-brand-50 has-[:checked]:font-semibold has-[:checked]:ring-brand-600">
                <input type="checkbox" name={f.key} defaultChecked={values[f.key] === true} onChange={(e) => set(f.key, e.target.checked)} className="h-5 w-5 accent-brand-600" />
                {f.label}
              </label>
            ) : null,
          )}
        </div>
        {fields.map((f) =>
          f.type === "choice" ? (
            <fieldset key={f.key}>
              <legend className="label">{f.label}</legend>
              <div className="flex gap-2">
                {f.options.map((o) => (
                  <label key={o.value} className="flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-xl text-sm ring-1 ring-slate-300 has-[:checked]:bg-brand-50 has-[:checked]:font-semibold has-[:checked]:ring-brand-600">
                    <input type="radio" name={f.key} value={o.value} defaultChecked={values[f.key] === o.value} onChange={() => set(f.key, o.value)} className="sr-only" />
                    {o.label}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null,
        )}
      </section>

      <section className="card flex flex-col gap-3">
        <div>
          <label htmlFor="customer_note" className="label">Note for the customer <span className="font-normal text-slate-500">(optional)</span></label>
          <input id="customer_note" name="customer_note" className="input" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Gate was left open, we closed it" />
        </div>
        <div>
          <label htmlFor="private_note" className="label">🔒 Crew notes <span className="font-normal text-slate-500">(team only, never sent)</span></label>
          <textarea id="private_note" name="private_note" className="input min-h-16" maxLength={2000} defaultValue={defaults.privateNote} />
        </div>
        <div>
          <label htmlFor="photos" className="label">📷 Photos <span className="font-normal text-slate-500">(private, up to 6)</span></label>
          <input id="photos" name="photos" type="file" accept="image/*" multiple className="block w-full text-sm" />
        </div>
      </section>

      <section className="card flex flex-col gap-2">
        <label className="flex min-h-12 items-center gap-3">
          <input type="checkbox" name="text_customer" checked={textIt} onChange={(e) => setTextIt(e.target.checked)} disabled={alreadyTexted} className="h-6 w-6 accent-brand-600" />
          <span className="font-medium">{alreadyTexted ? "✓ Customer already got their \"service complete\" text" : "Text the customer that their service is done"}</span>
        </label>
        {textIt && !alreadyTexted && (
          <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">
            <span className="block text-xs font-semibold text-slate-500">They&apos;ll get</span>
            {preview}
          </p>
        )}
      </section>
      <FormMessage state={state} />
      <SubmitButton pendingText="Saving…">Save visit</SubmitButton>
    </form>
  );
}
