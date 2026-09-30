-- Transactional recovery safeguards. Deploy before this application version.
create or replace function public.book_slot(p_booking jsonb, p_capacity_scope text, p_capacity integer default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.bookings%rowtype;
  v_id uuid;
  v_taken integer;
  v_night date;
  v_pkg public.packages%rowtype;
  v_used integer;
  v_old public.bookings%rowtype;
begin
  v := jsonb_populate_record(null::public.bookings, p_booking);
  if v.org_id is null or v.contact_id is null then
    raise exception 'BAD_REQUEST: business and customer are required';
  end if;

  -- One lock per business, so capacity checks and inserts happen one at a time.
  perform pg_advisory_xact_lock(hashtextextended('book_slot:' || v.org_id::text, 0));

  -- Canceling the old slot is rolled back if any replacement check or write fails.
  if v.rescheduled_from is not null then
    select * into v_old from public.bookings where id = v.rescheduled_from for update;
    if not found or v_old.org_id <> v.org_id or v_old.contact_id <> v.contact_id
       or v_old.service_id is distinct from v.service_id
       or v_old.package_id is distinct from v.package_id
       or v_old.status not in ('requested', 'pending_approval', 'confirmed') or v_old.starts_at <= now() then
      raise exception 'CHANGED: the old booking is no longer changeable';
    end if;
    update public.bookings set status = 'canceled', canceled_by = 'customer', notes = 'Moved by customer.' where id = v_old.id;
    update public.approval_requests set status = 'declined', decided_at = now() where booking_id = v_old.id and status = 'pending';
  end if;

  if p_capacity_scope = 'window' then
    select count(*) into v_taken from public.bookings b
    where b.org_id = v.org_id and b.mode = 'arrival_window' and b.starts_at = v.starts_at and b.ends_at = v.ends_at
      and b.status in ('requested', 'pending_approval', 'confirmed', 'in_progress');
    if v_taken >= coalesce(p_capacity, 1) then raise exception 'FULL: that arrival window is full'; end if;
  elsif p_capacity_scope = 'day' then
    select count(*) into v_taken from public.bookings b
    where b.org_id = v.org_id and b.mode = 'day_capacity' and b.service_date = v.service_date
      and b.service_id is not distinct from v.service_id
      and b.status in ('requested', 'pending_approval', 'confirmed', 'in_progress');
    if v_taken >= coalesce(p_capacity, 1) then raise exception 'FULL: that day is full'; end if;
  elsif p_capacity_scope = 'nights' then
    if v.check_in is null or v.check_out is null then raise exception 'BAD_REQUEST: stay dates are required'; end if;
    for v_night in select generate_series(v.check_in, v.check_out - 1, interval '1 day')::date loop
      select count(*) into v_taken from public.bookings b
      where b.org_id = v.org_id and b.mode = 'multi_day_reservation' and b.unit_class is not distinct from v.unit_class
        and b.check_in <= v_night and v_night < b.check_out
        and b.status in ('requested', 'pending_approval', 'confirmed', 'in_progress');
      if v_taken >= coalesce(p_capacity, 1) then raise exception 'FULL: % is full', v_night; end if;
    end loop;
  elsif p_capacity_scope not in ('resource', 'none') then
    raise exception 'BAD_REQUEST: unknown capacity scope';
  end if;

  if v.package_id is not null then
    select * into v_pkg from public.packages where id = v.package_id and org_id = v.org_id for update;
    if not found then raise exception 'BAD_REQUEST: package not found'; end if;
    if v_pkg.expires_on is not null and v.service_date > v_pkg.expires_on then raise exception 'PACKAGE_EXPIRED: the package has expired'; end if;
    select count(*) into v_used from public.bookings b
    where b.package_id = v_pkg.id and b.status not in ('canceled');
    if v_used >= v_pkg.sessions_total then raise exception 'NO_SESSIONS: no sessions left in the package'; end if;
  end if;

  begin
    insert into public.bookings (
      org_id, contact_id, lead_id, subject_id, service_id, package_id, resource_id, mode, status, source,
      starts_at, ends_at, service_date, check_in, check_out, unit_class, travel_before_minutes, travel_after_minutes,
      service_zip, address, price_cents, customer_notes, notes, created_by,
      verify_by, pending_reasons, rescheduled_from
    ) values (
      v.org_id, v.contact_id, v.lead_id, v.subject_id, v.service_id, v.package_id, v.resource_id, v.mode,
      coalesce(v.status, 'confirmed'), coalesce(v.source, 'owner'),
      v.starts_at, v.ends_at, v.service_date, v.check_in, v.check_out, v.unit_class,
      coalesce(v.travel_before_minutes, 0), coalesce(v.travel_after_minutes, 0),
      v.service_zip, v.address, v.price_cents, v.customer_notes, v.notes, v.created_by,
      v.verify_by, coalesce(v.pending_reasons, '{}'), v.rescheduled_from
    ) returning id into v_id;
  exception when exclusion_violation then
    raise exception 'OVERLAP: that time was just taken';
  end;
  if v.status = 'pending_approval' then
    insert into public.approval_requests (org_id, kind, booking_id, lead_id, contact_id, reasons)
    values (v.org_id, 'booking', v_id, v.lead_id, v.contact_id,
      array(select jsonb_array_elements_text(coalesce(p_booking->'approval_reasons', '[]'::jsonb))));
  end if;
  return v_id;
end;
$$;

revoke execute on function public.book_slot(jsonb, text, integer) from public, anon, authenticated;

grant execute on function public.book_slot(jsonb, text, integer) to service_role;

-- Count and reservation share locks: simultaneous requests cannot all pass.
create or replace function public.reserve_public_request(p_ip_hash text, p_kind text,
  p_per_ip integer, p_window_minutes integer, p_per_org integer, p_per_site integer, p_org_id uuid default null)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if p_kind not in ('lookup','booking','demo') or p_per_ip < 1 or p_window_minutes < 1
    or p_per_org < 0 or p_per_site < 0 or p_ip_hash is null then raise exception 'BAD_LIMIT'; end if;
  -- Global/org lock always comes first, then visitor: no reversed lock ordering.
  if p_per_site > 0 then perform pg_advisory_xact_lock(hashtextextended('public:site:' || p_kind,0)); end if;
  if p_per_org > 0 and p_org_id is not null then perform pg_advisory_xact_lock(hashtextextended('public:org:' || p_org_id::text || ':' || p_kind,0)); end if;
  perform pg_advisory_xact_lock(hashtextextended('public:ip:' || p_ip_hash || ':' || p_kind,0));
  if (select count(*) from public.public_request_log where ip_hash=p_ip_hash and kind=p_kind and created_at >= now()-make_interval(mins=>p_window_minutes)) >= p_per_ip then return false; end if;
  if p_per_site > 0 and (select count(*) from public.public_request_log where kind=p_kind and created_at >= now()-interval '24 hours') >= p_per_site then return false; end if;
  if p_per_org > 0 and p_org_id is not null and (select count(*) from public.public_request_log where org_id=p_org_id and kind=p_kind and created_at >= now()-interval '24 hours') >= p_per_org then return false; end if;
  insert into public.public_request_log(org_id,ip_hash,kind) values(p_org_id,p_ip_hash,p_kind);
  return true;
end; $$;
revoke execute on function public.reserve_public_request(text,text,integer,integer,integer,integer,uuid) from public,anon,authenticated;
grant execute on function public.reserve_public_request(text,text,integer,integer,integer,integer,uuid) to service_role;

-- Reminder reservation and agreement marker are one transaction.
create or replace function public.queue_agreement_reminder(p_org_id uuid,p_agreement_id uuid,p_expected_end date,p_context jsonb,p_send_at timestamptz)
returns boolean language plpgsql security definer set search_path='' as $$
declare a public.rh_agreements%rowtype;
begin
  select * into a from public.rh_agreements where id=p_agreement_id and org_id=p_org_id for update;
  if not found or a.status <> 'active' or a.ends_on is distinct from p_expected_end or p_expected_end is null then return false; end if;
  if a.renewal_notice_for = a.ends_on then return false; end if;
  insert into public.scheduled_messages(org_id,contact_id,kind,category,send_at,context)
    values(a.org_id,a.contact_id,'module_notice','informational',p_send_at,p_context);
  update public.rh_agreements set renewal_notice_for=a.ends_on where id=a.id;
  return true;
end; $$;
revoke execute on function public.queue_agreement_reminder(uuid,uuid,date,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.queue_agreement_reminder(uuid,uuid,date,jsonb,timestamptz) to service_role;

-- Durable provider attempts: never replay an ambiguous external side effect.
create table public.sms_attempts (
  org_id uuid not null references public.organizations(id) on delete cascade,
  request_key text not null,
  fingerprint text not null,
  message_id uuid not null references public.messages(id) on delete cascade,
  month date not null,
  state text not null check(state in ('submitting','accepted','rejected','unknown')),
  created_at timestamptz not null default now(),
  primary key(org_id,request_key)
);
alter table public.sms_attempts enable row level security;
revoke all on public.sms_attempts from anon,authenticated;

create or replace function public.reserve_sms_attempt(p_message jsonb,p_month date,p_limit integer,p_key text,p_fingerprint text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.messages%rowtype; a public.sms_attempts%rowtype; n integer; id uuid;
begin
  m:=jsonb_populate_record(null::public.messages,p_message);
  if m.org_id is null or m.contact_id is null or p_key is null or p_limit < 1 then raise exception 'BAD_REQUEST'; end if;
  perform pg_advisory_xact_lock(hashtextextended('sms:'||m.org_id::text,0));
  select * into a from public.sms_attempts where org_id=m.org_id and request_key=p_key;
  if found then
    if a.fingerprint <> p_fingerprint then raise exception 'REQUEST_KEY_REUSED'; end if;
    return jsonb_build_object('fresh',false,'message_id',a.message_id,'state',a.state);
  end if;
  if not exists(select 1 from public.contacts c where c.id=m.contact_id and c.org_id=m.org_id) then raise exception 'BAD_CONTACT'; end if;
  insert into public.usage_counters(org_id,month,sms_sent) values(m.org_id,p_month,0) on conflict do nothing;
  select sms_sent into n from public.usage_counters where org_id=m.org_id and month=p_month for update;
  if n >= p_limit then return jsonb_build_object('limited',true); end if;
  insert into public.messages(org_id,contact_id,lead_id,broadcast_id,direction,body,category,sender_type,sent_by,status,error)
    values(m.org_id,m.contact_id,m.lead_id,m.broadcast_id,'outbound',m.body,m.category,m.sender_type,m.sent_by,'queued','delivery_unknown: provider attempt reserved; reconcile before retry') returning messages.id into id;
  insert into public.sms_attempts(org_id,request_key,fingerprint,message_id,month,state) values(m.org_id,p_key,p_fingerprint,id,p_month,'submitting');
  update public.usage_counters set sms_sent=sms_sent+1 where org_id=m.org_id and month=p_month;
  return jsonb_build_object('fresh',true,'message_id',id,'state','submitting','usage',n+1);
end; $$;
revoke execute on function public.reserve_sms_attempt(jsonb,date,integer,text,text) from public,anon,authenticated;
grant execute on function public.reserve_sms_attempt(jsonb,date,integer,text,text) to service_role;

create or replace function public.finish_sms_attempt(p_org_id uuid,p_key text,p_state text,p_status text,p_sid text default null,p_error text default null)
returns boolean language plpgsql security definer set search_path='' as $$
declare a public.sms_attempts%rowtype;
begin
  if p_state not in ('accepted','rejected','unknown') then raise exception 'BAD_STATE'; end if;
  perform pg_advisory_xact_lock(hashtextextended('sms:'||p_org_id::text,0));
  select * into a from public.sms_attempts where org_id=p_org_id and request_key=p_key for update;
  if not found then raise exception 'NO_ATTEMPT'; end if;
  if a.state <> 'submitting' then return a.state=p_state; end if;
  update public.messages set status=p_status,provider_sid=p_sid,error=p_error where id=a.message_id;
  update public.sms_attempts set state=p_state where org_id=p_org_id and request_key=p_key;
  if p_state='rejected' then update public.usage_counters set sms_sent=greatest(0,sms_sent-1) where org_id=p_org_id and month=a.month; end if;
  return true;
end; $$;
revoke execute on function public.finish_sms_attempt(uuid,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.finish_sms_attempt(uuid,text,text,text,text,text) to service_role;

-- Lease serializes retrieval of the CURRENT Stripe subscription, not stale event payloads.
create table public.billing_sync_leases(subscription_id text primary key, token uuid not null, expires_at timestamptz not null);
create table public.billing_events(event_id text primary key, subscription_id text not null, applied_at timestamptz not null default now());
alter table public.billing_sync_leases enable row level security;
alter table public.billing_events enable row level security;
revoke all on public.billing_sync_leases,public.billing_events from anon,authenticated;
create or replace function public.claim_billing_sync(p_subscription_id text,p_event_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare t uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('billing:'||p_subscription_id,0));
  if exists(select 1 from public.billing_events where event_id=p_event_id) then return '{"done":true}'::jsonb; end if;
  if exists(select 1 from public.billing_sync_leases where subscription_id=p_subscription_id and expires_at > now()) then return '{"busy":true}'::jsonb; end if;
  t:=gen_random_uuid();
  insert into public.billing_sync_leases values(p_subscription_id,t,now()+interval '2 minutes')
    on conflict(subscription_id) do update set token=excluded.token,expires_at=excluded.expires_at;
  return jsonb_build_object('token',t);
end; $$;
revoke execute on function public.claim_billing_sync(text,text) from public,anon,authenticated;
grant execute on function public.claim_billing_sync(text,text) to service_role;

create or replace function public.apply_billing_snapshot(p_snapshot jsonb,p_event_id text,p_token uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare o uuid; sid text; a jsonb; active boolean;
begin
  sid:=p_snapshot->>'subscription_id'; o:=(p_snapshot->>'org_id')::uuid;
  perform pg_advisory_xact_lock(hashtextextended('billing:'||sid,0));
  if not exists(select 1 from public.billing_sync_leases where subscription_id=sid and token=p_token and expires_at>now()) then raise exception 'LEASE_EXPIRED'; end if;
  perform 1 from public.organizations where id=o for update;
  if not found then raise exception 'BUSINESS_NOT_FOUND'; end if;
  insert into public.subscriptions(org_id,stripe_customer_id,stripe_subscription_id,status,current_period_end)
    values(o,p_snapshot->>'customer_id',sid,p_snapshot->>'status',(p_snapshot->>'period_end')::timestamptz)
    on conflict(org_id) do update set stripe_customer_id=excluded.stripe_customer_id,stripe_subscription_id=excluded.stripe_subscription_id,status=excluded.status,current_period_end=excluded.current_period_end;
  if p_snapshot->>'plan_id' is not null then update public.organizations set plan_id=p_snapshot->>'plan_id' where id=o; end if;
  active:=(p_snapshot->>'active')::boolean;
  update public.org_modules set enabled=false where org_id=o and source='addon';
  for a in select * from jsonb_array_elements(p_snapshot->'addons') loop
    insert into public.org_modules(org_id,module,enabled,source,stripe_subscription_item_id)
      values(o,a->>'key',active,'addon',a->>'itemId')
      on conflict(org_id,module) do update set enabled=excluded.enabled,stripe_subscription_item_id=excluded.stripe_subscription_item_id
        where org_modules.source='addon';
  end loop;
  insert into public.billing_events(event_id,subscription_id) values(p_event_id,sid);
  delete from public.billing_sync_leases where subscription_id=sid and token=p_token;
  return true;
end; $$;
revoke execute on function public.apply_billing_snapshot(jsonb,text,uuid) from public,anon,authenticated;
grant execute on function public.apply_billing_snapshot(jsonb,text,uuid) to service_role;

create table public.sms_reconciliations (
 id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id) on delete cascade,
 request_key text not null, decision text not null check(decision in ('accepted','rejected')),
 evidence text not null, actor text not null, created_at timestamptz not null default now()
);
alter table public.sms_reconciliations enable row level security;
revoke all on public.sms_reconciliations from anon,authenticated;
create or replace function public.reconcile_sms_attempt(p_org_id uuid,p_key text,p_decision text,p_evidence text,p_actor text,p_sid text default null)
returns boolean language plpgsql security definer set search_path='' as $$
declare a public.sms_attempts%rowtype;
begin
 if p_decision not in ('accepted','rejected') or length(trim(p_evidence))<10 or length(trim(p_actor))<3
    or (p_decision='accepted' and coalesce(length(trim(p_sid)),0)=0) then raise exception 'EVIDENCE_REQUIRED'; end if;
 perform pg_advisory_xact_lock(hashtextextended('sms:'||p_org_id::text,0));
 select * into a from public.sms_attempts where org_id=p_org_id and request_key=p_key for update;
 if not found or a.state not in ('submitting','unknown') or a.created_at>now()-interval '2 minutes' then return false; end if;
 update public.messages set status=case when p_decision='accepted' then 'queued' else 'failed' end,
   provider_sid=p_sid,error=case when p_decision='accepted' then null else 'Reconciled rejection: '||p_evidence end where id=a.message_id;
 update public.sms_attempts set state=p_decision where org_id=p_org_id and request_key=p_key;
 if p_decision='rejected' then update public.usage_counters set sms_sent=greatest(0,sms_sent-1) where org_id=p_org_id and month=a.month; end if;
 insert into public.sms_reconciliations(org_id,request_key,decision,evidence,actor) values(p_org_id,p_key,p_decision,p_evidence,p_actor);
 return true;
end; $$;
revoke execute on function public.reconcile_sms_attempt(uuid,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.reconcile_sms_attempt(uuid,text,text,text,text,text) to service_role;
