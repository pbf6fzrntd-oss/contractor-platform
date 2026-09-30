-- Stop the new application before rollback. Export reconciliation evidence first.
-- This removes new ledgers; restore the previous application version at the same time.
drop function if exists public.reconcile_sms_attempt(uuid,text,text,text,text,text);
drop function if exists public.apply_billing_snapshot(jsonb,text,uuid);
drop function if exists public.claim_billing_sync(text,text);
drop function if exists public.finish_sms_attempt(uuid,text,text,text,text,text);
drop function if exists public.reserve_sms_attempt(jsonb,date,integer,text,text);
drop function if exists public.queue_agreement_reminder(uuid,uuid,date,jsonb,timestamptz);
drop function if exists public.reserve_public_request(text,text,integer,integer,integer,integer,uuid);
drop table if exists public.sms_reconciliations, public.billing_events, public.billing_sync_leases, public.sms_attempts;
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
begin
  v := jsonb_populate_record(null::public.bookings, p_booking);
  if v.org_id is null or v.contact_id is null then
    raise exception 'BAD_REQUEST: business and customer are required';
  end if;

  -- One lock per business, so capacity checks and inserts happen one at a time.
  perform pg_advisory_xact_lock(hashtextextended('book_slot:' || v.org_id::text, 0));

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
  return v_id;
end;
$$;

revoke execute on function public.book_slot(jsonb, text, integer) from public, anon, authenticated;
