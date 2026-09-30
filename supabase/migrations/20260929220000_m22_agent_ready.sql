-- Milestone 22: Agent Ready (public profile, online booking, booking by customers' AI agents).
-- Additive only; every business's public profile is OFF until the owner turns it on.
-- Rollback: supabase/rollbacks/20260929220000_m22_agent_ready.down.sql
--
-- PUBLIC DATA RULE: visitors and outside AI agents only ever see what
-- public_business_profile() returns: an allow-list of business-level facts.
-- Never customers, private notes, codes, VINs or files.

alter table public.organizations
  add column slug text unique check (slug is null or slug ~ '^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])$'),
  add column public_profile_enabled boolean not null default false,
  -- about, service_area, show_prices. Shape: lib/public/profile.ts
  add column profile jsonb not null default '{}'::jsonb;

grant update (slug, public_profile_enabled, profile) on public.organizations to authenticated;

-- Consent given when a customer's AI agent books for them (the agent states the customer agreed).
alter table public.consent_events drop constraint consent_events_method_check;
alter table public.consent_events add constraint consent_events_method_check check (method in (
  'sms_keyword', 'owner_confirmed_reply', 'owner_recorded', 'web_form',
  'written_agreement', 'text_keyword', 'import_attestation', 'ai_agent_request'
));

-- Rate limiting for public pages and agents (IP addresses are stored only as a salted hash).
create table public.public_request_log (
  id bigint generated always as identity primary key,
  org_id uuid references public.organizations (id) on delete cascade,
  ip_hash text not null,
  kind text not null check (kind in ('lookup', 'booking')),
  created_at timestamptz not null default now()
);
create index public_request_log_idx on public.public_request_log (ip_hash, kind, created_at desc);
alter table public.public_request_log enable row level security;
revoke all on public.public_request_log from authenticated, anon;

-- Is this business's public profile live? (Owner switched it on, it has Agent
-- Ready through its plan or the add-on, and its account is in good standing.)
create or replace function public.public_profile_org(p_slug text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select o.id
  from public.organizations o
  join public.plans p on p.id = o.plan_id
  left join public.subscriptions s on s.org_id = o.id
  where o.slug = lower(p_slug)
    and o.public_profile_enabled
    and (p.feature_agent_ready or exists (
      select 1 from public.org_modules m where m.org_id = o.id and m.module = 'agent_ready' and m.enabled))
    and coalesce(s.status, 'manual') in ('manual', 'active', 'trialing', 'past_due');
$$;
revoke execute on function public.public_profile_org(text) from public, anon, authenticated;

-- The ONLY business data the public (people and AI agents) can read. Allow-list.
create or replace function public.public_business_profile(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org_id uuid := public.public_profile_org(p_slug);
  o public.organizations%rowtype;
  v_booking boolean;
  v_show_prices boolean;
begin
  if v_org_id is null then return null; end if;
  select * into o from public.organizations where id = v_org_id;
  v_show_prices := coalesce((o.profile ->> 'show_prices')::boolean, true);
  v_booking := o.booking_enabled and exists (
    select 1 from public.plans p where p.id = o.plan_id and p.feature_booking
  ) or (o.booking_enabled and exists (
    select 1 from public.org_modules m where m.org_id = o.id and m.module = 'agent_ready' and m.enabled
  ));
  return jsonb_build_object(
    'name', o.name,
    'slug', o.slug,
    'industry', o.industry,
    'business_type', o.business_type,
    'timezone', o.timezone,
    'about', left(o.profile ->> 'about', 1000),
    'service_area', left(o.profile ->> 'service_area', 300),
    'review_url', o.google_review_url,
    'phone', (select pn.e164 from public.phone_numbers pn where pn.org_id = o.id order by pn.created_at limit 1),
    'booking_available', v_booking,
    'hours', case when v_booking then jsonb_build_object(
      'open_days', coalesce(o.booking_settings -> 'openDays', '[1,2,3,4,5]'::jsonb),
      'open_hour', coalesce(o.booking_settings -> 'openHour', '8'::jsonb),
      'close_hour', coalesce(o.booking_settings -> 'closeHour', '17'::jsonb)) else null end,
    'service_zips', case when v_booking then coalesce(o.booking_settings -> 'serviceZips', '[]'::jsonb) else '[]'::jsonb end,
    'services', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name, 'name_es', s.name_es, 'booking_mode', s.booking_mode,
        'duration_minutes', s.duration_minutes,
        'price_from_cents', case when v_show_prices then s.price_from_cents end,
        'price_to_cents', case when v_show_prices then s.price_to_cents end,
        'price_unit', case when v_show_prices then s.price_unit end,
        'requires', s.required_documents
      ) order by s.sort_order, s.name)
      from public.service_catalog s
      where s.org_id = o.id and s.active and s.public and s.booking_mode <> 'recurring'
    ), '[]'::jsonb),
    'credentials', coalesce((
      select jsonb_agg(jsonb_build_object('kind', c.kind, 'label', c.label, 'number', c.number, 'issuer', c.issuer, 'expires_on', c.expires_on) order by c.created_at)
      from public.business_credentials c
      where c.org_id = o.id and c.show_on_profile and (c.expires_on is null or c.expires_on >= current_date)
    ), '[]'::jsonb)
  );
end;
$$;
revoke execute on function public.public_business_profile(text) from public;
grant execute on function public.public_business_profile(text) to anon, authenticated, service_role;
