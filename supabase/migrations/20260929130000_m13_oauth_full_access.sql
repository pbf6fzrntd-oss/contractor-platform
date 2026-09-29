-- Milestone 13: one-tap connect for AI assistants (OAuth) and a third
-- access level ("full": campaigns, message wording, automation settings).

-- Access levels: read < read_write < full
alter table public.api_keys drop constraint api_keys_access_check;
alter table public.api_keys add constraint api_keys_access_check check (access in ('read', 'read_write', 'full'));

-- Keys made through "Connect" in an AI app expire and are refreshed automatically.
alter table public.api_keys
  add column source text not null default 'manual' check (source in ('manual', 'oauth')),
  add column expires_at timestamptz,
  add column oauth_client_id uuid,
  add column refresh_hash text unique,
  add column refresh_expires_at timestamptz;

-- AI apps register themselves before asking an owner to connect (OAuth dynamic client registration).
create table public.oauth_clients (
  id uuid primary key default gen_random_uuid(),
  client_name text not null check (char_length(client_name) between 1 and 100),
  redirect_uris text[] not null check (cardinality(redirect_uris) between 1 and 10),
  created_at timestamptz not null default now()
);

alter table public.api_keys
  add constraint api_keys_oauth_client_id_fkey foreign key (oauth_client_id) references public.oauth_clients (id) on delete cascade;

-- Short-lived, one-time codes handed to the AI app after the owner taps "Allow".
create table public.oauth_codes (
  code_hash text primary key,
  client_id uuid not null references public.oauth_clients (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  access text not null check (access in ('read', 'read_write', 'full')),
  redirect_uri text not null,
  code_challenge text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

-- Server-only tables: no access for logged-in users at all.
alter table public.oauth_clients enable row level security;
alter table public.oauth_codes enable row level security;
revoke all on public.oauth_clients from authenticated, anon;
revoke all on public.oauth_codes from authenticated, anon;
