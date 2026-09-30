"use client";

import { useActionState } from "react";
import { FormMessage, type FormState } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";

export function LinkBusinessForm({ action, businesses, current }: { action: (prev: FormState, formData: FormData) => Promise<FormState>; businesses: { id: string; name: string }[]; current: string | null }) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <label htmlFor="org_id" className="label">Signed up as</label>
      <select id="org_id" name="org_id" className="input" defaultValue={current ?? ""}>
        <option value="">Not a customer yet</option>
        {businesses.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
      </select>
      <FormMessage state={state} />
      <SubmitButton className="btn-secondary w-full">Save</SubmitButton>
    </form>
  );
}
