-- Milestone 1: phone numbers, contacts, consent log, leads, calls, messages.
-- (Leads are created here because a missed call creates a lead.)

-- ---------------------------------------------------------------------------
-- Business phone numbers
-- ---------------------------------------------------------------------------

create table public.phone_numbers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  e164 text not null unique check (e164 ~ '^\+1[2-9][0-9]{9}$'),
  provider text not null default 'twilio' check (provider in ('twilio', 'simulator')),
  provider_sid text,
  -- Set once the number is attached to a registered (A2P) messaging service.
  messaging_service_sid text,
  -- forward_when_unanswered: the contractor keeps their own number and forwards
  --   unanswered calls here ("keep your number", the default).
  -- new_number: this number is the business line; calls ring forward_to first.
  setup_mode text not null default 'forward_when_unanswered'
    check (setup_mode in ('forward_when_unanswered', 'new_number')),
  forward_to text check (forward_to is null or forward_to ~ '^\+1[2-9][0-9]{9}$'),
  created_at timestamptz not null default now()
);

create index phone_numbers_org_id_idx on public.phone_numbers (org_id);

alter table public.phone_numbers enable row level security;
create policy "members read phone numbers" on public.phone_numbers
  for select to authenticated using (public.is_org_member(org_id));
create policy "owners update phone setup" on public.phone_numbers
  for update to authenticated
  using (public.has_org_role(org_id, 'owner')) with check (public.has_org_role(org_id, 'owner'));
revoke insert, update, delete on public.phone_numbers from authenticated;
grant update (setup_mode, forward_to) on public.phone_numbers to authenticated;

-- ---------------------------------------------------------------------------
-- Contacts: anyone who has called/texted, plus customers.
-- Consent state (opted_out_at, marketing_consent_at) can only be changed by
-- record_consent_event() so the log and the state always agree.
-- ---------------------------------------------------------------------------

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  phone text not null check (phone ~ '^\+1[2-9][0-9]{9}$'),
  name text check (name is null or char_length(name) <= 100),
  email text check (email is null or char_length(email) <= 200),
  address text check (address is null or char_length(address) <= 300),
  preferred_language text not null default 'en' check (preferred_language in ('en', 'es')),
  -- Suppliers, family, etc.: never send automatic texts.
  do_not_autotext boolean not null default false,
  opted_out_at timestamptz,
  marketing_consent_at timestamptz,
  review_requested_at timestamptz,
  notes text check (notes is null or char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, phone)
);

create trigger contacts_updated_at
  before update on public.contacts
  for each row execute function public.set_updated_at();

alter table public.contacts enable row level security;
create policy "members read contacts" on public.contacts
  for select to authenticated using (public.is_org_member(org_id));
create policy "members add contacts" on public.contacts
  for insert to authenticated with check (public.is_org_member(org_id));
create policy "members edit contacts" on public.contacts
  for update to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
create policy "owners delete contacts" on public.contacts
  for delete to authenticated using (public.has_org_role(org_id, 'owner'));
revoke insert, update on public.contacts from authenticated;
grant insert (org_id, phone, name, email, address, preferred_language, do_not_autotext, notes)
  on public.contacts to authenticated;
grant update (name, email, address, preferred_language, do_not_autotext, notes)
  on public.contacts to authenticated;

-- ---------------------------------------------------------------------------
-- Consent log: append-only. Never updated or deleted.
-- ---------------------------------------------------------------------------

create table public.consent_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  kind text not null check (kind in (
    'opt_out', 'opt_in', 'marketing_granted', 'marketing_revoked', 'service_texts_attested'
  )),
  method text not null check (method in (
    'sms_keyword', 'owner_confirmed_reply', 'owner_recorded', 'web_form',
    'written_agreement', 'text_keyword', 'import_attestation'
  )),
  evidence text check (evidence is null or char_length(evidence) <= 1000),
  recorded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index consent_events_contact_idx on public.consent_events (contact_id, created_at);

alter table public.consent_events enable row level security;
create policy "members read consent log" on public.consent_events
  for select to authenticated using (public.is_org_member(org_id));
revoke insert, update, delete on public.consent_events from authenticated;

