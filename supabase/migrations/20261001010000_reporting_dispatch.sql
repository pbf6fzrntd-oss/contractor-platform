-- One atomic claim contract for scheduler, simulator, broadcasts and selected IDs.
create or replace function public.claim_scheduled_messages(
  p_now timestamptz,
  p_limit integer default 100,
  p_org_id uuid default null,
  p_broadcast_id uuid default null,
  p_ids uuid[] default null,
  p_fast_forward boolean default false
)
returns setof public.scheduled_messages
language plpgsql security definer set search_path = ''
as $$
begin
  if p_now is null or p_limit is null or p_limit < 1 or p_limit > 1000 then
    raise exception 'Invalid dispatch claim';
  end if;
  if p_fast_forward and (p_org_id is null or not exists (
    select 1 from public.phone_numbers where org_id = p_org_id and provider = 'simulator'
  )) then
    raise exception 'Fast forward requires a simulator business';
  end if;
  return query
    update public.scheduled_messages s
    set status = 'processing', attempts = s.attempts + 1, processed_at = now()
    where s.id in (
      select q.id from public.scheduled_messages q
      where (p_org_id is null or q.org_id = p_org_id)
        and (p_broadcast_id is null or q.broadcast_id = p_broadcast_id)
        and (p_ids is null or q.id = any(p_ids))
        and (
          (q.status = 'pending' and (p_fast_forward or q.send_at <= p_now))
          or (q.status = 'processing' and q.processed_at < now() - interval '10 minutes' and q.attempts < 3)
        )
      order by q.send_at, q.id
      limit p_limit
      for update skip locked
    )
    returning s.*;
end;
$$;

revoke execute on function public.claim_scheduled_messages(timestamptz, integer, uuid, uuid, uuid[], boolean) from public, anon, authenticated;
grant execute on function public.claim_scheduled_messages(timestamptz, integer, uuid, uuid, uuid[], boolean) to service_role;

-- Keep old callers on the same claim contract during coordinated rollout.
create or replace function public.claim_due_scheduled_messages(p_now timestamptz, p_limit integer default 100)
returns setof public.scheduled_messages language sql security definer set search_path = ''
as $$ select * from public.claim_scheduled_messages(p_now, p_limit); $$;
revoke execute on function public.claim_due_scheduled_messages(timestamptz, integer) from public, anon, authenticated;
grant execute on function public.claim_due_scheduled_messages(timestamptz, integer) to service_role;
