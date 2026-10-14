# Hosted Lowcountry practice environment

This is the real Next.js application with Supabase persistence, separate from the read-only ChatGPT preview. Deploy from `claude/home-service-saas-mvp-bcc00c`. No service is provisioned merely by committing `render.yaml`.

For the provisioned demo project, first read [backend status and completed migration-history reconciliation](DEMO_BACKEND_STATUS.md). Its recorded migration IDs now match the repository; do not replay existing migrations or reset this project.

## Dedicated database and settings

1. Create a separate Supabase project for fictional demos. Do not point this deployment at a customer, operational, or test database. Select the region and plan in the account before creating it.
2. Apply **every** migration in `supabase/migrations` in filename order using the Supabase CLI's supported migration workflow. Read `supabase db push --help` before linking/pushing. Include the recovery and reporting-dispatch migrations. Never run `scripts/setup-test-db.sh` against this project: it rebuilds a test database.
3. Before enabling the dedicated demo lock, verify the project contains zero ordinary organizations. As the database operator, run `update deployment_private.demo_settings set demo_only = true where singleton;`. The private setting cannot be changed through an ordinary user's Data API access. The organization trigger rejects normal onboarding RPCs and attempts to change a demo into an ordinary business. Leave this setting false in normal app deployments. Never enable it on a customer database.
4. Verify the private storage bucket and RLS policies created by migrations. Run Supabase Security and Performance Advisors and resolve unintended public access or privileged functions callable by ordinary users. Verify two unrelated demo users cannot read one another's records or files.
5. Configure Auth Site URL to the final HTTPS app URL and the exact callback URL used by this app (`/auth/callback`). Keep email/password sign-in available; visitor accounts are created server-side as confirmed fictional users. No signup email provider is needed for the Try demo path.
6. Set the values from `render.yaml` through the host's protected environment settings. `NEXT_PUBLIC_*` values are embedded at build time: rebuild when changing them. Keep `SUPABASE_SECRET_KEY` server-only. Set a random `CRON_SECRET` of at least 32 characters. Do not configure any Twilio or Stripe credentials.

`DEPLOYMENT_MODE=demo` validates HTTPS URLs, database keys, scheduler secret, simulator messaging and Supabase file storage at startup. It forces simulated outbound messaging and disables billing, signup and normal onboarding. It refuses ordinary organizations in the authenticated app context. The health check also rejects a database containing non-demo organizations. These safeguards supplement a dedicated database; they do not turn a customer database into a demo.

## Hosting and scheduling

The Render Blueprint defines a Node web service with `/api/health`, checks-before-auto-deploy, and environment prompts. Review the provider's current price before provisioning. Equivalent Node hosting must run `npm ci --include=dev`, `npm run build`, then `npm start`; supply `PORT`, HTTPS termination, and all the same environment settings. Preserve the current read-only Site until this runtime is verified.

Configure an every-minute authenticated **POST** to `/api/cron/dispatch` with `Authorization: Bearer <CRON_SECRET>`. Supabase Cron plus `pg_net` can call it; put the URL and bearer secret in Supabase Vault, not committed SQL or a public cron expression. Check execution history and HTTP responses. An external scheduler with protected secrets is also suitable. Without this scheduler, queued messages and expired visitor cleanup do not progress automatically.

`/api/health` checks the scheduled-messages and SMS-attempts tables and demo-only database condition. It returns only readiness, not credentials or records. It does not prove every workflow, migration function, Auth or Storage is working: perform the launch journey below.

## Persistent operator and private visitor workspaces

Visitors choose a trade at `/demo` and receive an isolated fictional organization and login. These workspaces expire after 24 hours and are cleaned by the dispatcher. Never seed the hosted environment using the older `demo:seed` script and its local practice password.

For a durable operator workspace, set server-side `DEMO_OPERATOR_EMAIL`, `DEMO_OPERATOR_PASSWORD` (at least 16 characters) in a protected local `.env.local` pointing only to the dedicated demo project. Run `npm run demo:operator`. It creates the same fictional lawn-care scenario as the visitor path, then sets `demo_expires_at` to null. It prints no password. Remove the password from local/host environment once seeded. A duplicate operator email causes a safe failure; it does not overwrite an existing user's password. Reset credentials through Supabase Auth administration, not by rerunning the script.

## Launch verification and recovery

- Run `npm run check`, the database tests against a disposable test project, and Playwright journeys. Existing CI includes database and browser checks; do not waive failing checks for deployment.
- Verify deployed `/api/health` returns 200, unauthenticated private pages require sign-in, two visitors get distinct workspaces, and the operator survives a restart.
- Exercise missed-call simulation, lead replies, estimate scheduling, dispatch/retry notices, reporting, file upload/download, and the industry's module on laptop and phone. Confirm every outbound record is simulated and no billing provider initializes.
- Confirm queued work advances with the scheduler, repeated dispatch does not duplicate sends, and expired visitor workspaces are removed while the persistent operator remains.
- Configure Supabase backups appropriate to the selected plan. Export and restore to a separate demo project as a recovery drill. Never restore over a customer database. Repoint host secrets and rebuild only after the restored project passes the same checks.
- Roll back application code to a tested commit through the host. Do not roll back applied migrations destructively; use a forward migration when needed. Investigate scheduler failures before replaying work.

This is a fictional production-hosted demo, not approval to enable customer billing, live SMS, or real customer onboarding. Those require the separate launch checklist.

