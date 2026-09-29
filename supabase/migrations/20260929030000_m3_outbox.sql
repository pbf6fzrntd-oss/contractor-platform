-- Milestone 3: the outbox. Every future text (follow-ups, review requests,
-- bulk sends, campaigns) is a row here with a send time. A job runs every
-- minute, claims what's due, RE-CHECKS all the rules, and sends or skips it.

create table public.scheduled_messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  lead_id uuid references public.leads (id) on delete cascade,
  job_id uuid, -- foreign key added in Milestone 4
  broadcast_id uuid, -- foreign key added in Milestone 7
  kind text not null check (kind in ('estimate_followup', 'review_request', 'broadcast')),
  template_key text,
  category text not null check (category in ('conversational', 'informational', 'marketing')),
  send_at timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'sent', 'skipped', 'failed', 'canceled')),
  skip_reason text,
  -- Facts captured when scheduled, compared at send time (e.g. estimate_sent_at, step).
  context jsonb not null default '{}'::jsonb,
  message_id uuid references public.messages (id) on delete set null,
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create index scheduled_messages_due_idx on public.scheduled_messages (send_at) where status in ('pending', 'processing');
create index scheduled_messages_lead_idx on public.scheduled_messages (lead_id);
create index scheduled_messages_org_idx on public.scheduled_messages (org_id, send_at);

alter table public.scheduled_messages enable row level security;
create policy "members read scheduled texts" on public.scheduled_messages
  for select to authenticated using (public.is_org_member(org_id));
revoke insert, update, delete on public.scheduled_messages from authenticated;

-- Claims due texts so two scheduler runs never send the same text twice.
-- Also re-tries texts stuck in "processing" (e.g. the server crashed mid-send).
create or replace function public.claim_due_scheduled_messages(p_now timestamptz, p_limit integer default 100)
returns setof public.scheduled_messages
language sql
security definer
set search_path = ''
as $$
  update public.scheduled_messages s
  set status = 'processing', attempts = s.attempts + 1, processed_at = now()
  where s.id in (
    select id from public.scheduled_messages
    where (status = 'pending' and send_at <= p_now)
       or (status = 'processing' and processed_at < now() - interval '10 minutes' and attempts < 3)
    order by send_at
    limit p_limit
    for update skip locked
  )
  returning s.*;
$$;

revoke execute on function public.claim_due_scheduled_messages(timestamptz, integer) from public, anon, authenticated;
grant execute on function public.claim_due_scheduled_messages(timestamptz, integer) to service_role;
