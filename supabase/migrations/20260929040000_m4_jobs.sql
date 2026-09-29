-- Milestone 4: completed jobs (and, for lawn care, completed visits).
-- Completing a job is what triggers a Google review request.

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  lead_id uuid references public.leads (id) on delete set null,
  recurring_service_id uuid, -- foreign key added in Milestone 6
  description text check (description is null or char_length(description) <= 500),
  amount_cents integer check (amount_cents is null or amount_cents >= 0),
  completed_on date not null,
  completed_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index jobs_org_completed_idx on public.jobs (org_id, completed_on desc);
create index jobs_contact_idx on public.jobs (contact_id);

alter table public.jobs enable row level security;
create policy "members read jobs" on public.jobs
  for select to authenticated using (public.is_org_member(org_id));
create policy "members add jobs" on public.jobs
  for insert to authenticated with check (public.is_org_member(org_id));
create policy "owners delete jobs" on public.jobs
  for delete to authenticated using (public.has_org_role(org_id, 'owner'));
revoke update on public.jobs from authenticated;

alter table public.scheduled_messages
  add constraint scheduled_messages_job_id_fkey foreign key (job_id) references public.jobs (id) on delete cascade;
