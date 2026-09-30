"use client";

import { useActionState } from "react";
import { FormMessage, type FormState } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";

/** One tappable opening (a window, a time or a day), or a stay form, that books on tap. */
export function BookForm({
  action,
  fields,
  label,
  subjects,
  children,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  fields: Record<string, string>;
  label: string;
  subjects?: { id: string; label: string }[];
  children?: React.ReactNode;
}) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction} className="flex flex-col gap-2">
      {Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {subjects && subjects.length > 0 && (
        <select name="subject_id" className="input" aria-label="For" defaultValue={subjects[0].id}>
          {subjects.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      )}
      {children}
      <SubmitButton className="btn-secondary min-h-11 w-full text-sm" pendingText="Booking…">{label}</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
