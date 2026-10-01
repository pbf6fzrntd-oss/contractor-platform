"use client";

import { useEffect } from "react";
import { sendClientError } from "@/lib/monitoring/client";

export default function DashboardError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => { sendClientError(error); }, [error]);
  return (
    <section className="card" role="alert">
      <h1 className="text-2xl font-bold">Dashboard unavailable</h1>
      <p className="my-4 text-slate-600">We could not load all your records. Try again to see your current numbers.</p>
      <button type="button" className="btn-primary" onClick={retry}>Try again</button>
    </section>
  );
}
