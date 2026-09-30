-- Milestone 21: editions, add-on modules, and the Executive / Enterprise plans.
-- Additive only: existing plans keep every current switch; new switches are
-- off except on Pilot (which gets everything, as before).
-- Rollback: supabase/rollbacks/20260929210000_m21_editions_addons.down.sql

-- New plan switches (checked only through lib/entitlements.ts).
alter table public.plans
  add column feature_agent_ready boolean not null default false,
  add column feature_booking boolean not null default false,
  add column feature_approvals boolean not null default false,
  add column feature_ai_voice boolean not null default false,
  -- How many industry add-on modules come with the plan at no extra charge.
  add column included_addons integer not null default 0 check (included_addons >= 0);

update public.plans set feature_agent_ready = true, feature_booking = true, feature_approvals = true, feature_ai_voice = true, included_addons = 99
where id = 'pilot';

-- Suggested prices (docs/PRICING.md). Edit any time in /admin -> Plans.
insert into public.plans
  (id, name, monthly_price_cents, max_users, max_phone_numbers, monthly_sms_limit,
   feature_recurring_customers, feature_bulk_messaging, feature_campaigns, feature_team_ai,
   feature_agent_ready, feature_booking, feature_approvals, feature_ai_voice, included_addons, is_public, sort_order)
values
  ('executive', 'Executive', 44900, 10, 2, 10000, true, true, true, true, true, true, true, true, 1, true, 3),
  ('enterprise', 'Enterprise', 89900, 50, 10, 50000, true, true, true, true, true, true, true, true, 99, false, 4)
on conflict (id) do nothing;

-- Things a business can add on top of its plan, each its own Stripe product.
-- kind 'module' = an industry module; kind 'feature' = unlocks plan switches (e.g. Agent Ready for Pro).
create table public.addon_catalog (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{1,39}$'),
  kind text not null check (kind in ('module', 'feature')),
  name text not null,
  description text not null default '',
  monthly_price_cents integer not null default 0 check (monthly_price_cents >= 0),
  stripe_price_id text unique,
  -- 'available' can be bought; 'coming_soon' is listed for sales only.
  status text not null default 'available' check (status in ('available', 'coming_soon')),
  sort_order integer not null default 0
);

insert into public.addon_catalog (key, kind, name, description, monthly_price_cents, status, sort_order) values
  ('agent_ready', 'feature', 'Agent Ready', 'Hosted profile, online booking page, approval rules, and booking by customers'' AI agents.', 9900, 'available', 0),
  ('recurring_home', 'module', 'Recurring Home Services', 'House cleaning, pest control and pool service: routes, access notes, service agreements.', 7900, 'coming_soon', 1),
  ('project_quote', 'module', 'Project & Quote Services', 'Moving, pressure washing, junk removal: photo quotes, deposits, daily capacity.', 7900, 'coming_soon', 2),
  ('pet_care', 'module', 'Pet Care', 'Grooming, boarding, mobile vet, training: pets, vaccine records, stays, packages.', 7900, 'coming_soon', 3),
  ('automotive', 'module', 'Automotive', 'Detailing, repair, mobile mechanic, tinting: vehicles, size pricing, bays, approvals.', 7900, 'coming_soon', 4);

alter table public.addon_catalog enable row level security;
create policy "add-ons are readable" on public.addon_catalog for select to authenticated using (true);
revoke insert, update, delete on public.addon_catalog from authenticated;

-- Edition = the business's main package (Home Services is the flagship).
alter table public.organizations add column edition text not null default 'home_services' check (edition ~ '^[a-z][a-z0-9_]{1,39}$');

-- Where each module/add-on came from, and its Stripe subscription item.
alter table public.org_modules
  add column source text not null default 'edition' check (source in ('edition', 'addon', 'included', 'pilot', 'admin')),
  add column stripe_subscription_item_id text;
