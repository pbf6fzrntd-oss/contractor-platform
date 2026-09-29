-- Milestone 6: recurring service customers (lawn care / landscaping).

create table public.recurring_services (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  service_type text not null check (char_length(service_type) between 1 and 60),
  frequency text not null check (frequency in ('weekly', 'biweekly', 'every_4_weeks')),
  -- 0 = Sunday ... 6 = Saturday
  service_day integer not null check (service_day between 0 and 6),
  -- First service date; also decides which weeks biweekly customers are on.
  start_date date not null,
  price_cents integer check (price_cents is null or price_cents >= 0),
  status text not null default 'active' check (status in ('active', 'paused', 'canceled')),
  -- Paused customers come back automatically on this date (if set).
  paused_until date,
  canceled_on date,
  cancel_reason text check (cancel_reason is null or char_length(cancel_reason) <= 300),
  notes text check (notes is null or char_length(notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index recurring_services_org_idx on public.recurring_services (org_id, status, service_day);
create index recurring_services_contact_idx on public.recurring_services (contact_id);

create trigger recurring_services_updated_at
  before update on public.recurring_services
  for each row execute function public.set_updated_at();

alter table public.recurring_services enable row level security;
create policy "members read services" on public.recurring_services
  for select to authenticated using (public.is_org_member(org_id));
create policy "members add services" on public.recurring_services
  for insert to authenticated with check (public.is_org_member(org_id));
create policy "members edit services" on public.recurring_services
  for update to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
create policy "owners delete services" on public.recurring_services
  for delete to authenticated using (public.has_org_role(org_id, 'owner'));

alter table public.jobs
  add constraint jobs_recurring_service_id_fkey
  foreign key (recurring_service_id) references public.recurring_services (id) on delete set null;

-- One-off schedule moves (e.g. rain delay: Tuesday's visit moves to Thursday).
create table public.service_date_moves (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  recurring_service_id uuid not null references public.recurring_services (id) on delete cascade,
  from_date date not null,
  to_date date not null,
  broadcast_id uuid, -- foreign key added in Milestone 7
  created_at timestamptz not null default now(),
  unique (recurring_service_id, from_date)
);

create index service_date_moves_org_idx on public.service_date_moves (org_id, to_date);

alter table public.service_date_moves enable row level security;
create policy "members read moves" on public.service_date_moves
  for select to authenticated using (public.is_org_member(org_id));
create policy "members add moves" on public.service_date_moves
  for insert to authenticated with check (public.is_org_member(org_id));
create policy "members change moves" on public.service_date_moves
  for update to authenticated using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
create policy "members remove moves" on public.service_date_moves
  for delete to authenticated using (public.is_org_member(org_id));
