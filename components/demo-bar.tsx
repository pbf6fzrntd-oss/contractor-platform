"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import type { FormState } from "@/components/form-message";

type Action = () => Promise<FormState>;

function TryButton({ icon, title, detail }: { icon: string; title: string; detail: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="flex min-h-16 w-full items-start gap-3 rounded-xl bg-white p-3 text-left ring-1 ring-slate-200 hover:ring-2 hover:ring-brand-600 disabled:opacity-60">
      <span className="text-2xl leading-none" aria-hidden="true">{icon}</span>
      <span>
        <span className="block font-semibold text-slate-900">{pending ? "Working…" : title}</span>
        <span className="block text-sm text-slate-600">{detail}</span>
      </span>
    </button>
  );
}

function TryForm({ action, icon, title, detail }: { action: Action; icon: string; title: string; detail: string }) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction}>
      <TryButton icon={icon} title={title} detail={detail} />
      {state?.error && <p className="mt-1 text-sm text-red-700" role="alert">{state.error}</p>}
      {state?.success && <p className="mt-1 text-sm text-emerald-800" role="status">{state.success}</p>}
    </form>
  );
}

const linkClass = "flex min-h-16 items-start gap-3 rounded-xl bg-white p-3 ring-1 ring-slate-200 hover:ring-2 hover:ring-brand-600";

/**
 * Shown only inside "Try it live" demo businesses: what this is, and buttons
 * that play the customer's side (a missed call, a text, time passing).
 */
export function DemoBar({
  businessName,
  hoursLeft,
  recurring,
  visitReports = false,
  bookingPath,
  actions,
}: {
  businessName: string;
  hoursLeft: number;
  recurring: boolean;
  /** Recurring Home Services demos: link to finishing a visit report. */
  visitReports?: boolean;
  bookingPath: string | null;
  actions: { missedCall: Action; text: Action; textEs: Action; skipAhead: Action };
}) {
  const welcome = useSearchParams().get("welcome") === "1";
  const [open, setOpen] = useState(welcome);

  return (
    // Pinned to the top on phones (the page scrolls past the layout after a redirect); in place on laptops.
    <section aria-label="Demo" className="sticky top-[max(0.5rem,env(safe-area-inset-top))] z-30 mb-5 max-h-[80dvh] overflow-y-auto rounded-2xl bg-amber-50 shadow-sm ring-1 ring-amber-200 lg:static lg:max-h-none lg:overflow-visible lg:shadow-none">
      <div className="flex items-center gap-3 px-3 py-2 sm:px-4 sm:py-3">
        <p className="min-w-0 flex-1 text-sm text-amber-950">
          <span className="font-semibold">🎬 Demo</span>
          <span className="hidden sm:inline"> business · practice data, nothing texts a real phone · deleted in {hoursLeft}h</span>
        </p>
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="btn-primary min-h-10 shrink-0 px-4 text-sm">
          {open ? "Hide" : "▶ Try it"}
        </button>
        <Link href="/demo" className="btn-secondary min-h-10 shrink-0 px-3 text-sm">
          <span className="sm:hidden">Switch</span>
          <span className="hidden sm:inline">Pick another trade</span>
        </Link>
      </div>
      {open && (
        <div className="border-t border-amber-200 px-4 pb-4 pt-3">
          {welcome && (
            <div className="mb-3">
              <h2 className="text-lg font-semibold text-slate-900">Welcome to {businessName}!</h2>
              <p className="text-sm text-slate-700">
                <span className="sm:hidden">Practice data only: nothing texts a real phone, and it&apos;s deleted in {hoursLeft}h. </span>
                This is a full working copy of the app with three months of history. Start with the first button: it plays a customer calling while you&apos;re on a job.
              </p>
            </div>
          )}
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            <TryForm action={actions.missedCall} icon="📞" title="Miss a call from a new customer" detail="They get a text back in seconds and reply. You land in the conversation." />
            <TryForm action={actions.text} icon="💬" title="A new customer texts in" detail="Shows up in the inbox, ready to answer." />
            <TryForm action={actions.textEs} icon="🇲🇽" title="…in Spanish" detail="Spanish-speaking customers get Spanish texts automatically." />
            <TryForm action={actions.skipAhead} icon="⏩" title="Jump ahead in time" detail="Sends waiting follow-ups and review requests now, like days went by." />
            <Link href="/simulator" className={linkClass}>
              <span className="text-2xl leading-none" aria-hidden="true">📱</span>
              <span><span className="block font-semibold text-slate-900">See the customer&apos;s phone</span><span className="block text-sm text-slate-600">Text the business as a customer and watch replies arrive.</span></span>
            </Link>
            {visitReports && (
              <Link href="/today" className={linkClass}>
                <span className="text-2xl leading-none" aria-hidden="true">📝</span>
                <span><span className="block font-semibold text-slate-900">Finish a visit</span><span className="block text-sm text-slate-600">Tap &quot;Report&quot; on a stop: checklist, readings, photos, and a &quot;service complete&quot; text.</span></span>
              </Link>
            )}
            {recurring ? (
              <Link href="/today" className={linkClass}>
                <span className="text-2xl leading-none" aria-hidden="true">🌧</span>
                <span><span className="block font-semibold text-slate-900">Send a rain delay</span><span className="block text-sm text-slate-600">Tell today&apos;s whole route in two taps, in their language.</span></span>
              </Link>
            ) : (
              bookingPath && (
                <a href={bookingPath} target="_blank" rel="noopener" className={linkClass}>
                  <span className="text-2xl leading-none" aria-hidden="true">🗓</span>
                  <span><span className="block font-semibold text-slate-900">Book online as a customer</span><span className="block text-sm text-slate-600">Your booking page opens in a new tab. The request lands on your Schedule.</span></span>
                </a>
              )
            )}
          </div>
        </div>
      )}
    </section>
  );
}
