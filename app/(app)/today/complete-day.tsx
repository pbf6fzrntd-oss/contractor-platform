"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { completeDay } from "./actions";

export function CompleteDayButton({ date, remaining }: { date: string; remaining: number }) {
  const [state, action] = useActionState(completeDay.bind(null, date), undefined);
  if (remaining === 0) {
    return (
      <div className="flex flex-col gap-2">
        <p className="rounded-xl bg-emerald-50 px-3 py-2 text-center text-sm font-medium text-emerald-800">✓ All visits done for this day</p>
        <FormMessage state={state} />
      </div>
    );
  }
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(`Mark all ${remaining} remaining visits done?`)) e.preventDefault();
      }}
      className="flex flex-col gap-2"
    >
      <SubmitButton className="btn-secondary w-full" pendingText="Saving…">
        ✓ Mark day complete ({remaining})
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
