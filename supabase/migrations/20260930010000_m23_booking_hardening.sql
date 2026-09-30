-- Milestone 23: booking hardening.
--  * Bookings requested by a customer's AI agent wait for the customer to text YES.
--  * Requests waiting too long for the owner expire (and free the time slot).
--  * Reminder texts the day before, with a link to reschedule or cancel.
-- Additive only. Rollback: supabase/rollbacks/20260930010000_m23_booking_hardening.down.sql

alter table public.bookings
  -- AI-agent bookings: the customer must reply YES by this time, or the request is dropped.
  add column verify_by timestamptz,
  add column customer_verified_at timestamptz,
  -- Why the owner must approve, decided when the request came in (applied after the customer's YES).
  add column pending_reasons text[] not null default '{}',
  -- The customer replied C/YES to the reminder.
  add column customer_confirmed_at timestamptz,
  add column canceled_by text check (canceled_by is null or canceled_by in ('team', 'customer', 'system')),
  add column rescheduled_from uuid references public.bookings (id) on delete set null;

-- Reminder texts join the outbox.
alter table public.scheduled_messages drop constraint scheduled_messages_kind_check;
alter table public.scheduled_messages add constraint scheduled_messages_kind_check
  check (kind in ('estimate_followup', 'review_request', 'broadcast', 'booking_reminder'));

-- Requests nobody answered in time are marked expired.
alter table public.approval_requests drop constraint approval_requests_status_check;
alter table public.approval_requests add constraint approval_requests_status_check
  check (status in ('pending', 'approved', 'declined', 'expired'));

create index bookings_waiting_idx on public.bookings (status, created_at) where status in ('requested', 'pending_approval');

-- book_slot() now also saves the new fields (same checks and locking as Milestone 19).
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
