"use client";

import { useActionState } from "react";
import { FormMessage, type FormState } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";

/** A form wired to a server action, with a status message and submit button. */
export function ActionForm({
  action,
  children,
  submitLabel = "Save",
  className = "flex flex-col gap-3",
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  children: React.ReactNode;
  submitLabel?: string;
  className?: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction} className={className}>
      {children}
      <FormMessage state={state} />
      <SubmitButton className="btn-primary">{submitLabel}</SubmitButton>
    </form>
  );
}
