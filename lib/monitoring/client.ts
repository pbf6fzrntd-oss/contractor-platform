/** Sends a browser-side error to /api/client-errors (which forwards it to Sentry if set up). */
export function sendClientError(error: Error & { digest?: string }) {
  try {
    const payload = JSON.stringify({
      name: error.name?.slice(0, 100),
      message: (error.message || "Error").slice(0, 1000),
      stack: error.stack?.slice(0, 6000),
      digest: error.digest?.slice(0, 100),
      path: window.location.pathname.slice(0, 300),
    });
    if (navigator.sendBeacon) navigator.sendBeacon("/api/client-errors", new Blob([payload], { type: "application/json" }));
    else void fetch("/api/client-errors", { method: "POST", headers: { "Content-Type": "application/json" }, body: payload, keepalive: true });
  } catch {
    // never let error reporting cause another error
  }
}