-- The ONLY way consent changes: writes the log entry and updates the contact
-- together. Called by the server (webhooks) or by a logged-in team member.
create or replace function public.record_consent_event(
  p_org_id uuid,
  p_contact_id uuid,
  p_kind text,
  p_method text,
  p_evidence text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Logged-in users must belong to the business. (The server's admin key has
  -- no user id; anonymous visitors can't call this function at all.)
  if auth.uid() is not null and not public.is_org_member(p_org_id) then
    raise exception 'Not allowed.';
  end if;

  if not exists (select 1 from public.contacts where id = p_contact_id and org_id = p_org_id) then
    raise exception 'Contact not found.';
  end if;

  insert into public.consent_events (org_id, contact_id, kind, method, evidence, recorded_by)
  values (p_org_id, p_contact_id, p_kind, p_method, p_evidence, auth.uid());

  update public.contacts set
    opted_out_at = case
      when p_kind = 'opt_out' then coalesce(opted_out_at, now())
      when p_kind = 'opt_in' then null
      else opted_out_at end,
    marketing_consent_at = case
      when p_kind = 'marketing_granted' then coalesce(marketing_consent_at, now())
      when p_kind in ('marketing_revoked', 'opt_out') then null
      else marketing_consent_at end
  where id = p_contact_id;
end;
$$;

revoke execute on function public.record_consent_event(uuid, uuid, text, text, text) from public, anon;
grant execute on function public.record_consent_event(uuid, uuid, text, text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Leads: one conversation/opportunity with a contact.
-- Stage timestamps are set automatically by a trigger.
-- ---------------------------------------------------------------------------

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  stage text not null default 'new' check (stage in ('new', 'contacted', 'estimate_sent', 'won', 'lost')),
  source text not null default 'manual' check (source in ('missed_call', 'inbound_text', 'campaign', 'manual')),
  broadcast_id uuid,
  estimate_amount_cents integer check (estimate_amount_cents is null or estimate_amount_cents >= 0),
  notes text check (notes is null or char_length(notes) <= 5000),
  -- Needs the owner's attention: 'opt_out', 'cancel_keyword', 'possible_opt_out'.
  flag text check (flag is null or flag in ('opt_out', 'cancel_keyword', 'possible_opt_out')),
  unread boolean not null default true,
  last_message_at timestamptz not null default now(),
  first_response_at timestamptz,
  stage_changed_at timestamptz not null default now(),
  estimate_sent_at timestamptz,
  won_at timestamptz,
  lost_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index leads_org_recent_idx on public.leads (org_id, last_message_at desc);
create index leads_contact_idx on public.leads (contact_id);

create or replace function public.leads_stage_timestamps()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' or new.stage is distinct from old.stage then
    new.stage_changed_at = now();
    if new.stage = 'estimate_sent' then new.estimate_sent_at = now(); end if;
    if new.stage = 'won' then new.won_at = now(); end if;
    if new.stage = 'lost' then new.lost_at = now(); end if;
  end if;
  return new;
end;
$$;

create trigger leads_stage_timestamps
  before insert or update on public.leads
  for each row execute function public.leads_stage_timestamps();

create trigger leads_updated_at
  before update on public.leads
  for each row execute function public.set_updated_at();

alter table public.leads enable row level security;
create policy "members read leads" on public.leads
  for select to authenticated using (public.is_org_member(org_id));
create policy "members add leads" on public.leads
  for insert to authenticated with check (public.is_org_member(org_id));
create policy "members edit leads" on public.leads
  for update to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
create policy "owners delete leads" on public.leads
  for delete to authenticated using (public.has_org_role(org_id, 'owner'));
revoke insert, update on public.leads from authenticated;
grant insert (org_id, contact_id, stage, source, estimate_amount_cents, notes) on public.leads to authenticated;
grant update (stage, estimate_amount_cents, notes, flag, unread) on public.leads to authenticated;

-- ---------------------------------------------------------------------------
-- Calls and messages: written only by the server; team members can read.
-- ---------------------------------------------------------------------------

create table public.calls (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  lead_id uuid references public.leads (id) on delete set null,
  provider_sid text unique,
  status text not null default 'ringing' check (status in ('ringing', 'answered', 'missed')),
  -- Set when the owner pressed 1 to accept (so voicemail doesn't count as answered).
  accepted boolean not null default false,
  text_back_sent boolean not null default false,
  created_at timestamptz not null default now()
);

create index calls_org_contact_idx on public.calls (org_id, contact_id, created_at);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  lead_id uuid references public.leads (id) on delete set null,
  direction text not null check (direction in ('inbound', 'outbound')),
  body text not null,
  category text check (category is null or category in ('conversational', 'informational', 'marketing')),
  sender_type text not null check (sender_type in ('contact', 'user', 'automation')),
  sent_by uuid references auth.users (id) on delete set null,
  provider_sid text unique,
  status text not null check (status in ('received', 'queued', 'sent', 'delivered', 'failed', 'undelivered', 'blocked')),
  error text,
  flag text check (flag is null or flag in ('opt_out', 'opt_in', 'help', 'cancel_keyword', 'possible_opt_out')),
  -- Set on texts sent by a bulk send/campaign (Milestones 7-8), so replies can be attributed.
  broadcast_id uuid,
  created_at timestamptz not null default now()
);

create index messages_contact_idx on public.messages (org_id, contact_id, created_at);
create index messages_lead_idx on public.messages (lead_id, created_at);

alter table public.calls enable row level security;
alter table public.messages enable row level security;
create policy "members read calls" on public.calls
  for select to authenticated using (public.is_org_member(org_id));
create policy "members read messages" on public.messages
  for select to authenticated using (public.is_org_member(org_id));
revoke insert, update, delete on public.calls from authenticated;
revoke insert, update, delete on public.messages from authenticated;

-- ---------------------------------------------------------------------------
-- Monthly text usage, for plan limits.
-- ---------------------------------------------------------------------------

create table public.usage_counters (
  org_id uuid not null references public.organizations (id) on delete cascade,
  month date not null,
  sms_sent integer not null default 0,
  primary key (org_id, month)
);

alter table public.usage_counters enable row level security;
create policy "members read usage" on public.usage_counters
  for select to authenticated using (public.is_org_member(org_id));
revoke insert, update, delete on public.usage_counters from authenticated;

create or replace function public.increment_sms_usage(p_org_id uuid, p_month date, p_count integer default 1)
returns integer
language sql
security definer
set search_path = ''
as $$
  insert into public.usage_counters (org_id, month, sms_sent)
  values (p_org_id, p_month, p_count)
  on conflict (org_id, month) do update set sms_sent = public.usage_counters.sms_sent + excluded.sms_sent
  returning sms_sent;
$$;

revoke execute on function public.increment_sms_usage(uuid, date, integer) from public, anon, authenticated;
grant execute on function public.increment_sms_usage(uuid, date, integer) to service_role;

-- ---------------------------------------------------------------------------
-- Notifications to the business owner (new lead alerts, etc.). Also texted to
-- the owner's cell when a real phone number is connected.
-- ---------------------------------------------------------------------------

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  kind text not null check (kind in ('new_lead', 'flagged_reply', 'system')),
  body text not null,
  link text,
  sms_status text not null default 'not_sent' check (sms_status in ('not_sent', 'sent', 'failed')),
  created_at timestamptz not null default now()
);

create index notifications_org_idx on public.notifications (org_id, created_at desc);

alter table public.notifications enable row level security;
create policy "members read notifications" on public.notifications
  for select to authenticated using (public.is_org_member(org_id));
revoke insert, update, delete on public.notifications from authenticated;

-- ---------------------------------------------------------------------------
-- Carrier (A2P 10DLC) registration per business. Texting to the public only
-- turns on when status = 'approved' (the app's simulator works without it).
-- Owners fill in the details; the platform admin updates status and IDs.
-- ---------------------------------------------------------------------------

create table public.a2p_registrations (
  org_id uuid primary key references public.organizations (id) on delete cascade,
  status text not null default 'not_started'
    check (status in ('not_started', 'submitted', 'in_review', 'approved', 'rejected')),
  brand_type text not null default 'standard' check (brand_type in ('standard', 'sole_proprietor')),
  legal_name text,
  ein text,
  business_address text,
  website text,
  contact_name text,
  contact_email text,
  contact_phone text,
  use_case_description text,
  opt_in_description text,
  sample_messages jsonb not null default '[]'::jsonb,
  twilio_brand_sid text,
  twilio_campaign_sid text,
  admin_notes text,
  submitted_at timestamptz,
  decided_at timestamptz,
  updated_at timestamptz not null default now()
);

create trigger a2p_registrations_updated_at
  before update on public.a2p_registrations
  for each row execute function public.set_updated_at();

alter table public.a2p_registrations enable row level security;
create policy "owners read registration" on public.a2p_registrations
  for select to authenticated using (public.has_org_role(org_id, 'owner'));
create policy "owners edit registration details" on public.a2p_registrations
  for update to authenticated
  using (public.has_org_role(org_id, 'owner') and status in ('not_started', 'rejected'))
  with check (public.has_org_role(org_id, 'owner'));
revoke insert, update, delete on public.a2p_registrations from authenticated;
grant update (brand_type, legal_name, ein, business_address, website, contact_name, contact_email,
  contact_phone, use_case_description, opt_in_description, sample_messages)
  on public.a2p_registrations to authenticated;

-- New businesses start with an empty registration record.
create or replace function public.create_a2p_registration()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.a2p_registrations (org_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

create trigger organizations_create_a2p_registration
  after insert on public.organizations
  for each row execute function public.create_a2p_registration();

insert into public.a2p_registrations (org_id) select id from public.organizations on conflict do nothing;
