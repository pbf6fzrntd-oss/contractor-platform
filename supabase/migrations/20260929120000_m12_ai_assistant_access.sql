-- Milestone 12: AI assistant access (MCP).
-- Owners create keys that let an AI assistant (Claude, ChatGPT, ...) use the
-- app on their behalf. Keys are stored only as a hash; the full key is shown
-- once. Every assistant action is logged for the owner to review.

create table public.api_keys (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  -- First characters of the key, so owners can tell keys apart.
  key_prefix text not null,
  key_hash text not null unique,
  access text not null default 'read_write' check (access in ('read', 'read_write')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

create index api_keys_org_idx on public.api_keys (org_id);

alter table public.api_keys enable row level security;
create policy "owners read keys" on public.api_keys
  for select to authenticated using (public.has_org_role(org_id, 'owner'));
revoke insert, update, delete on public.api_keys from authenticated;

create table public.agent_activity (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  api_key_id uuid references public.api_keys (id) on delete set null,
  tool text not null,
  summary text not null check (char_length(summary) <= 500),
  ok boolean not null default true,
  created_at timestamptz not null default now()
);

create index agent_activity_org_idx on public.agent_activity (org_id, created_at desc);
create index agent_activity_key_idx on public.agent_activity (api_key_id, created_at desc);

alter table public.agent_activity enable row level security;
create policy "members read assistant activity" on public.agent_activity
  for select to authenticated using (public.is_org_member(org_id));
revoke insert, update, delete on public.agent_activity from authenticated;

-- Texts sent by an AI assistant are labeled as such in conversations.
alter table public.messages drop constraint messages_sender_type_check;
alter table public.messages
  add constraint messages_sender_type_check check (sender_type in ('contact', 'user', 'automation', 'assistant'));
