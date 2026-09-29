"use client";

import { useActionState, useState } from "react";
import { FormMessage } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import type { RegistrationInput } from "@/lib/automation/a2p";
import { saveRegistration } from "./actions";

export function RegistrationForm({ initial, editable }: { initial: RegistrationInput; editable: boolean }) {
  const [state, action] = useActionState(saveRegistration, undefined);
  const [brandType, setBrandType] = useState(initial.brand_type);
  const field = (name: keyof RegistrationInput, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div>
      <label htmlFor={name} className="label">{label}</label>
      <input id={name} name={name} className="input" defaultValue={initial[name] as string} {...props} />
    </div>
  );

  return (
    <form action={action}>
      <fieldset disabled={!editable} className="flex flex-col gap-4">
        <div className="card flex flex-col gap-2">
          <p className="font-semibold">Type of business</p>
          <label className="flex items-start gap-3">
            <input type="radio" name="brand_type" value="standard" checked={brandType === "standard"} onChange={() => setBrandType("standard")} className="mt-1 h-5 w-5 accent-brand-600" />
            <span>
              <span className="block font-medium">Has an EIN (LLC, corporation, or sole prop with EIN)</span>
              <span className="block text-sm text-slate-600">Full texting volume. Recommended.</span>
            </span>
          </label>
          <label className="flex items-start gap-3">
            <input type="radio" name="brand_type" value="sole_proprietor" checked={brandType === "sole_proprietor"} onChange={() => setBrandType("sole_proprietor")} className="mt-1 h-5 w-5 accent-brand-600" />
            <span>
              <span className="block font-medium">Sole proprietor without an EIN</span>
              <span className="block text-sm text-slate-600">Lower daily limits; fine for a one-truck business. Carriers text a code to your cell to verify.</span>
            </span>
          </label>
        </div>

        {field("legal_name", "Legal business name (exactly as the IRS has it)")}
        {brandType === "standard" && field("ein", "EIN", { inputMode: "numeric", placeholder: "12-3456789" })}
        {field("business_address", "Business address")}
        {field("website", brandType === "standard" ? "Website" : "Website (optional)", { inputMode: "url", placeholder: "https://" })}
        <div className="grid grid-cols-1 gap-4">
          {field("contact_name", "Contact name")}
          {field("contact_email", "Contact email", { type: "email" })}
          {field("contact_phone", "Contact cell phone", { type: "tel" })}
        </div>

        <details className="card">
          <summary className="cursor-pointer font-semibold">What you text about (pre-filled for you)</summary>
          <div className="mt-3 flex flex-col gap-3">
            <div>
              <label htmlFor="use_case_description" className="label">Description</label>
              <textarea id="use_case_description" name="use_case_description" rows={5} className="input py-2" defaultValue={initial.use_case_description} />
            </div>
            <div>
              <label htmlFor="opt_in_description" className="label">How customers agree to texts</label>
              <textarea id="opt_in_description" name="opt_in_description" rows={5} className="input py-2" defaultValue={initial.opt_in_description} />
            </div>
            <p className="label">Sample messages (from your templates)</p>
            {initial.sample_messages.map((m, i) => (
              <textarea key={i} name="sample_messages" rows={3} className="input py-2 text-sm" defaultValue={m} aria-label={`Sample message ${i + 1}`} />
            ))}
          </div>
        </details>

        <FormMessage state={state} />
        {editable && (
          <div className="grid grid-cols-2 gap-2">
            <SubmitButton className="btn-secondary">Save draft</SubmitButton>
            <button type="submit" name="intent" value="submit" className="btn-primary">Submit</button>
          </div>
        )}
      </fieldset>
    </form>
  );
}
