"use client";

import { useActionState, useState } from "react";
import { FormMessage } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { formatUSPhone } from "@/lib/phone";
import { getBusinessNumber, updatePhoneSetup } from "./actions";

export function GetNumberForm({ simulator }: { simulator: boolean }) {
  const [state, action] = useActionState(getBusinessNumber, undefined);
  return (
    <form action={action} className="card flex flex-col gap-4">
      <p className="text-slate-700">
        {simulator
          ? "You're in simulator mode, so you'll get a pretend 555 number for testing. Nothing real is sent."
          : "We'll get you a local number. Customers text and call it, and missed calls get an instant text back."}
      </p>
      <div>
        <label htmlFor="area_code" className="label">
          Area code
        </label>
        <input id="area_code" name="area_code" className="input" inputMode="numeric" maxLength={3} defaultValue="843" />
      </div>
      <FormMessage state={state} />
      <SubmitButton pendingText="Getting your number…">Get my business number</SubmitButton>
    </form>
  );
}

export function PhoneSetupForm({
  phoneId,
  number,
  mode,
  forwardTo,
}: {
  phoneId: string;
  number: string;
  mode: string;
  forwardTo: string | null;
}) {
  const [state, action] = useActionState(updatePhoneSetup, undefined);
  const [selected, setSelected] = useState(mode);
  const digits = number.replace(/^\+1/, "");

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="phone_id" value={phoneId} />
      <label className="card flex cursor-pointer gap-3 has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50">
        <input
          type="radio"
          name="setup_mode"
          value="forward_when_unanswered"
          checked={selected === "forward_when_unanswered"}
          onChange={() => setSelected("forward_when_unanswered")}
          className="mt-1 h-5 w-5 accent-brand-600"
        />
        <span>
          <span className="block font-semibold">Keep my current number (recommended)</span>
          <span className="block text-sm text-slate-600">
            Your phone rings like always. Calls you don&apos;t answer forward to {formatUSPhone(number)}, and the caller
            gets a text right away.
          </span>
        </span>
      </label>

      {selected === "forward_when_unanswered" && (
        <div className="rounded-xl bg-slate-100 p-3 text-sm text-slate-700">
          <p className="mb-2 font-semibold">Turn on &quot;forward when unanswered&quot; on your cell:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Verizon: dial <strong>*71{digits}</strong> and press call
            </li>
            <li>
              AT&amp;T or T-Mobile: dial <strong>**004*1{digits}#</strong> and press call
            </li>
            <li>Other carriers: search &quot;conditional call forwarding&quot; + your carrier name</li>
          </ul>
          <p className="mt-2">Then call your cell from another phone, let it ring out, and check for the text.</p>
        </div>
      )}

      <label className="card flex cursor-pointer gap-3 has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50">
        <input
          type="radio"
          name="setup_mode"
          value="new_number"
          checked={selected === "new_number"}
          onChange={() => setSelected("new_number")}
          className="mt-1 h-5 w-5 accent-brand-600"
        />
        <span>
          <span className="block font-semibold">Use {formatUSPhone(number)} as my business line</span>
          <span className="block text-sm text-slate-600">
            Put it on your Google profile or ads. Calls ring your cell first; you press 1 to answer. If you don&apos;t,
            the caller gets a text.
          </span>
        </span>
      </label>

      {selected === "new_number" && (
        <div>
          <label htmlFor="forward_to" className="label">
            Ring this cell first
          </label>
          <input
            id="forward_to"
            name="forward_to"
            type="tel"
            inputMode="tel"
            className="input"
            defaultValue={forwardTo ? formatUSPhone(forwardTo) : ""}
            placeholder="(843) 555-1234"
          />
        </div>
      )}

      <FormMessage state={state} />
      <SubmitButton>Save</SubmitButton>
    </form>
  );
}
