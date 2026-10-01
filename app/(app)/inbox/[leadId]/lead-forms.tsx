"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { replyRequestIdentity } from "@/lib/messaging/reply-request";
import { FormMessage } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import type { LeadStage } from "@/lib/leads/stages";
import { saveContact, sendReply, setStage } from "./actions";

export function Composer({ leadId, disabledReason }: { leadId: string; disabledReason?: string }) {
  const [state, action] = useActionState(async (prev: Parameters<typeof sendReply>[1], data: FormData) => {
    let identity;
    try {
      identity = await replyRequestIdentity(sessionStorage, leadId, String(data.get("body") ?? ""));
    } catch {
      return { error: "Couldn't prepare a safe send. Reload and try again." };
    }
    data.set("request_key", identity.key);
    const result = await sendReply(leadId, prev, data);
    // Keep the identity after an error or lost response, including across reloads.
    if (result?.success) sessionStorage.removeItem(identity.storageKey);
    return result;
  }, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.success) formRef.current?.reset();
  }, [state]);
  return (
    <form
      ref={formRef}
      action={action}
      className="sticky bottom-20 z-10 mt-4 flex flex-col gap-2 rounded-2xl bg-slate-50/95 pt-2 backdrop-blur"
    >
      {disabledReason && <p className="text-sm text-amber-800">{disabledReason}</p>}
      <div className="flex items-end gap-2">
        <label htmlFor="reply" className="sr-only">
          Reply
        </label>
        <textarea
          id="reply"
          name="body"
          rows={2}
          placeholder="Type a text…"
          className="input flex-1 py-2"
          disabled={Boolean(disabledReason)}
          required
        />
        <SubmitButton className="btn-primary px-5" pendingText="…">
          Send
        </SubmitButton>
      </div>
      <FormMessage state={state?.error ? state : undefined} />
    </form>
  );
}

export function StagePicker({
  leadId,
  current,
  stages,
  estimateAmount,
}: {
  leadId: string;
  current: LeadStage;
  stages: { value: LeadStage; label: string }[];
  estimateAmount: string;
}) {
  const [state, action] = useActionState(setStage.bind(null, leadId), undefined);
  const [picked, setPicked] = useState<LeadStage>(current);
  const estimateLabel = stages.find((s) => s.value === "estimate_sent")?.label ?? "Estimate sent";

  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Stage">
        {stages.map((s) => (
          <label
            key={s.value}
            className="cursor-pointer rounded-full bg-white px-3 py-2 text-sm font-medium ring-1 ring-slate-300 has-[:checked]:bg-brand-600 has-[:checked]:text-white has-[:checked]:ring-brand-600"
          >
            <input
              type="radio"
              name="stage"
              value={s.value}
              checked={picked === s.value}
              onChange={() => setPicked(s.value)}
              className="sr-only"
            />
            {s.label}
          </label>
        ))}
      </div>
      {picked === "estimate_sent" && (
        <div>
          <label htmlFor="estimate_amount" className="label">
            Amount (optional)
          </label>
          <input
            id="estimate_amount"
            name="estimate_amount"
            inputMode="decimal"
            className="input"
            defaultValue={estimateAmount}
            placeholder="$4,500"
          />
          <p className="hint">Saving &quot;{estimateLabel}&quot; starts automatic follow-up texts.</p>
        </div>
      )}
      {picked !== current || picked === "estimate_sent" ? (
        <SubmitButton className="btn-primary w-full">Save stage</SubmitButton>
      ) : null}
      <FormMessage state={state} />
    </form>
  );
}

export function ContactForm({
  leadId,
  contact,
}: {
  leadId: string;
  contact: {
    name: string | null;
    email: string | null;
    address: string | null;
    preferred_language: string;
    notes: string | null;
    do_not_autotext: boolean;
  };
}) {
  const [state, action] = useActionState(saveContact.bind(null, leadId), undefined);
  return (
    <form action={action} className="flex flex-col gap-3">
      <div>
        <label htmlFor="name" className="label">Name</label>
        <input id="name" name="name" className="input" defaultValue={contact.name ?? ""} />
      </div>
      <div>
        <label htmlFor="preferred_language" className="label">Texts in</label>
        <select id="preferred_language" name="preferred_language" className="input" defaultValue={contact.preferred_language}>
          <option value="en">English</option>
          <option value="es">Spanish</option>
        </select>
      </div>
      <div>
        <label htmlFor="address" className="label">Address</label>
        <input id="address" name="address" className="input" defaultValue={contact.address ?? ""} />
      </div>
      <div>
        <label htmlFor="email" className="label">Email</label>
        <input id="email" name="email" type="email" className="input" defaultValue={contact.email ?? ""} />
      </div>
      <div>
        <label htmlFor="notes" className="label">Notes</label>
        <textarea id="notes" name="notes" rows={3} className="input py-2" defaultValue={contact.notes ?? ""} />
      </div>
      <label className="flex items-center gap-3 text-sm">
        <input type="checkbox" name="do_not_autotext" defaultChecked={contact.do_not_autotext} className="h-5 w-5 accent-brand-600" />
        Never send automatic texts (supplier, family, etc.)
      </label>
      <FormMessage state={state} />
      <SubmitButton className="btn-secondary w-full">Save contact</SubmitButton>
    </form>
  );
}
