-- Deploy the prior application before running this rollback with dispatch stopped.
drop function public.claim_due_scheduled_messages(timestamptz, integer);
drop function public.claim_scheduled_messages(timestamptz, integer, uuid, uuid, uuid[], boolean);
create function public.claim_due_scheduled_messages(p_now timestamptz, p_limit integer default 100)
returns setof public.scheduled_messages language sql security definer set search_path = ''
as $$
  update public.scheduled_messages s
  set status = 'processing', attempts = s.attempts + 1, processed_at = now()
  where s.id in (
    select id from public.scheduled_messages
    where (status = 'pending' and send_at <= p_now)
       or (status = 'processing' and processed_at < now() - interval '10 minutes' and attempts < 3)
    order by send_at limit p_limit for update skip locked
  ) returning s.*;
$$;
revoke execute on function public.claim_due_scheduled_messages(timestamptz, integer) from public, anon, authenticated;
grant execute on function public.claim_due_scheduled_messages(timestamptz, integer) to service_role;
