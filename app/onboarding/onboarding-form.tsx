"use client";

import { useActionState } from "react";
import { BusinessFields } from "@/components/business-fields";
import { FormMessage } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { createBusiness } from "./actions";

export function OnboardingForm() {
  const [state, formAction] = useActionState(createBusiness, undefined);
  return (
    <form action={formAction} className="flex flex-col gap-5">
      <BusinessFields />
      <FormMessage state={state} />
      <SubmitButton pendingText="Setting up…">Finish setup</SubmitButton>
    </form>
  );
}
