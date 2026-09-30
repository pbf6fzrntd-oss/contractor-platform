"use client";

import { useEffect } from "react";
import { sendClientError } from "@/lib/monitoring/client";

/** Shown if something breaks on a page. Details go to the logs and error alerts (Sentry), not the screen. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
    sendClientError(error);
  }, [error]);
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-5">
      <h1 className="text-2xl font-bold">Something went wrong</h1>
      <p className="text-slate-600">
        Sorry about that. Try again, and if it keeps happening, let us know{error.digest ? ` (code ${error.digest})` : ""}.
      </p>
      <button type="button" onClick={reset} className="btn-primary">
        Try again
      </button>
    </main>
  );
}
