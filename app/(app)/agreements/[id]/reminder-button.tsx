"use client";

import { useActionState } from "react";
import { FormMessage, type FormState } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";

export function ReminderButton({ action, label }: { action: () => Promise<FormState>; label: string }) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <SubmitButton className="btn-secondary w-full" pendingText="Queuing…">{label}</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
