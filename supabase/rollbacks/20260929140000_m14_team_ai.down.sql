-- Rollback for Milestone 14 (run by hand only if you must undo it).
-- Managers' connections stop being listed for them; owners are unaffected.
drop policy if exists "members read their own keys" on public.api_keys;
alter table public.plans drop column if exists feature_team_ai;
