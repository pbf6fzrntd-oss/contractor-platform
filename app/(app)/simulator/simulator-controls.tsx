"use client";

import { usePathname, useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { FormMessage } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { simulateInboundText, simulateMissedCall } from "./actions";

const QUICK_REPLIES = ["Hi, I need a quote", "Yes", "STOP", "HELP", "Cancel", "Please stop texting me", "START"];

export function SimulatorControls({ from }: { from: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [phone, setPhone] = useState(from);
  const [body, setBody] = useState("");
  const [callState, callAction] = useActionState(simulateMissedCall, undefined);
  const [textState, textAction] = useActionState(simulateInboundText, undefined);

  function remember(value: string) {
    router.replace(`${pathname}?from=${encodeURIComponent(value)}`, { scroll: false });
  }

  return (
    <div className="card flex flex-col gap-4">
      <div>
        <label htmlFor="from" className="label">
          Pretend customer&apos;s phone
        </label>
        <input
          id="from"
          className="input"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          onBlur={() => remember(phone)}
        />
        <p className="hint">Use any number; each one acts like a different customer.</p>
      </div>

      <form action={callAction}>
        <input type="hidden" name="from" value={phone} />
        <SubmitButton className="btn-secondary w-full" pendingText="Calling…">
          📞 Call and nobody answers
        </SubmitButton>
      </form>
      <FormMessage state={callState} />

      <form action={textAction} className="flex flex-col gap-2" onSubmit={() => setTimeout(() => setBody(""), 0)}>
        <input type="hidden" name="from" value={phone} />
        <label htmlFor="body" className="label">
          Text the business
        </label>
        <div className="flex flex-wrap gap-2">
          {QUICK_REPLIES.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => setBody(q)}
              className="rounded-full bg-slate-100 px-3 py-1.5 text-sm text-slate-700"
            >
              {q}
            </button>
          ))}
        </div>
        <textarea
          id="body"
          name="body"
          rows={2}
          className="input py-2"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <SubmitButton className="btn-primary w-full" pendingText="Sending…">
          Send text
        </SubmitButton>
      </form>
      <FormMessage state={textState} />
    </div>
  );
}
