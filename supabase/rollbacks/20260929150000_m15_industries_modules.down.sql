-- Rollback for Milestone 15. Deploy the pre-M15 code first.
drop function if exists public.create_organization(text, text, text, jsonb, text, text, text);
create function public.create_organization(
  p_name text, p_business_type text, p_default_language text, p_templates jsonb,
  p_alert_phone text default null, p_google_review_url text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid := auth.uid(); v_org_id uuid;
begin
  if v_user_id is null then raise exception 'You must be logged in to create a business.'; end if;
  insert into public.organizations (name, business_type, default_language, alert_phone, google_review_url)
  values (trim(p_name), p_business_type, p_default_language, p_alert_phone, p_google_review_url) returning id into v_org_id;
  insert into public.memberships (org_id, user_id, role) values (v_org_id, v_user_id, 'owner');
  insert into public.subscriptions (org_id, status) values (v_org_id, 'manual');
  insert into public.message_templates (org_id, key, language, category, body)
  select v_org_id, t.key, t.language, t.category, t.body
  from jsonb_to_recordset(coalesce(p_templates, '[]'::jsonb)) as t(key text, language text, category text, body text);
  return v_org_id;
end; $$;
revoke execute on function public.create_organization(text, text, text, jsonb, text, text) from public, anon;
grant execute on function public.create_organization(text, text, text, jsonb, text, text) to authenticated;
drop table if exists public.org_modules;
revoke update (industry) on public.organizations from authenticated;
alter table public.organizations drop column if exists industry;
