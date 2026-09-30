# Recovery release and pilot gate

Apply `20261001000000_demo_recovery.sql` before deploying this application version. Existing records stay intact; new provider-attempt and billing-event tables start empty. Do not run an old application instance alongside the new sender: the old instance does not participate in quota reservations or the retry ledger. Drain/stop dispatchers, migrate, deploy, then restart dispatch. Review pre-existing stuck outbox rows against provider receipts before allowing them to resume.

## What changes

- Customer moves cancel the original, create the replacement and create its approval request in one transaction. A failed replacement preserves the original.
- OAuth refresh rotation updates only the still-current, unrevoked, unexpired hash. A concurrent loser receives `invalid_grant`; failed persistence never returns credentials.
- Public request limits serialize count and reservation and fail closed on database errors. Invalid demo-limit settings use a bounded default. Only trust forwarded IP headers from the deployment's configured reverse proxy.
- Billing webhooks acquire a two-minute subscription lease, retrieve current Stripe state and commit the subscription, plan, add-ons and event receipt together. Busy/failed sync returns 503 so Stripe retries. Lease expiry rejects stale workers. Existing pilot/edition/admin modules are preserved.
- SMS quota is reserved with a queued message before the provider call. An outbox row has a stable request key. Accepted retries reuse the receipt. Missing/uncertain responses retain their quota and never resend automatically; definitive rejection releases quota once. Manual send callers receive a fresh key unless they provide one: do not blindly retry a failed manual request.
- `/admin/delivery` is restricted by the existing platform-admin guard. After checking provider receipts, record acceptance with its message ID or confirmed rejection with evidence. Decisions are audited and send no text. Unresolved attempts stay reserved. Provider acceptance is not proof of delivery.
- Renewal reminders reserve their outbox row and agreement marker together. The UI says queued, with delivery checked in the inbox; duplicate manual clicks cannot resend the same term reminder.
- Website audits pin each connection to a validated DNS answer and re-check redirects. Hexadecimal mapped/private IPv6 and special networks are rejected. Responses and duration are bounded.
- Production builds use system fonts and need no font download.

## Verification and live demonstration

Run `npm run check` with a disposable `TEST_DATABASE_URL`, after `npm run db:test:setup`. The setup script drops/recreates the named test database: never point it at production. Recovery tests cover rollback, reminder deduplication, quotas, billing atomicity and concurrent limits/refresh rotation. Existing CI additionally runs the Supabase-backed laptop/phone click-through suite.

Use the existing `/demo` industries with `SMS_PROVIDER=simulator`, `DEMO_MODE=on` and a separate demo database. Show missed-call text-back, owner approval, booking/reschedule, agreement renewal and visit reports. Reset using the existing disposable demo-session lifecycle. Verify simulator isolation before inviting prospects. See `docs/DEMO.md` and `docs/LAUNCH_CHECKLIST.md` for hosting, sender registration, signed webhooks, scheduler secrets and privacy/retention prerequisites.

A successful build is not a provider cutover. Pilot live SMS only after carrier approval and test receipts; billing only after signed test-mode webhooks and retry reconciliation. Never infer customer consent from demo records. Monitor the delivery queue and webhook failures during the first pilot.

Rollback requires stopping dispatch first, exporting evidence, deploying the prior application and applying the matching rollback file together. The rollback removes new ledgers; do not discard unresolved provider evidence or permit blind retries.
