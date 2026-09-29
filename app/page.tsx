import Link from "next/link";
import { APP_NAME, APP_TAGLINE } from "@/lib/brand";

// Public home page. A fuller marketing site (plus privacy/SMS terms pages,
// which carrier registration requires) comes in Milestone 1.
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
        <Link href="/signup" className="btn-primary">
          Get started
        </Link>
        <Link href="/login" className="btn-secondary">
          Log in
        </Link>
      </div>
    </main>
  );
}
