"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { FormState } from "@/components/form-message";

type Trade = { key: string; label: string; hint: string; icon: string };

function Card({ trade }: { trade: Trade }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex min-h-24 w-full flex-col items-start gap-1 rounded-2xl bg-white p-4 text-left shadow-sm ring-1 ring-slate-200 transition hover:ring-2 hover:ring-brand-600 disabled:opacity-60"
    >
      <span className="text-3xl" aria-hidden="true">{trade.icon}</span>
      <span className="font-semibold text-slate-900">{pending ? "Setting up…" : trade.label}</span>
      <span className="text-sm text-slate-600">{trade.hint}</span>
    </button>
  );
}

function TradeForm({ trade, action }: { trade: Trade; action: (prev: FormState) => Promise<FormState> }) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction}>
      <Card trade={trade} />
      {state?.error && <p className="mt-1 text-sm text-red-700" role="alert">{state.error}</p>}
      <Overlay label={trade.label} />
    </form>
  );
}

/** Full-screen "building your demo" while the demo business is created (a few seconds). */
function Overlay({ label }: { label: string }) {
  const { pending } = useFormStatus();
  if (!pending) return null;
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-white/90 p-6 text-center backdrop-blur" role="status">
      <span className="h-10 w-10 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" aria-hidden="true" />
      <p className="text-xl font-semibold">Building your {label.toLowerCase()} business…</p>
      <p className="max-w-sm text-slate-600">Loading three months of calls, texts, estimates and jobs. This takes a few seconds.</p>
    </div>
  );
}

export function TradePicker({ trades, actions }: { trades: Trade[]; actions: Record<string, (prev: FormState) => Promise<FormState>> }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {trades.map((t) => (
        <TradeForm key={t.key} trade={t} action={actions[t.key]} />
      ))}
    </div>
  );
}
