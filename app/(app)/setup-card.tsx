import Link from "next/link";
import type { AppContext } from "@/lib/auth/context";
import { loadSetup, showSetupCard } from "@/lib/services/setup";

/** "Finish setting up": progress and the next step, at the top of the owner's home screen. */
export async function SetupCard({ ctx }: { ctx: AppContext }) {
  if (!showSetupCard(ctx)) return null;
  const { progress } = await loadSetup(ctx);
  if (progress.complete || !progress.next) return null;
  const pct = Math.round((progress.done / progress.total) * 100);
  return (
    <section className="card mb-4 flex flex-col gap-3" aria-label="Finish setting up">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-semibold">Finish setting up</h2>
        <Link href="/settings/setup" className="text-sm font-medium text-brand-700">
          {progress.done} of {progress.total} done
        </Link>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Setup progress">
        <div className="h-full rounded-full bg-brand-600" style={{ width: `${pct}%` }} />
      </div>
      <Link href={progress.next.href} className="flex items-center justify-between gap-3 rounded-xl bg-brand-50 px-3 py-3 hover:bg-brand-100">
        <span>
          <span className="block font-medium text-brand-900">Next: {progress.next.title}</span>
          <span className="block text-sm text-slate-600">{progress.next.detail}</span>
        </span>
        <span aria-hidden="true" className="text-brand-700">→</span>
      </Link>
    </section>
  );
}
