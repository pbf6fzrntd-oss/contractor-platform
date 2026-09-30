-- Rollback for Milestone 26 (deploy the previous code first).
drop index if exists public.audit_reports_org_idx;
alter table public.audit_reports drop column if exists previous_report_id, drop column if exists org_id;
revoke update (setup_dismissed_at) on public.organizations from authenticated;
alter table public.organizations drop column if exists calendar_token, drop column if exists setup_dismissed_at;
