"use client";

import { useActionState } from "react";
import { BusinessFields } from "@/components/business-fields";
import { FormMessage } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import type { Org } from "@/lib/org";
import { updateBusiness } from "./actions";

export function BusinessForm({ org, canEdit }: { org: Org; canEdit: boolean }) {
  const [state, formAction] = useActionState(updateBusiness, undefined);
  return (
    <form action={formAction} className="flex flex-col gap-5">
      <BusinessFields org={org} disabled={!canEdit} />
      <FormMessage state={state} />
      {canEdit ? (
        <SubmitButton>Save changes</SubmitButton>
      ) : (
        <p className="hint">Only the owner can change business details.</p>
      )}
    </form>
  );
}
