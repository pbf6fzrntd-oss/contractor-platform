-- Milestone 26: selling tools.
--  * Setup checklist for new owners (can be hidden).
--  * Private calendar feed (bookings and the lawn route in Google/Apple Calendar).
--  * Sales audits linked to the business that signed up, and re-run audits (before/after).
-- Additive only. Rollback: supabase/rollbacks/20260930040000_m26_selling.down.sql

alter table public.organizations
  add column setup_dismissed_at timestamptz,
  -- Secret part of the calendar feed address. Set by the server only (not granted to users).
  add column calendar_token text unique check (calendar_token is null or calendar_token ~ '^[A-Za-z0-9_-]{32,64}$');
grant update (setup_dismissed_at) on public.organizations to authenticated;

alter table public.audit_reports
  add column org_id uuid references public.organizations (id) on delete set null,
  add column previous_report_id uuid references public.audit_reports (id) on delete set null;
create index audit_reports_org_idx on public.audit_reports (org_id) where org_id is not null;
