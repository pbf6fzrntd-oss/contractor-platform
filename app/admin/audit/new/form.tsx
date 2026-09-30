"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { createAudit } from "../actions";
import { AnswerPicker } from "../answer-picker";

type Group = { label: string; industries: { key: string; label: string }[] };

export function NewAuditForm({ groups, questions }: { groups: Group[]; questions: { key: string; label: string }[] }) {
  const [state, action] = useActionState(createAudit, undefined);
  return (
    <form action={action} className="flex flex-col gap-4">
      <div>
        <label htmlFor="prospect_name" className="label">Business name</label>
        <input id="prospect_name" name="prospect_name" className="input" required />
      </div>
      <div>
        <label htmlFor="industry" className="label">Industry</label>
        <select id="industry" name="industry" className="input" defaultValue="" required>
          <option value="" disabled>Pick one</option>
          {groups.map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.industries.map((i) => <option key={i.key} value={i.key}>{i.label}</option>)}
            </optgroup>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="website" className="label">Website</label>
        <input id="website" name="website" className="input" inputMode="url" placeholder="roofco.com" />
        <p className="hint">We visit the home page, robots.txt and llms.txt. Takes up to 10 seconds.</p>
      </div>
      <div>
        <label htmlFor="contact_phone" className="label">Their phone <span className="font-normal text-slate-500">(optional)</span></label>
        <input id="contact_phone" name="contact_phone" type="tel" inputMode="tel" className="input" />
      </div>
      <fieldset className="card flex flex-col gap-3">
        <legend className="px-1 font-semibold">From the call</legend>
        {questions.map((q) => <AnswerPicker key={q.key} name={`answer_${q.key}`} label={q.label} />)}
      </fieldset>
      <div>
        <label htmlFor="notes" className="label">Notes</label>
        <textarea id="notes" name="notes" className="input min-h-24" />
      </div>
      <FormMessage state={state} />
      <SubmitButton pendingText="Checking the website…">Run audit</SubmitButton>
    </form>
  );
}
