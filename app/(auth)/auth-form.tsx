"use client";

import { useActionState } from "react";
import { FormMessage, type FormState } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";

type Props = {
  mode: "login" | "signup";
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  next?: string;
};

export function AuthForm({ mode, action, next }: Props) {
  const [state, formAction] = useActionState(action, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {next && <input type="hidden" name="next" value={next} />}
      {mode === "signup" && (
        <div>
          <label htmlFor="full_name" className="label">
            Your name
          </label>
          <input id="full_name" name="full_name" className="input" autoComplete="name" required />
        </div>
      )}
      <div>
        <label htmlFor="email" className="label">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          className="input"
          required
        />
      </div>
      <div>
        <label htmlFor="password" className="label">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          minLength={mode === "signup" ? 8 : undefined}
          className="input"
          required
        />
        {mode === "signup" && <p className="hint">At least 8 characters.</p>}
      </div>
      <FormMessage state={state} />
      <SubmitButton pendingText={mode === "signup" ? "Creating account…" : "Logging in…"}>
        {mode === "signup" ? "Create account" : "Log in"}
      </SubmitButton>
    </form>
  );
}
