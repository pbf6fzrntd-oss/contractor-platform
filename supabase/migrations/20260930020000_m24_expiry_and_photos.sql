-- Milestone 24: expiry alerts and photos texted in.
--  * Owners are alerted before a license or insurance policy expires (30 days, 7 days, expired).
--  * Customers are reminded before a pet's vaccine record on file expires.
--  * Photos customers text in (MMS) are saved to private storage and linked to the text.
-- Additive only. Rollback: supabase/rollbacks/20260930020000_m24_expiry_and_photos.down.sql

-- Which expiry alert the owner already got, for which expiry date (a new date starts over).
alter table public.business_credentials
  add column expiry_alert_stage text check (expiry_alert_stage is null or expiry_alert_stage in ('30', '7', 'expired')),
  add column expiry_alert_for date;

alter table public.files
  -- A photo that arrived in a customer's text.
  add column message_id uuid references public.messages (id) on delete set null,
  -- Vaccine records: when the customer was reminded it's expiring.
  add column reminder_sent_at timestamptz;
create index files_message_idx on public.files (message_id) where message_id is not null;
create index files_expiring_idx on public.files (expires_on) where kind = 'vaccination_record' and deleted_at is null and reminder_sent_at is null;

-- Vaccine reminders join the outbox.
alter table public.scheduled_messages drop constraint scheduled_messages_kind_check;
alter table public.scheduled_messages add constraint scheduled_messages_kind_check
  check (kind in ('estimate_followup', 'review_request', 'broadcast', 'booking_reminder', 'vaccine_reminder'));

-- Once-a-day jobs (expiry checks, cleanup) record that they ran, so they run once per day
-- even though the scheduler is called every minute. Server-only: no policies.
create table public.job_runs (
  job text not null check (job ~ '^[a-z0-9_]{1,40}$'),
  run_on date not null,
  ran_at timestamptz not null default now(),
  result jsonb,
  primary key (job, run_on)
);
alter table public.job_runs enable row level security;
revoke all on public.job_runs from anon, authenticated;
