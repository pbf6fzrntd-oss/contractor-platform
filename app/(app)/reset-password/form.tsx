"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { updatePassword } from "../../(auth)/actions";

export function ResetPasswordForm() {
  const [state, action] = useActionState(updatePassword, undefined);
  return (
    <form action={action} className="flex flex-col gap-4">
      <div>
        <label htmlFor="password" className="label">
          New password
        </label>
        <input id="password" name="password" type="password" autoComplete="new-password" minLength={8} className="input" required />
      </div>
      <FormMessage state={state} />
      <SubmitButton>Save password</SubmitButton>
    </form>
  );
}
