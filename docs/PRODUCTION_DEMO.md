# Hosted Lowcountry practice environment

This is the real Next.js application with Supabase persistence, separate from the read-only ChatGPT preview. Deploy from `claude/home-service-saas-mvp-bcc00c`. No service is provisioned merely by committing `render.yaml`.

## Dedicated database and settings

1. Create a separate Supabase project for fictional demos. Do not point this deployment at a customer, operational, or test database. Select the region and plan in the account before creating it.
2. Apply **every** migration in `supabase/migrations` in filename order using the Supabase CLI's supported migration workflow. Read `supabase db push --help` before linking/pushing. Include the recovery and reporting-dispatch migrations. Never run `scripts/setup-test-db.sh` against this project: it rebuilds a test database.
3. Verify the private storage bucket and RLS policies created by migrations. Run Supabase Security and Performance Advisors and resolve unintended public access or privileged functions callable by ordinary users. Verify two unrelated demo users cannot read one another's records or files.
4. Configure Auth Site URL to the final HTTPS app URL and the exact callback URL used by this app (`/auth/callback`). Keep email/password sign-in available; visitor accounts are created server-side as confirmed fictional users. No signup email provider is needed for the Try demo path.
5. Set the values from `render.yaml` through the host's protected environment settings. `NEXT_PUBLIC_*` values are embedded at build time: rebuild when changing them. Keep `SUPABASE_SECRET_KEY` server-only. Set a random `CRON_SECRET` of at least 32 characters. Do not configure any Twilio or Stripe credentials.

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
