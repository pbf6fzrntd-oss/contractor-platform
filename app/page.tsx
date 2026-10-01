import Link from "next/link";
import { APP_NAME, APP_TAGLINE } from "@/lib/brand";
import { serverEnv } from "@/lib/env";

// Read settings (DEMO_MODE) on every visit, so turning the demo on/off needs no rebuild.
export const dynamic = "force-dynamic";

// Public home page. Carrier registration reviewers look for the privacy and
// SMS terms links at the bottom.
export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-8 px-5 py-10">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-700">{APP_NAME}</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">{APP_TAGLINE}</h1>
        <p className="mt-3 text-lg text-slate-600">
          Automatic text-back for missed calls, estimate follow-ups and Google review requests for Charleston-area
          contractors and lawn care companies.
        </p>
      </div>
      <div className="flex flex-col gap-3">
        {serverEnv.demoMode && (
          <Link href="/demo" className="btn-primary">
            ▶ Try the live demo
          </Link>
        )}
        {!serverEnv.demoDeployment && <Link href="/signup" className={serverEnv.demoMode ? "btn-secondary" : "btn-primary"}>
          Get started
        </Link>}
        <Link href="/login" className="btn-secondary">
          Log in
        </Link>
      </div>
      <nav className="flex justify-center gap-4 text-sm text-slate-500">
        <Link href="/privacy">Privacy</Link>
        <Link href="/terms">Terms</Link>
        <Link href="/sms-terms">SMS terms</Link>
      </nav>
    </main>
  );
}
