"use client";
import { useActionState } from "react";
import { FormMessage } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { reconcileDelivery } from "./actions";
export function DeliveryForm({orgId,requestKey}:{orgId:string;requestKey:string}) {
 const [state,action]=useActionState(reconcileDelivery.bind(null,orgId,requestKey),undefined);
 return <form action={action} className="mt-3 space-y-3">
  <label className="label">Provider outcome<select name="decision" className="input" required defaultValue=""><option value="" disabled>Select verified outcome</option><option value="accepted">Accepted by provider</option><option value="rejected">Confirmed rejected by provider</option></select></label>
  <label className="label">Provider message ID<input name="sid" className="input" maxLength={200} /></label>
  <label className="label">Evidence reference and reason<textarea name="evidence" className="input" minLength={10} maxLength={2000} required /></label>
  <FormMessage state={state}/><SubmitButton pendingText="Recording…">Record verified outcome</SubmitButton>
 </form>;
}
