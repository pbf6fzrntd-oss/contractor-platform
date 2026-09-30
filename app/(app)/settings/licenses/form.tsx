"use client";

import { useActionState, useState } from "react";
import { FormMessage } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { CREDENTIAL_KIND_LABEL, CREDENTIAL_KINDS } from "@/lib/credentials";
import { addCredential } from "./actions";

type Suggestion = { kind: string; label: string; note?: string };

export function AddCredentialForm({ suggestions }: { suggestions: Suggestion[] }) {
  const [state, action] = useActionState(addCredential, undefined);
  const [picked, setPicked] = useState<Suggestion | null>(null);
  return (
    <div className="flex flex-col gap-3">
      {suggestions.length > 0 && (
        <div>
          <p className="label">Common for your industry</p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button key={s.label} type="button" onClick={() => setPicked(s)} className="rounded-full border border-slate-300 bg-white px-3 py-2 text-left text-sm">
                + {s.label}
              </button>
            ))}
          </div>
        </div>
      )}
      <form action={action} key={picked?.label ?? "blank"} className="card flex flex-col gap-3">
        <div>
          <label htmlFor="kind" className="label">Type</label>
          <select id="kind" name="kind" className="input" defaultValue={picked?.kind ?? "license"}>
            {CREDENTIAL_KINDS.map((k) => <option key={k} value={k}>{CREDENTIAL_KIND_LABEL[k]}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="label" className="label">Name</label>
          <input id="label" name="label" className="input" defaultValue={picked?.label ?? ""} required />
          {picked?.note && <p className="hint">{picked.note}</p>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="number" className="label">Number <span className="font-normal text-slate-500">(optional)</span></label>
            <input id="number" name="number" className="input" />
          </div>
          <div>
            <label htmlFor="expires_on" className="label">Expires</label>
            <input id="expires_on" name="expires_on" type="date" className="input" />
          </div>
        </div>
        <div>
          <label htmlFor="issuer" className="label">Issued by <span className="font-normal text-slate-500">(optional)</span></label>
          <input id="issuer" name="issuer" className="input" placeholder="SC LLR, insurance company…" />
        </div>
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" name="show_on_profile" defaultChecked className="h-5 w-5 accent-brand-600" />
          Show on my public business profile
        </label>
        <FormMessage state={state} />
        <SubmitButton>Add</SubmitButton>
      </form>
    </div>
  );
}
