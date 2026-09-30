-- Rollback for Milestone 22. Public profile links stop working.
drop function if exists public.public_business_profile(text);
drop function if exists public.public_profile_org(text);
drop table if exists public.public_request_log;
update public.consent_events set method = 'web_form' where method = 'ai_agent_request';
alter table public.consent_events drop constraint consent_events_method_check;
alter table public.consent_events add constraint consent_events_method_check check (method in (
  'sms_keyword', 'owner_confirmed_reply', 'owner_recorded', 'web_form', 'written_agreement', 'text_keyword', 'import_attestation'));
revoke update (slug, public_profile_enabled, profile) on public.organizations from authenticated;
alter table public.organizations drop column if exists profile, drop column if exists public_profile_enabled, drop column if exists slug;
