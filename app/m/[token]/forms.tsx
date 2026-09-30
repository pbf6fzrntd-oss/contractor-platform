"use client";

import { useActionState } from "react";
import { FormMessage, type FormState } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

export function CancelForm({ action, label, pending, confirm }: { action: Action; label: string; pending: string; confirm: string }) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <label className="flex min-h-12 items-center gap-3 text-sm">
        <input type="checkbox" name="sure" value="yes" required className="h-5 w-5 accent-brand-600" />
        {confirm}
      </label>
      <FormMessage state={state} />
      <SubmitButton pendingText={pending} className="btn-danger w-full">{label}</SubmitButton>
    </form>
  );
}

export function MoveForm({
  action,
  choices,
  stay,
  label,
  pending,
  legend,
  dropOff,
  pickUp,
}: {
  action: Action;
  choices: { value: Record<string, string>; label: string }[];
  stay: { checkIn: string; checkOut: string; min: string } | null;
  label: string;
  pending: string;
  legend: string;
  dropOff: string;
  pickUp: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction} className="flex flex-col gap-3">
      {stay ? (
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">{dropOff}<input type="date" name="check_in" className="input" defaultValue={stay.checkIn} min={stay.min} required /></label>
          <label className="text-sm">{pickUp}<input type="date" name="check_out" className="input" defaultValue={stay.checkOut} min={stay.min} required /></label>
        </div>
      ) : (
        <fieldset>
          <legend className="label">{legend}</legend>
          <div className="grid grid-cols-2 gap-2">
            {choices.map((c, i) => (
              <label key={i} className="flex min-h-12 cursor-pointer items-center justify-center rounded-xl border border-slate-300 bg-white px-2 text-center text-sm has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50 has-[:checked]:font-semibold">
                <input type="radio" name="choice" value={JSON.stringify(c.value)} required className="sr-only" />
                {c.label}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <FormMessage state={state} />
      <SubmitButton pendingText={pending}>{label}</SubmitButton>
    </form>
  );
}
