-- Milestone 17: agent-readiness audits (the founder's sales tool).
-- Server-only: prospects' audits are never visible to any business or to the public.
-- Rollback: supabase/rollbacks/20260929170000_m17_audit_reports.down.sql

create table public.audit_reports (
  id uuid primary key default gen_random_uuid(),
  prospect_name text not null check (char_length(prospect_name) between 1 and 120),
  industry text check (industry is null or industry ~ '^[a-z][a-z0-9_]{1,39}$'),
  website_url text check (website_url is null or char_length(website_url) <= 500),
  contact_phone text check (contact_phone is null or contact_phone ~ '^\+1[2-9][0-9]{9}$'),
  findings jsonb not null default '{}'::jsonb,
  answers jsonb not null default '{}'::jsonb,
  score integer not null check (score between 0 and 100),
  notes text check (notes is null or char_length(notes) <= 4000),
  fetch_error text,
  created_by_email text,
  created_at timestamptz not null default now()
);

create index audit_reports_created_idx on public.audit_reports (created_at desc);

alter table public.audit_reports enable row level security;
revoke all on public.audit_reports from authenticated, anon;
