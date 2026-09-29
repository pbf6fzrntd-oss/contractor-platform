"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { markJobComplete } from "./actions";

export function JobForm({ leadId, defaultAmount }: { leadId: string; defaultAmount: string }) {
  const [state, action] = useActionState(markJobComplete.bind(null, leadId), undefined);
  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label htmlFor="amount" className="label">Amount</label>
          <input id="amount" name="amount" inputMode="decimal" className="input" defaultValue={defaultAmount} placeholder="$" />
        </div>
        <div>
          <label htmlFor="description" className="label">What was done</label>
          <input id="description" name="description" className="input" placeholder="Optional" />
        </div>
      </div>
      <SubmitButton className="btn-primary w-full" pendingText="Saving…">
        ✓ Job done
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
