-- Rollback for Milestone 20. Run only after no leads use the new sources
-- (update them to 'manual' first), and after deploying the pre-M20 code.
drop table if exists public.approval_requests;
update public.leads set source = 'manual' where source in ('booking_page', 'outside_agent', 'voice', 'ai_assistant');
alter table public.leads drop constraint leads_source_check;
alter table public.leads add constraint leads_source_check check (source in ('missed_call', 'inbound_text', 'campaign', 'manual'));
revoke update (approval_settings) on public.organizations from authenticated;
alter table public.organizations drop column if exists approval_settings;
