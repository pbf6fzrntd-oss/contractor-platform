"use client";

import { useEffect } from "react";
import { sendClientError } from "@/lib/monitoring/client";

/** Last-resort error screen (when even the main layout fails). */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    sendClientError(error);
  }, [error]);
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: 24, maxWidth: 420, margin: "10vh auto" }}>
        <h1 style={{ fontSize: 24 }}>Something went wrong</h1>
        <p style={{ color: "#475569" }}>Sorry about that. Please try again{error.digest ? ` (code ${error.digest})` : ""}.</p>
        <button type="button" onClick={reset} style={{ minHeight: 48, padding: "0 20px", borderRadius: 12, background: "#047857", color: "white", border: 0, fontWeight: 600 }}>
          Try again
        </button>
      </body>
    </html>
  );
}
