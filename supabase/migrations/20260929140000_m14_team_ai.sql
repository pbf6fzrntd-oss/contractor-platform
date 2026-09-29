-- Milestone 14: office managers can connect their own AI tools.
-- Additive only: existing owners' keys and connections behave exactly as before.
-- Rollback: supabase/rollbacks/20260929140000_m14_team_ai.down.sql

-- Plan switch: AI tools for office managers (Executive tier; pilots get everything).
alter table public.plans add column feature_team_ai boolean not null default false;
update public.plans set feature_team_ai = true where id = 'pilot';

-- Managers see (and the app lets them revoke) only the connections they made.
-- Owners keep seeing every connection through the existing owner policy.
create policy "members read their own keys" on public.api_keys
  for select to authenticated
  using (public.is_org_member(org_id) and created_by = auth.uid());
