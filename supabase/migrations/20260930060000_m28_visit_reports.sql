-- Milestone 28: Module A visit reports (what was done at each visit, readings,
-- photos, crew notes) and the optional "service complete" text.
-- Additive only. Rollback: supabase/rollbacks/20260930060000_m28_visit_reports.down.sql

create table public.rh_visit_reports (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  job_id uuid not null unique references public.jobs (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  recurring_service_id uuid references public.recurring_services (id) on delete set null,
  -- Ticked items, readings and choices (keys from the trade's checklist).
  report jsonb not null default '{}'::jsonb,
  -- Goes to the customer in the "service complete" text.
  customer_note text check (customer_note is null or char_length(customer_note) <= 500),
  -- Team only: never texted or shared with AI assistants.
  private_note text check (private_note is null or char_length(private_note) <= 2000),
  -- The customer should get the "service complete" text (unticking it before it goes out stops it).
  text_customer boolean not null default false,
  texted_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index rh_visit_reports_contact_idx on public.rh_visit_reports (org_id, contact_id, created_at desc);
create trigger rh_visit_reports_updated_at before update on public.rh_visit_reports
  for each row execute function public.set_updated_at();
create trigger rh_visit_reports_same_org before insert or update on public.rh_visit_reports
  for each row execute function public.check_same_org_contact();

-- The visit (job) must belong to the same business as the report.
create or replace function public.rh_visit_reports_same_org_job()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.jobs j where j.id = new.job_id and j.org_id = new.org_id) then
    raise exception 'The visit belongs to a different business.';
  end if;
  return new;
end;
$$;
create trigger rh_visit_reports_same_org_job before insert or update on public.rh_visit_reports
  for each row execute function public.rh_visit_reports_same_org_job();

alter table public.rh_visit_reports enable row level security;
create policy "members read visit reports" on public.rh_visit_reports
  for select to authenticated using (public.is_org_member(org_id));
create policy "members add visit reports" on public.rh_visit_reports
  for insert to authenticated with check (public.is_org_member(org_id));
create policy "members update visit reports" on public.rh_visit_reports
  for update to authenticated using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
create policy "owners delete visit reports" on public.rh_visit_reports
  for delete to authenticated using (public.has_org_role(org_id, 'owner'));

-- Photos from a visit (private files, like every other upload).
alter table public.files add column job_id uuid references public.jobs (id) on delete set null;
create index files_job_idx on public.files (job_id) where job_id is not null;
