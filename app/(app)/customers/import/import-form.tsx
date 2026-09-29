"use client";

import { useActionState, useMemo, useState } from "react";
import { FormMessage } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { FREQUENCY_LABEL } from "@/lib/automation/schedule";
import { money } from "@/lib/format";
import { IMPORT_FIELD_LABEL, parseCustomerCsv } from "@/lib/import/customers-csv";
import { formatUSPhone } from "@/lib/phone";
import { DAY_NAMES } from "@/lib/time";
import { importCustomers } from "../actions";
import { ConsentFields } from "../customer-fields";

const SAMPLE = `Name,Phone,Address,Service,Frequency,Day,Price,Language
Mike Smith,(843) 555-1234,12 Oak St,Mowing,Weekly,Tuesday,45,English
María López,(843) 555-2345,40 Pine Ln,Full service,Every 2 weeks,Thursday,60,Spanish`;

export function ImportForm({ defaultLanguage }: { defaultLanguage: "en" | "es" }) {
  const [csv, setCsv] = useState("");
  const [state, action] = useActionState(importCustomers, undefined);
  const preview = useMemo(
    () => (csv.trim() ? parseCustomerCsv(csv, { language: defaultLanguage, serviceType: "Mowing" }) : null),
    [csv, defaultLanguage],
  );

  async function onFile(file: File | undefined) {
    if (file) setCsv(await file.text());
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="card flex flex-col gap-3 text-sm text-slate-700">
        <p>
          Export your customer list from your spreadsheet or other software as a <strong>CSV file</strong>. It needs at
          least <strong>Phone</strong> and <strong>Day</strong> columns. Name, Address, Service, Frequency, Price and
          Language are optional.
        </p>
        <label className="btn-secondary cursor-pointer">
          Choose CSV file
          <input type="file" accept=".csv,text/csv,.txt" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
        <button type="button" className="text-left font-medium text-brand-700" onClick={() => setCsv(SAMPLE)}>
          Or try a sample
        </button>
      </div>

      <div>
        <label htmlFor="csv" className="label">Or paste it here</label>
        <textarea id="csv" name="csv" rows={6} className="input py-2 font-mono text-xs" value={csv} onChange={(e) => setCsv(e.target.value)} />
      </div>

      {preview && (
        <section className="card">
          {preview.missingColumns.length > 0 ? (
            <p className="text-red-700">
              Missing column(s): {preview.missingColumns.map((c) => IMPORT_FIELD_LABEL[c]).join(", ")}. Check the first row
              has column names.
            </p>
          ) : (
            <>
              <p className="mb-2 font-semibold">
                Ready to import {preview.customers.length}
                {preview.errors.length ? `, ${preview.errors.length} row(s) with problems` : ""}
              </p>
              <ul className="mb-2 max-h-60 divide-y divide-slate-100 overflow-y-auto text-sm">
                {preview.customers.slice(0, 50).map((c) => (
                  <li key={c.line} className="py-1.5">
                    <span className="font-medium">{c.name ?? formatUSPhone(c.phone)}</span> · {DAY_NAMES.en[c.service_day]} ·{" "}
                    {FREQUENCY_LABEL[c.frequency]} · {c.service_type} {money(c.price_cents)}
                    {c.language === "es" ? " · ES" : ""}
                  </li>
                ))}
              </ul>
              {preview.errors.length > 0 && (
                <ul className="text-sm text-red-700">
                  {preview.errors.slice(0, 20).map((e) => (
                    <li key={e.line}>Row {e.line}: {e.message}</li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>
      )}

      <ConsentFields plural />
      <FormMessage state={state} />
      <SubmitButton pendingText="Importing…">Import customers</SubmitButton>
    </form>
  );
}
