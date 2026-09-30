import Link from "next/link";

/** Friendly "this is part of a higher plan" note, pointing to Billing. */
export function UpgradeNote({ feature }: { feature: string }) {
  return (
    <div className="card flex flex-col gap-2">
      <p className="font-semibold">{feature} is part of the Executive plan</p>
      <p className="text-sm text-slate-600">
        Or add <strong>Agent Ready</strong> to your plan: online booking, approval rules, a public profile that AI assistants can
        read, and booking by customers&apos; AI agents.
      </p>
      <Link href="/settings/billing" className="btn-primary mt-1">See plans</Link>
    </div>
  );
}
