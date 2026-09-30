import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { SubmitButton } from "@/components/submit-button";
import { requireOwner } from "@/lib/auth/context";
import { loadSetup } from "@/lib/services/setup";
import { createClient } from "@/lib/supabase/server";
import { setSetupHidden } from "./actions";

export const metadata: Metadata = { title: "Setup checklist" };

export default async function SetupPage() {
  const ctx = await requireOwner();
  const { steps, progress } = await loadSetup(ctx);
  const { data: fresh } = await (await createClient()).from("organizations").select("setup_dismissed_at").eq("id", ctx.org.id).single();
  const hidden = Boolean(fresh?.setup_dismissed_at);

  return (
    <>
      <PageHeader title="Setup checklist" subtitle={progress.complete ? "You're all set. Nice work!" : `${progress.done} of ${progress.total} must-do steps done`} backHref="/settings" />
      <ol className="card mb-4 divide-y divide-slate-100 p-0">
        {steps.map((s) => (
          <li key={s.key}>
            <Link href={s.href} className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50">
              <span
                className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${s.done ? "bg-brand-600 text-white" : "ring-2 ring-slate-300 text-transparent"}`}
                aria-label={s.done ? "Done" : "Not done yet"}
              >
                ✓
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block font-medium ${s.done ? "text-slate-500 line-through" : ""}`}>
                  {s.title}
                  {s.optional && <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-600 no-underline">optional</span>}
                </span>
                {!s.done && <span className="block text-sm text-slate-600">{s.detail}</span>}
              </span>
              {!s.done && <span aria-hidden="true" className="text-brand-700">→</span>}
            </Link>
          </li>
        ))}
      </ol>
      <form action={setSetupHidden.bind(null, !hidden)}>
        <SubmitButton className="btn-secondary w-full">{hidden ? "Show the checklist on my home screen" : "Hide the checklist from my home screen"}</SubmitButton>
      </form>
    </>
  );
}
