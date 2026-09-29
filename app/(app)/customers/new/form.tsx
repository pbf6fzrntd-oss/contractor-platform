"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { createCustomer } from "../actions";
import { ConsentFields, ServiceFields } from "../customer-fields";

export function NewCustomerForm({ defaultLanguage, today }: { defaultLanguage: string; today: string }) {
  const [state, action] = useActionState(createCustomer, undefined);
  return (
    <form action={action} className="flex flex-col gap-4">
      <div>
        <label htmlFor="name" className="label">Name</label>
        <input id="name" name="name" className="input" autoComplete="off" />
      </div>
      <div>
        <label htmlFor="phone" className="label">Cell phone</label>
        <input id="phone" name="phone" type="tel" inputMode="tel" className="input" placeholder="(843) 555-1234" required />
      </div>
      <div>
        <label htmlFor="address" className="label">Service address</label>
        <input id="address" name="address" className="input" />
      </div>
      <div>
        <label htmlFor="language" className="label">Texts in</label>
        <select id="language" name="language" className="input" defaultValue={defaultLanguage}>
          <option value="en">English</option>
          <option value="es">Spanish</option>
        </select>
      </div>
      <ServiceFields defaults={{ start_date: today }} />
      <ConsentFields />
      <FormMessage state={state} />
      <SubmitButton pendingText="Saving…">Add customer</SubmitButton>
    </form>
  );
}
