-- Milestone 20: approval rules and lead/booking source reporting.
-- Additive only. Rollback: supabase/rollbacks/20260929200000_m20_approvals_sources.down.sql

-- Which bookings wait for the owner's OK. Shape and defaults: lib/approvals/rules.ts
alter table public.organizations add column approval_settings jsonb not null default '{}'::jsonb;
grant update (approval_settings) on public.organizations to authenticated;

-- New places leads can come from (the old values all stay valid).
alter table public.leads drop constraint leads_source_check;
alter table public.leads add constraint leads_source_check
  check (source in ('missed_call', 'inbound_text', 'campaign', 'manual', 'booking_page', 'outside_agent', 'voice', 'ai_assistant'));

-- Things waiting for the owner's (or office manager's) OK, with the reasons.
create table public.approval_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  kind text not null default 'booking' check (kind in ('booking', 'quote')),
  booking_id uuid references public.bookings (id) on delete cascade,
  lead_id uuid references public.leads (id) on delete set null,
  contact_id uuid references public.contacts (id) on delete cascade,
  reasons text[] not null default '{}',
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index approval_requests_pending_idx on public.approval_requests (org_id, status, created_at desc);
create unique index approval_requests_booking_idx on public.approval_requests (booking_id) where booking_id is not null;

alter table public.approval_requests enable row level security;
create policy "members read approvals" on public.approval_requests
  for select to authenticated using (public.is_org_member(org_id));
-- Created and decided through the server (it also texts the customer).
revoke insert, update, delete on public.approval_requests from authenticated;
