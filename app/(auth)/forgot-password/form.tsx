"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { requestPasswordReset } from "../actions";

export function ForgotPasswordForm() {
  const [state, action] = useActionState(requestPasswordReset, undefined);
  return (
    <form action={action} className="flex flex-col gap-4">
      <div>
        <label htmlFor="email" className="label">
          Email
        </label>
        <input id="email" name="email" type="email" inputMode="email" autoComplete="email" className="input" required />
      </div>
      <FormMessage state={state} />
      <SubmitButton pendingText="Sending…">Email me a reset link</SubmitButton>
    </form>
  );
}
