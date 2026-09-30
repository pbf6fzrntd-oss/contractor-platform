-- Rollback for Milestone 27 (deploy the previous code first). Deletes all service agreements.
update public.addon_catalog set status = 'coming_soon' where key = 'recurring_home';
delete from public.scheduled_messages where kind = 'module_notice';
alter table public.scheduled_messages drop constraint scheduled_messages_kind_check;
alter table public.scheduled_messages add constraint scheduled_messages_kind_check
  check (kind in ('estimate_followup', 'review_request', 'broadcast', 'booking_reminder', 'vaccine_reminder'));
drop table if exists public.rh_agreements;
