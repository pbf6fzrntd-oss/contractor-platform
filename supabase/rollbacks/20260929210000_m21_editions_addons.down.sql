-- Rollback for Milestone 21. Move businesses off executive/enterprise first.
alter table public.org_modules drop column if exists stripe_subscription_item_id, drop column if exists source;
alter table public.organizations drop column if exists edition;
drop table if exists public.addon_catalog;
delete from public.plans where id in ('executive', 'enterprise') and not exists (select 1 from public.organizations o where o.plan_id = plans.id);
alter table public.plans
  drop column if exists included_addons,
  drop column if exists feature_ai_voice,
  drop column if exists feature_approvals,
  drop column if exists feature_booking,
  drop column if exists feature_agent_ready;
