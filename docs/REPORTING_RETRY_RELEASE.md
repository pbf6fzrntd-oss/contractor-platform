# Reporting and retry release — 2026-10-01

## Changes

Dashboard reporting no longer truncates records at 5,000 or converts failed reads to empty results. Each query pages by ascending ID until an empty page, tolerating server page limits below the requested size. Failed or non-progressing reads show a retryable dashboard error. The existing reporting windows and business calculations remain in place; pagination is not a transaction-wide snapshot.

Dispatchers share a service-role-only atomic claim function with optional organization, broadcast and selected-ID scopes. Empty selected IDs claim nothing. Pending rows and eligible stale claims use row locks; simulator fast-forward requires a simulator phone number. Existing consent, timing and business guards still run after claiming.

The inbox composer uses a random UUID associated with a SHA-256 digest of the trimmed draft and lead. Session storage contains no message body. A lost response retains the key through reload; a confirmed successful reply clears it. A separate browser tab/session or cleared browser storage is not a durable retry identity. Delivery-unknown provider attempts remain held for receipt reconciliation, not automatic resend.

## Release gates

1. Stop dispatch workers. Apply recovery migration `20261001000000_demo_recovery.sql` if not already applied, then `20261001010000_reporting_dispatch.sql`.
2. In a disposable test database, run `npm run db:test:setup`, then `npm run check` with `TEST_DATABASE_URL`. Record the exact commit and CI links. Database tests must execute, not skip. Do not use the setup script against production.
3. Run CI laptop/phone click-through tests and staging Supabase checks. Seed more than 5,000 report records and compare against database totals. Inject a failed read and confirm the dashboard shows an error rather than zero.
4. Race scheduled, broadcast, selected-ID and simulator dispatches in staging; confirm one provider receipt per outbox ID. Confirm canceled rows stay canceled, future rows stay queued outside fast-forward and other organizations are excluded.
5. Simulate a lost reply response, reload and retry the same draft. Confirm one customer text and one quota reservation. Resolve any delivery-unknown attempt against provider evidence using the existing admin workflow.

## Rollback

Stop dispatch first and preserve provider receipts. Deploy the preceding application and apply `supabase/rollbacks/20261001010000_reporting_dispatch.down.sql` together. This removes only the scoped claim function and restores the preceding cron claim function. It does not remove the recovery ledger; do not roll that ledger back with unresolved attempts. The preceding application retains its reporting cap and weaker simulator claim behavior, so do not resume a pilot until those risks are addressed.

Production connections, sender registration, signed webhooks, scheduler, billing and monitoring remain separate gates in LAUNCH_CHECKLIST.md. Hosted read-only demos do not exercise these integrations.
