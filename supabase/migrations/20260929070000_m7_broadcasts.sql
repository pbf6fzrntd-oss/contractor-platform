-- Milestone 7 (and 8): bulk sends. One table for both kinds:
--   service_notice: rain delays, running late (informational; existing customers)
--   campaign: seasonal offers (marketing; written consent required)
-- Each recipient becomes a row in scheduled_messages.

create table public.broadcasts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  kind text not null check (kind in ('service_notice', 'campaign')),
  name text not null check (char_length(name) between 1 and 100),
  template_key text,
  body_en text not null check (char_length(body_en) between 1 and 1000),
  body_es text check (body_es is null or char_length(body_es) <= 1000),
  category text not null check (category in ('informational', 'marketing')),
  -- Service notices: the day affected, and the new day for rain delays.
  service_date date,
  new_date date,
  -- Campaigns: who it goes to, e.g. {"statuses":["active","past"],"serviceTypes":["Mowing"]}.
  audience jsonb not null default '{}'::jsonb,
  scheduled_at timestamptz not null default now(),
  status text not null default 'scheduled' check (status in ('draft', 'scheduled', 'sent', 'canceled')),
  recipient_count integer not null default 0,
  -- How many were left out and why, e.g. {"opted_out": 2, "no_marketing_consent": 14}.
  excluded jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index broadcasts_org_idx on public.broadcasts (org_id, created_at desc);

create trigger broadcasts_updated_at
  before update on public.broadcasts
  for each row execute function public.set_updated_at();

alter table public.broadcasts enable row level security;
create policy "members read broadcasts" on public.broadcasts
  for select to authenticated using (public.is_org_member(org_id));
revoke insert, update, delete on public.broadcasts from authenticated;

alter table public.scheduled_messages
  add constraint scheduled_messages_broadcast_id_fkey foreign key (broadcast_id) references public.broadcasts (id) on delete cascade;
alter table public.messages
  add constraint messages_broadcast_id_fkey foreign key (broadcast_id) references public.broadcasts (id) on delete set null;
alter table public.leads
  add constraint leads_broadcast_id_fkey foreign key (broadcast_id) references public.broadcasts (id) on delete set null;
alter table public.service_date_moves
  add constraint service_date_moves_broadcast_id_fkey foreign key (broadcast_id) references public.broadcasts (id) on delete set null;

create index scheduled_messages_broadcast_idx on public.scheduled_messages (broadcast_id);
create index leads_broadcast_idx on public.leads (broadcast_id);
