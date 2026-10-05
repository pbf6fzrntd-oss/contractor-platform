/** Read-only acceptance checks. Never signs in, starts a demo, or dispatches texts. */
import { pathToFileURL } from "node:url";

export function validateOrigin(input) {
  const url = new URL(input);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error("Use the site's HTTPS origin, without credentials, path or query.");
  }
  return url.origin;
}

export async function verifyHosted(input) {
  const origin = validateOrigin(input);
  const failures = [];
  async function check(path, inspect) {
    try {
      const response = await fetch(`${origin}${path}`, { redirect: "manual", signal: AbortSignal.timeout(10000) });
      await inspect(response);
      if (!response.bodyUsed) await response.body?.cancel();
    } catch { failures.push(`${path}: request or acceptance check failed`); }
  }
  await check("/api/health", async r => {
    const payload = await r.json();
    if (r.status !== 200 || payload.status !== "ready" || !r.headers.get("cache-control")?.includes("no-store")) throw new Error();
  });
  await check("/login", r => {
    if (r.status !== 200 || r.headers.get("x-content-type-options") !== "nosniff" || r.headers.get("x-frame-options") !== "DENY") throw new Error();
  });
  for (const path of ["/dashboard", "/inbox", "/settings", "/admin"]) {
    await check(path, r => {
      const location = new URL(r.headers.get("location") || "", origin);
      if (![302, 303, 307, 308].includes(r.status) || location.origin !== origin || location.pathname !== "/login") throw new Error();
    });
  }
  for (const method of ["GET", "POST"]) {
    try {
      const r = await fetch(`${origin}/api/cron/dispatch`, { method, redirect: "manual", signal: AbortSignal.timeout(10000) });
      if (r.status !== 401) failures.push(`scheduler ${method}: unauthenticated request must be refused`);
      await r.body?.cancel();
    } catch { failures.push(`scheduler ${method}: request failed`); }
  }
  return failures;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const failures = await verifyHosted(process.argv[2]);
    if (failures.length) { console.error(failures.join("\n")); process.exitCode = 1; }
    else console.log("HTTPS readiness, logged-out access, security headers and scheduler authorization passed. Complete the authenticated acceptance checklist before use.");
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
