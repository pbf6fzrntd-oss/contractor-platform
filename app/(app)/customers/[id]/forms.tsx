"use client";

import { useActionState, useState } from "react";
import { FormMessage } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { MARKETING_CONSENT_METHODS } from "@/lib/consent";
import { ServiceFields } from "../customer-fields";
import { cancelService, pauseService, recordMarketingConsent, updateService } from "./actions";

export function EditServiceForm({
  id,
  defaults,
  suggestions,
}: {
  id: string;
  defaults: { service_type: string; frequency: string; service_day: number; price: string; start_date: string };
  suggestions: string[];
}) {
  const [state, action] = useActionState(updateService.bind(null, id), undefined);
  return (
    <form action={action} className="flex flex-col gap-3">
      <ServiceFields defaults={defaults} suggestions={suggestions} />
      <FormMessage state={state} />
      <SubmitButton className="btn-secondary w-full">Save service</SubmitButton>
    </form>
  );
}

const CANCEL_REASONS = ["Moving", "Price", "Switched companies", "Doing it themselves", "Not happy with service", "Seasonal / not needed", "Other"];

export function PauseCancelForms({ id, canPause }: { id: string; canPause: boolean }) {
  const [open, setOpen] = useState<"pause" | "cancel" | null>(null);
  const [pauseState, pauseAction] = useActionState(pauseService.bind(null, id), undefined);
  const [cancelState, cancelAction] = useActionState(cancelService.bind(null, id), undefined);
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        {canPause && (
          <button type="button" className="btn-secondary" onClick={() => setOpen(open === "pause" ? null : "pause")}>
            Pause
          </button>
        )}
        <button type="button" className="btn-danger" onClick={() => setOpen(open === "cancel" ? null : "cancel")}>
          Cancel service
        </button>
      </div>
      {open === "pause" && (
        <form action={pauseAction} className="flex flex-col gap-2">
          <label htmlFor="paused_until" className="label">Back on the schedule on (optional)</label>
          <input id="paused_until" name="paused_until" type="date" className="input" />
          <SubmitButton className="btn-primary w-full">Pause service</SubmitButton>
          <FormMessage state={pauseState} />
        </form>
      )}
      {open === "cancel" && (
        <form action={cancelAction} className="flex flex-col gap-2">
          <label htmlFor="cancel_reason" className="label">Why are they canceling?</label>
          <select id="cancel_reason" name="cancel_reason" className="input">
            {CANCEL_REASONS.map((r) => <option key={r}>{r}</option>)}
          </select>
          <SubmitButton className="btn-danger w-full">Confirm cancel</SubmitButton>
          <FormMessage state={cancelState} />
        </form>
      )}
    </div>
  );
}

export function MarketingConsentForm({ id }: { id: string }) {
  const [state, action] = useActionState(recordMarketingConsent.bind(null, id), undefined);
  return (
    <form action={action} className="flex flex-col gap-2">
      <label htmlFor="marketing_method" className="label">They agreed in writing to get offers by text via</label>
      <select id="marketing_method" name="marketing_method" className="input">
        {Object.entries(MARKETING_CONSENT_METHODS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      <input name="marketing_evidence" className="input" placeholder="Note (e.g. signed 3/2026 agreement)" />
      <SubmitButton className="btn-secondary w-full">Record marketing consent</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
