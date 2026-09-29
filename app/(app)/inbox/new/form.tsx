"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { addLead } from "./actions";

export function NewLeadForm({ defaultLanguage }: { defaultLanguage: string }) {
  const [state, action] = useActionState(addLead, undefined);
  return (
    <form action={action} className="flex flex-col gap-4">
      <div>
        <label htmlFor="phone" className="label">Phone</label>
        <input id="phone" name="phone" type="tel" inputMode="tel" className="input" placeholder="(843) 555-1234" required />
      </div>
      <div>
        <label htmlFor="name" className="label">Name</label>
        <input id="name" name="name" className="input" />
      </div>
      <div>
        <label htmlFor="preferred_language" className="label">Texts in</label>
        <select id="preferred_language" name="preferred_language" className="input" defaultValue={defaultLanguage}>
          <option value="en">English</option>
          <option value="es">Spanish</option>
        </select>
      </div>
      <div>
        <label htmlFor="notes" className="label">What do they need?</label>
        <textarea id="notes" name="notes" rows={3} className="input py-2" />
      </div>
      <FormMessage state={state} />
      <SubmitButton pendingText="Adding…">Add lead</SubmitButton>
    </form>
  );
}
