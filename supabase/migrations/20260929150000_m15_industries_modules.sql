-- Milestone 15: specific industries and the module framework.
-- Additive only. Existing businesses get industry = null (generic, exactly
-- as before) and the Home Services module.
-- Rollback: supabase/rollbacks/20260929150000_m15_industries_modules.down.sql

-- The business's specific industry (e.g. 'roofing', 'lawn_care'). The list of
-- valid keys lives in lib/industries/ (code), so adding an industry never
-- needs a migration. business_type keeps driving today's core behavior.
alter table public.organizations
  add column industry text check (industry is null or industry ~ '^[a-z][a-z0-9_]{1,39}$');

grant update (industry) on public.organizations to authenticated;

-- Which modules (feature packages) each business has. Home Services is the
-- flagship edition every existing business already uses. Billing links
-- (edition vs add-on, Stripe item) are added in Milestone 21.
create table public.org_modules (
  org_id uuid not null references public.organizations (id) on delete cascade,
  module text not null check (module ~ '^[a-z][a-z0-9_]{1,39}$'),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (org_id, module)
);

create trigger org_modules_updated_at
  before update on public.org_modules
  for each row execute function public.set_updated_at();

alter table public.org_modules enable row level security;
create policy "members read their modules" on public.org_modules
  for select to authenticated using (public.is_org_member(org_id));
-- Only the server (billing webhook, platform admin) turns modules on or off.
revoke insert, update, delete on public.org_modules from authenticated;

insert into public.org_modules (org_id, module)
select id, 'home_services' from public.organizations
on conflict do nothing;

-- Onboarding now also saves the industry and the starting module, in the
-- same single step. The new argument has a default, so older callers work.
drop function public.create_organization(text, text, text, jsonb, text, text);

create function public.create_organization(
  p_name text,
  p_business_type text,
  p_default_language text,
  p_templates jsonb,
  p_alert_phone text default null,
  p_google_review_url text default null,
  p_industry text default null
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

  insert into public.organizations (name, business_type, default_language, alert_phone, google_review_url, industry)
  values (trim(p_name), p_business_type, p_default_language, p_alert_phone, p_google_review_url, p_industry)
  returning id into v_org_id;

  insert into public.memberships (org_id, user_id, role)
  values (v_org_id, v_user_id, 'owner');

  insert into public.subscriptions (org_id, status) values (v_org_id, 'manual');

  insert into public.org_modules (org_id, module) values (v_org_id, 'home_services');

  insert into public.message_templates (org_id, key, language, category, body)
  select v_org_id, t.key, t.language, t.category, t.body
  from jsonb_to_recordset(coalesce(p_templates, '[]'::jsonb))
    as t(key text, language text, category text, body text);

  return v_org_id;
end;
$$;

revoke execute on function public.create_organization(text, text, text, jsonb, text, text, text) from public, anon;
grant execute on function public.create_organization(text, text, text, jsonb, text, text, text) to authenticated;
