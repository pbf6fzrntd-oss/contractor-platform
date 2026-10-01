import type { Instrumentation } from "next";

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { validateDemoDeployment } = await import("@/lib/deployment");
  const errors = validateDemoDeployment(process.env);
  if (errors.length) throw new Error(`Hosted demo configuration: ${errors.join("; ")}`);
}

/** Server errors (pages, API routes, form actions) go to Sentry when SENTRY_DSN is set. */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (!process.env.SENTRY_DSN || process.env.NEXT_RUNTIME !== "nodejs") return;
  const { reportError } = await import("@/lib/monitoring/report");
  await reportError(err, { where: "server", path: request.path, route: context.routePath, routeType: context.routeType });
};
