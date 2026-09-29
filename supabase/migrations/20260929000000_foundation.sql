-- Milestone 0: Foundation
-- Accounts, businesses (organizations), team members, invitations, plans,
-- subscriptions and message templates, all protected by row-level security.
--
-- House rules for every table in this project:
--   * Every business-owned table has an org_id column.
--   * Row-level security is enabled, and policies only use the helper
--     functions below (is_org_member / has_org_role).
--   * Never edit this file after it has been applied to a real database.
--     Add a new migration file instead.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Plans (global, not owned by a business). Seeded below.
-- Stripe is added in Milestone 10; the limits are enforced from day one.
-- ---------------------------------------------------------------------------

create table public.plans (
  id text primary key,
  name text not null,
  monthly_price_cents integer not null default 0,
  stripe_price_id text,
  max_users integer not null,
  max_phone_numbers integer not null,
  monthly_sms_limit integer not null,
  feature_recurring_customers boolean not null default false,
  feature_bulk_messaging boolean not null default false,
  feature_campaigns boolean not null default false,
  is_public boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

insert into public.plans
  (id, name, monthly_price_cents, max_users, max_phone_numbers, monthly_sms_limit,
   feature_recurring_customers, feature_bulk_messaging, feature_campaigns, is_public, sort_order)
values
  -- Hand-billed pilot customers get everything.
  ('pilot', 'Pilot', 0, 3, 1, 2000, true, true, true, false, 0),
  -- Placeholder public plans; prices are set when Stripe is added.
  ('core', 'Core', 0, 2, 1, 1000, false, false, false, true, 1),
  ('pro', 'Pro', 0, 5, 1, 5000, true, true, true, true, 2);

-- ---------------------------------------------------------------------------
-- Organizations = one contractor business
-- ---------------------------------------------------------------------------

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 100),
  business_type text not null check (business_type in ('project', 'recurring')),
  timezone text not null default 'America/New_York',
  default_language text not null default 'en' check (default_language in ('en', 'es')),
  -- Owner's cell phone for "new lead" alerts, in +1XXXXXXXXXX format.
  alert_phone text check (alert_phone is null or alert_phone ~ '^\+1[2-9][0-9]{9}$'),
  google_review_url text check (google_review_url is null or google_review_url ~ '^https://'),
  -- Automation settings (follow-up days, review delay, sending hours...).
  -- Shape is defined and validated in lib/settings.ts.
  settings jsonb not null default '{}'::jsonb,
  plan_id text not null default 'pilot' references public.plans (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger organizations_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Profiles: name/email for each login, so teammates can see each other.
-- Filled automatically when someone signs up.
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text check (full_name is null or char_length(full_name) <= 100),
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, nullif(new.raw_user_meta_data ->> 'full_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Memberships: which logins belong to which business.
-- Roles: 'owner' (full control) and 'manager' (office manager: day-to-day use,
-- cannot change business settings, billing or team).
-- ---------------------------------------------------------------------------

create table public.memberships (
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'manager')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

create index memberships_user_id_idx on public.memberships (user_id);

-- Security helpers used by every policy. "security definer" lets them read
-- memberships without tripping over memberships' own policies.
create or replace function public.is_org_member(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships
    where org_id = p_org_id and user_id = auth.uid()
  );
$$;

create or replace function public.has_org_role(p_org_id uuid, p_role text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships
    where org_id = p_org_id and user_id = auth.uid() and role = p_role
  );
$$;

-- ---------------------------------------------------------------------------
-- Invitations: owner creates a link and texts it to an office manager.
-- ---------------------------------------------------------------------------

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  token text not null unique
    default replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  role text not null default 'manager' check (role in ('manager')),
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index invitations_org_id_idx on public.invitations (org_id);

-- ---------------------------------------------------------------------------
-- Subscriptions: mirror of Stripe. Only the server (Stripe webhook) writes it.
-- ---------------------------------------------------------------------------

create table public.subscriptions (
  org_id uuid primary key references public.organizations (id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  status text not null default 'manual'
    check (status in ('manual', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'incomplete')),
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);

create trigger subscriptions_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Message templates: one row per business, per template, per language.
-- Defaults live in lib/templates/defaults.ts and are copied in at onboarding.
-- ---------------------------------------------------------------------------

create table public.message_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  key text not null check (key ~ '^[a-z0-9_]{1,50}$'),
  language text not null check (language in ('en', 'es')),
  category text not null check (category in ('conversational', 'informational', 'marketing')),
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, key, language)
);

create trigger message_templates_updated_at
  before update on public.message_templates
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.plans enable row level security;
alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.invitations enable row level security;
alter table public.subscriptions enable row level security;
alter table public.message_templates enable row level security;

-- Logged-out visitors get nothing from any table.
revoke all on all tables in schema public from anon;

-- plans: any logged-in user can read the plan list.
create policy "plans are readable" on public.plans
  for select to authenticated using (true);
revoke insert, update, delete on public.plans from authenticated;

-- organizations: members read; only the owner edits, and only these columns.
-- New businesses are created through create_organization() below.
create policy "members read their organization" on public.organizations
  for select to authenticated using (public.is_org_member(id));
create policy "owners update their organization" on public.organizations
  for update to authenticated
  using (public.has_org_role(id, 'owner'))
  with check (public.has_org_role(id, 'owner'));
revoke insert, update, delete on public.organizations from authenticated;
grant update (name, business_type, timezone, default_language, alert_phone, google_review_url, settings)
  on public.organizations to authenticated;

-- profiles: you can read yourself and your teammates; you can edit your name.
create policy "read own and teammates' profiles" on public.profiles
  for select to authenticated using (
    id = auth.uid()
    or exists (
      select 1 from public.memberships mine
      join public.memberships theirs on theirs.org_id = mine.org_id
      where mine.user_id = auth.uid() and theirs.user_id = profiles.id
    )
  );
create policy "update own profile" on public.profiles
  for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
revoke insert, update, delete on public.profiles from authenticated;
grant update (full_name) on public.profiles to authenticated;

-- memberships: members see their team; owners can remove other members.
-- Joining happens only through create_organization() / accept_invitation().
create policy "members read their team" on public.memberships
  for select to authenticated using (public.is_org_member(org_id));
create policy "owners remove other members" on public.memberships
  for delete to authenticated
  using (public.has_org_role(org_id, 'owner') and user_id <> auth.uid());
revoke insert, update on public.memberships from authenticated;

-- invitations: owners only.
create policy "owners read invitations" on public.invitations
  for select to authenticated using (public.has_org_role(org_id, 'owner'));
create policy "owners create invitations" on public.invitations
  for insert to authenticated
  with check (public.has_org_role(org_id, 'owner') and created_by = auth.uid());
create policy "owners delete invitations" on public.invitations
  for delete to authenticated using (public.has_org_role(org_id, 'owner'));
revoke update on public.invitations from authenticated;

-- subscriptions: members can read; only the server writes.
create policy "members read subscription" on public.subscriptions
  for select to authenticated using (public.is_org_member(org_id));
revoke insert, update, delete on public.subscriptions from authenticated;

-- message_templates: owners and managers can read and edit.
create policy "members read templates" on public.message_templates
  for select to authenticated using (public.is_org_member(org_id));
create policy "members add templates" on public.message_templates
  for insert to authenticated with check (public.is_org_member(org_id));
create policy "members edit templates" on public.message_templates
  for update to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
create policy "members delete templates" on public.message_templates
  for delete to authenticated using (public.is_org_member(org_id));

-- ---------------------------------------------------------------------------
-- Actions that need to do several things at once
-- ---------------------------------------------------------------------------

-- Onboarding: create the business, make the caller its owner, and copy in the
-- default templates, all in one step (if anything fails, nothing is saved).
-- p_templates is a JSON array of {key, language, category, body}.
create or replace function public.create_organization(
  p_name text,
  p_business_type text,
  p_default_language text,
  p_alert_phone text,
  p_google_review_url text,
  p_templates jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_org_id uuid;
begin
  if v_user_id is null then
    raise exception 'You must be logged in to create a business.';
  end if;

  insert into public.organizations (name, business_type, default_language, alert_phone, google_review_url)
  values (trim(p_name), p_business_type, p_default_language, p_alert_phone, p_google_review_url)
  returning id into v_org_id;

  insert into public.memberships (org_id, user_id, role)
  values (v_org_id, v_user_id, 'owner');

  insert into public.subscriptions (org_id, status) values (v_org_id, 'manual');

  insert into public.message_templates (org_id, key, language, category, body)
  select v_org_id, t.key, t.language, t.category, t.body
  from jsonb_to_recordset(coalesce(p_templates, '[]'::jsonb))
    as t(key text, language text, category text, body text);

  return v_org_id;
end;
$$;

-- Shows the business name on the invite page before the person joins.
create or replace function public.get_invitation(p_token text)
returns table (org_name text, role text, is_valid boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select o.name, i.role, (i.accepted_at is null and i.expires_at > now())
  from public.invitations i
  join public.organizations o on o.id = i.org_id
  where i.token = p_token;
$$;

-- Accepting an invite: checks the link is still good and the plan has room.
create or replace function public.accept_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_invite public.invitations%rowtype;
  v_max_users integer;
  v_current_users integer;
begin
  if v_user_id is null then
    raise exception 'You must be logged in to accept an invitation.';
  end if;

  select * into v_invite from public.invitations where token = p_token for update;

  if not found or v_invite.accepted_at is not null or v_invite.expires_at <= now() then
    raise exception 'This invitation link is invalid or has expired. Ask the owner for a new one.';
  end if;

  if exists (select 1 from public.memberships where org_id = v_invite.org_id and user_id = v_user_id) then
    return v_invite.org_id;
  end if;

  select p.max_users into v_max_users
  from public.organizations o join public.plans p on p.id = o.plan_id
  where o.id = v_invite.org_id;

  select count(*) into v_current_users from public.memberships where org_id = v_invite.org_id;

  if v_current_users >= v_max_users then
    raise exception 'This business has reached its user limit for its plan.';
  end if;

  insert into public.memberships (org_id, user_id, role)
  values (v_invite.org_id, v_user_id, v_invite.role);

  update public.invitations
  set accepted_at = now(), accepted_by = v_user_id
  where id = v_invite.id;

  return v_invite.org_id;
end;
$$;

revoke execute on function public.create_organization(text, text, text, text, text, jsonb) from public, anon;
revoke execute on function public.get_invitation(text) from public, anon;
revoke execute on function public.accept_invitation(text) from public, anon;
grant execute on function public.create_organization(text, text, text, text, text, jsonb) to authenticated;
grant execute on function public.get_invitation(text) to authenticated;
grant execute on function public.accept_invitation(text) to authenticated;
