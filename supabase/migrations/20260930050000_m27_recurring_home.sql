-- Milestone 27: Module A, Recurring Home Services (house cleaning, pest control, pool service).
--  * Service agreements (quarterly pest plans, termite bonds, pool seasons, cleaning plans)
--    with automatic renewal reminders.
--  * A general "module notice" kind in the outbox, so module texts get the same
--    last-moment re-check and sending rules as every other scheduled text.
-- Additive only. Rollback: supabase/rollbacks/20260930050000_m27_recurring_home.down.sql

create table public.rh_agreements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  recurring_service_id uuid references public.recurring_services (id) on delete set null,
  name text not null check (char_length(name) between 1 and 100),
  kind text not null default 'service_plan' check (kind in ('service_plan', 'termite_bond', 'mosquito_season', 'pool_season', 'cleaning_plan', 'other')),
  price_cents integer check (price_cents is null or price_cents between 0 and 10000000),
  billing text not null default 'per_visit' check (billing in ('per_visit', 'monthly', 'quarterly', 'yearly', 'one_time')),
  starts_on date not null,
  ends_on date,
  term_months integer not null default 12 check (term_months between 1 and 60),
  auto_renew boolean not null default true,
  status text not null default 'active' check (status in ('active', 'ended', 'canceled')),
  -- Customers are reminded this many days before ends_on (0 = no reminder).
  renewal_notice_days integer not null default 30 check (renewal_notice_days between 0 and 120),
  -- The end date the last reminder was about (a new end date means a new reminder).
  renewal_notice_for date,
  notes text check (notes is null or char_length(notes) <= 2000),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on)
);
create index rh_agreements_org_idx on public.rh_agreements (org_id, status, ends_on);
create index rh_agreements_contact_idx on public.rh_agreements (org_id, contact_id);
create trigger rh_agreements_updated_at before update on public.rh_agreements
  for each row execute function public.set_updated_at();
create trigger rh_agreements_same_org before insert or update on public.rh_agreements
  for each row execute function public.check_same_org_contact();

alter table public.rh_agreements enable row level security;
create policy "members read agreements" on public.rh_agreements
  for select to authenticated using (public.is_org_member(org_id));
create policy "members add agreements" on public.rh_agreements
  for insert to authenticated with check (public.is_org_member(org_id));
create policy "members update agreements" on public.rh_agreements
  for update to authenticated using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
create policy "owners delete agreements" on public.rh_agreements
  for delete to authenticated using (public.has_org_role(org_id, 'owner'));

-- Module texts (e.g. agreement renewal reminders) join the outbox.
alter table public.scheduled_messages drop constraint scheduled_messages_kind_check;
alter table public.scheduled_messages add constraint scheduled_messages_kind_check
  check (kind in ('estimate_followup', 'review_request', 'broadcast', 'booking_reminder', 'vaccine_reminder', 'module_notice'));

-- The module can now be bought as an add-on (e.g. a lawn company adding pest control).
update public.addon_catalog set status = 'available' where key = 'recurring_home';
