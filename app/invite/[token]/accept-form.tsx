"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { acceptInvite } from "./actions";

export function AcceptInviteForm({ token, orgName }: { token: string; orgName: string }) {
  const [state, formAction] = useActionState(acceptInvite.bind(null, token), undefined);
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <FormMessage state={state} />
      <SubmitButton pendingText="Joining…">Join {orgName}</SubmitButton>
    </form>
  );
}