## Portable Node container and HTTPS acceptance

The repository also supports Next's standalone Node output via `Dockerfile`. Build with the three **public** settings as build arguments: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SITE_URL`. They must match the final deployment. Supply all server secrets through the host's runtime secret manager, never through Docker arguments or committed files. The runtime runs as the unprivileged `node` user. Use Supabase private storage, not container files. A host may need a writable `.next/cache` directory for Next's runtime cache; do not treat that cache as persistent business data.

After the host serves the final HTTPS origin, run:

```sh
npm run verify:hosted -- https://YOUR-DEMO-DOMAIN
```

This read-only check requires ready/no-store health, login security headers, logged-out redirects for private pages, and refusal of both unauthenticated scheduler methods. It follows no redirects, sends no credentials and creates no demo records. It cannot prove operator login, tenant isolation, working private files, cron cadence, restart persistence or backup restore on that host. Complete those authenticated checks above before using the deployment. A successful build is not a deployed site.

The current local release environment cannot run Docker/local Supabase. GitHub CI is the disposable-database and full browser release gate; skipped local database tests are not database validation. Accessibility checks audit four primary pages at both viewport sizes and exercise keyboard skip navigation. Screen-reader and real-device checks remain manual launch gates.

`npm start` now copies static assets and runs `.next/standalone/server.js`, matching the container runtime. Build first; public settings cannot be changed after compilation without rebuilding. The server listens on `PORT` (default 3000) and all interfaces; set `APP_HOSTNAME=127.0.0.1` for a strictly local workspace. Put a TLS proxy in front on hosted deployments.

Dependency review (2026-10-05): `source-map-js` updated to 1.2.2; CI audits production dependencies at high severity. The development-only ESLint dependency chain still includes `braces` 3.0.3 (GHSA-vfj7-8cjw-p6xm), for which no patched version is published. Do not run lint on attacker-supplied glob patterns or downgrade Next's lint configuration to bypass the advisory. Revisit when an upstream compatible patch is published. The runtime audit does not certify the base image or Next's vendored code; continue image/dependency scanning on the selected host.

## Scheduler failure checks (October 2026)

The authenticated dispatch endpoint returns `status: "ok"` with HTTP 200 only when all attempted stages succeed. It returns `status: "partial_failure"` with HTTP 503 when dispatch, booking expiry, daily jobs or demo cleanup throws, or when a dispatched message/daily job records a failure. `errors` names the affected stages; provider and database error details are not returned. Configure the scheduler monitor to alert on non-2xx responses, and inspect its response body plus server/Sentry logs.

Independent stages still run after another stage fails. Scheduled-message guard reads fail closed: an unavailable reply/opt-out/booking check does not allow a text to go out. A failed delivery-state write is counted as failed rather than sent. Missed-call replies use the call's stable identity, so a delayed retry after an ambiguous provider response cannot resend the same reply.

Daily jobs retain their once-per-day claims when partially completed. Failed results remain visible on later dispatch calls that day; a claim without a result becomes `incomplete_run` after ten minutes. This intentionally does not replay an entire job that might already have queued texts or sent owner alerts. Inspect the day's `job_runs` result and affected records before any operator-authorized repair. Never clear claims or SMS-attempt records merely to silence an alert. Unknown SMS delivery requires reconciling the provider receipt first.

Local reproduction, using synthetic fixtures only:

```sh
npm test -- tests/unit/missed-call-booking-workflow.test.ts tests/unit/daily-failures.test.ts tests/unit/scheduler-failures.test.ts
```

The service fixture exercises the real inbound, lead, outbox, send-policy, booking and approval code with an in-memory database adapter and mocked outbound provider. It is not proof of SQL locks, RLS, hosted cron execution, or real SMS. CI also runs `e2e/missed-call-booking.spec.ts` against disposable local Supabase: one fictional caller, follow-ups, the same lead's online request, owner approval and customer confirmation, on both viewport sizes. Run the existing database and browser suites before deployment; the owner-private static preview cannot run this journey.

### Smallest remaining editable-hosting gate

The existing repository documents a dedicated demo Supabase backend and a separate read-only static preview. It does not establish a provisioned editable application host. Before an editable private demo can be verified:

1. Choose/approve an HTTPS Node host and its cost. The checked-in Render plan is `0.5c-512mb`; this repository does not establish a zero-cost hosting entitlement. Do not infer one from the backend's historical $0 creation quote.
2. Supply the final `NEXT_PUBLIC_SITE_URL`, the dedicated `NEXT_PUBLIC_SUPABASE_URL` and publishable key at build time; supply server-only `SUPABASE_SECRET_KEY` and `CRON_SECRET` through protected settings. Keep the documented demo/simulator/storage flags. Never commit these secrets.
3. Configure Supabase Auth Site URL and the exact `/auth/callback` redirect for that origin. Create the persistent operator only through the documented secure setup flow. Visitor workspaces remain fictional and isolated; app login does not make the public `/demo` entry point an owner-only host. If owner-only access to the whole deployment is required, the host's access-control option must be separately reviewed and configured.
4. Configure and verify the every-minute authenticated POST schedule, including HTTP-503 alerting. Then verify login, same-customer workflow, private storage, tenant isolation, persistence across restart and backup/restore on the deployed runtime.

These are deployment/access decisions, not effects of this code change. No hosting, keys, login settings, migrations or real outbound messaging are provisioned by the workflow tests.
