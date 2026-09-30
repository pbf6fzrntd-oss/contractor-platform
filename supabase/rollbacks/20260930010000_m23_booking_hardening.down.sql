-- First re-run the book_slot() definition from 20260929190000_m19_booking.sql (it doesn't save the M23 fields).
-- Rollback for Milestone 23 (deploy the pre-M23 code first).
drop index if exists public.bookings_waiting_idx;
update public.approval_requests set status = 'declined' where status = 'expired';
alter table public.approval_requests drop constraint approval_requests_status_check;
alter table public.approval_requests add constraint approval_requests_status_check check (status in ('pending', 'approved', 'declined'));
delete from public.scheduled_messages where kind = 'booking_reminder';
alter table public.scheduled_messages drop constraint scheduled_messages_kind_check;
alter table public.scheduled_messages add constraint scheduled_messages_kind_check check (kind in ('estimate_followup', 'review_request', 'broadcast'));
alter table public.bookings
  drop column if exists rescheduled_from, drop column if exists canceled_by, drop column if exists customer_confirmed_at,
  drop column if exists pending_reasons, drop column if exists customer_verified_at, drop column if exists verify_by;
