-- Rollback for Milestone 24 (deploy the pre-M24 code first). Saved photo files stay in storage.
drop table if exists public.job_runs;
delete from public.scheduled_messages where kind = 'vaccine_reminder';
alter table public.scheduled_messages drop constraint scheduled_messages_kind_check;
alter table public.scheduled_messages add constraint scheduled_messages_kind_check
  check (kind in ('estimate_followup', 'review_request', 'broadcast', 'booking_reminder'));
drop index if exists public.files_expiring_idx;
drop index if exists public.files_message_idx;
alter table public.files drop column if exists reminder_sent_at, drop column if exists message_id;
alter table public.business_credentials drop column if exists expiry_alert_for, drop column if exists expiry_alert_stage;
