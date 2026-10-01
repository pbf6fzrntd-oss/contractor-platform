-- Internal trigger functions are not Data API RPCs. Trigger execution remains unaffected.
alter function public.set_updated_at() set search_path = '';
alter function public.leads_stage_timestamps() set search_path = '';
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.create_a2p_registration() from public, anon, authenticated;
revoke execute on function public.rh_visit_reports_same_org_job() from public, anon, authenticated;
