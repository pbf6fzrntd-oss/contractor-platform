"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { updateAuditAnswers } from "../actions";
import { AnswerPicker } from "../answer-picker";

export function AnswersForm({ id, items, notes }: { id: string; items: { key: string; label: string; status: string }[]; notes: string }) {
  const [state, action] = useActionState(updateAuditAnswers.bind(null, id), undefined);
  return (
    <form action={action} className="flex flex-col gap-3">
      {items.map((i) => <AnswerPicker key={i.key} name={`answer_${i.key}`} label={i.label} current={i.status} />)}
      <div>
        <label htmlFor="notes" className="label">Notes</label>
        <textarea id="notes" name="notes" className="input min-h-24" defaultValue={notes} />
      </div>
      <FormMessage state={state} />
      <SubmitButton>Save answers</SubmitButton>
    </form>
  );
}
