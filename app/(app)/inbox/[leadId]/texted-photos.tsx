"use client";

import { useActionState } from "react";
import { FormMessage, type FormState } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";

type Option = { value: string; label: string };

/** "File it": put a texted-in photo under a record, optionally as a vaccine record with its expiry date. */
export function FilePhotoForm({
  action,
  subjects,
  vaccines,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  subjects: Option[];
  vaccines: Option[] | null;
}) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction} className="mt-2 flex flex-col gap-2 text-sm">
      <select name="subject_id" className="input" required defaultValue={subjects.length === 1 ? subjects[0].value : ""}>
        <option value="" disabled>Which one?</option>
        {subjects.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
      </select>
      {vaccines && (
        <>
          <select name="document_type" className="input" defaultValue="">
            <option value="">Just a photo</option>
            {vaccines.map((v) => <option key={v.value} value={v.value}>Vaccine record: {v.label}</option>)}
          </select>
          <label>Expires (vaccine records)<input type="date" name="expires_on" className="input" /></label>
        </>
      )}
      <FormMessage state={state} />
      <SubmitButton className="btn-secondary min-h-11 w-full text-sm" pendingText="Filing…">File it</SubmitButton>
    </form>
  );
}
