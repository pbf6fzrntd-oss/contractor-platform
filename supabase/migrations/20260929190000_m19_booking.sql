-- Milestone 19: the shared booking engine.
-- Additive only; booking is OFF for every business until the owner turns it on.
-- Rollback: supabase/rollbacks/20260929190000_m19_booking.down.sql
--
-- The rules for each booking mode are pure functions in lib/booking/rules.ts.
-- book_slot() below re-checks capacity inside a lock when a booking is saved,
-- so two customers (or AI agents) can't take the last spot at the same moment.

create extension if not exists btree_gist;

alter table public.organizations
  add column booking_enabled boolean not null default false,
  -- Shape and defaults: lib/booking/settings.ts
  add column booking_settings jsonb not null default '{}'::jsonb;

grant update (booking_enabled, booking_settings) on public.organizations to authenticated;

-- ---------------------------------------------------------------------------
-- What can be booked
-- ---------------------------------------------------------------------------
create table public.service_catalog (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  key text check (key is null or key ~ '^[a-z0-9_]{1,40}$'),
  name text not null check (char_length(name) between 1 and 100),
  name_es text check (name_es is null or char_length(name_es) <= 100),
  booking_mode text not null check (booking_mode in ('arrival_window', 'fixed_appointment', 'day_capacity', 'multi_day_reservation', 'recurring', 'mobile_appointment', 'package_sessions')),
  duration_minutes integer not null default 60 check (duration_minutes between 5 and 1440),
  daily_capacity integer check (daily_capacity is null or daily_capacity between 1 and 500),
  resource_kind text check (resource_kind is null or resource_kind ~ '^[a-z_]{1,30}$'),
  unit_class text check (unit_class is null or unit_class ~ '^[a-z_]{1,30}$'),
  price_from_cents integer check (price_from_cents is null or price_from_cents >= 0),
  price_to_cents integer check (price_to_cents is null or price_to_cents >= 0),
  price_unit text check (price_unit is null or price_unit in ('job', 'visit', 'hour', 'night', 'session', 'month', 'package')),
  required_documents text[] not null default '{}',
  min_notice_hours integer not null default 0 check (min_notice_hours between 0 and 720),
  min_nights integer check (min_nights is null or min_nights >= 1),
  max_nights integer check (max_nights is null or max_nights >= 1),
  -- Shown on the public booking page (M22) and to outside AI agents.
  public boolean not null default true,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index service_catalog_org_idx on public.service_catalog (org_id, active);
create trigger service_catalog_updated_at before update on public.service_catalog for each row execute function public.set_updated_at();

-- Who or what does the work: crews, technicians, groomers, bays, vans, kennel runs.
create table public.resources (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  kind text not null check (kind ~ '^[a-z_]{1,30}$'),
  -- Kennel runs: size class and how many pets fit (nightly capacity).
  unit_class text check (unit_class is null or unit_class ~ '^[a-z_]{1,30}$'),
  capacity integer not null default 1 check (capacity between 1 and 200),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index resources_org_idx on public.resources (org_id);

-- Prepaid session packages (training lessons, daycare packs).
create table public.packages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  subject_id uuid references public.subjects (id) on delete set null,
  service_id uuid references public.service_catalog (id) on delete set null,
  name text not null check (char_length(name) between 1 and 100),
  sessions_total integer not null check (sessions_total between 1 and 500),
  expires_on date,
  created_at timestamptz not null default now()
);
create index packages_contact_idx on public.packages (org_id, contact_id);
create trigger packages_same_org before insert or update on public.packages for each row execute function public.check_same_org_contact();

-- ---------------------------------------------------------------------------
-- Bookings
-- ---------------------------------------------------------------------------
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  lead_id uuid references public.leads (id) on delete set null,
  subject_id uuid references public.subjects (id) on delete set null,
  service_id uuid references public.service_catalog (id) on delete set null,
  package_id uuid references public.packages (id) on delete set null,
  resource_id uuid references public.resources (id) on delete set null,
  mode text not null check (mode in ('arrival_window', 'fixed_appointment', 'day_capacity', 'multi_day_reservation', 'recurring', 'mobile_appointment', 'package_sessions')),
  status text not null default 'confirmed' check (status in ('requested', 'pending_approval', 'confirmed', 'in_progress', 'completed', 'canceled', 'no_show')),
  source text not null default 'owner' check (source in ('owner', 'team', 'customer_link', 'ai_assistant', 'outside_agent', 'voice')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  service_date date not null,
  check_in date,
  check_out date,
  unit_class text,
  travel_before_minutes integer not null default 0 check (travel_before_minutes between 0 and 240),
  travel_after_minutes integer not null default 0 check (travel_after_minutes between 0 and 240),
  -- The time this booking blocks on its resource (set by trigger from the fields above).
  blocked_from timestamptz,
  blocked_until timestamptz,
  service_zip text check (service_zip is null or service_zip ~ '^[0-9]{5}$'),
  address text check (address is null or char_length(address) <= 200),
  price_cents integer check (price_cents is null or price_cents >= 0),
  customer_notes text check (customer_notes is null or char_length(customer_notes) <= 1000),
  notes text check (notes is null or char_length(notes) <= 2000),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (check_in is null or check_out > check_in)
);
create index bookings_org_date_idx on public.bookings (org_id, service_date);
create index bookings_contact_idx on public.bookings (org_id, contact_id);

create or replace function public.bookings_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.blocked_from := new.starts_at - make_interval(mins => new.travel_before_minutes);
  new.blocked_until := new.ends_at + make_interval(mins => new.travel_after_minutes);
  return new;
end;
$$;
create trigger bookings_blocked before insert or update on public.bookings for each row execute function public.bookings_before_write();
create trigger bookings_same_org before insert or update on public.bookings for each row execute function public.check_same_org_contact();
create trigger bookings_updated_at before update on public.bookings for each row execute function public.set_updated_at();

-- A resource (groomer, bay, technician) can never hold two overlapping visits.
alter table public.bookings add constraint bookings_no_resource_overlap
  exclude using gist (resource_id with =, tstzrange(blocked_from, blocked_until) with &&)
  where (resource_id is not null and status in ('requested', 'pending_approval', 'confirmed', 'in_progress'));

-- ---------------------------------------------------------------------------
-- Row-level security: team members see and manage their own business's
-- bookings; new bookings are created only through book_slot() on the server.
-- ---------------------------------------------------------------------------
alter table public.service_catalog enable row level security;
alter table public.resources enable row level security;
alter table public.packages enable row level security;
alter table public.bookings enable row level security;

create policy "members read services" on public.service_catalog for select to authenticated using (public.is_org_member(org_id));
create policy "owners add services" on public.service_catalog for insert to authenticated with check (public.has_org_role(org_id, 'owner'));
create policy "owners edit services" on public.service_catalog for update to authenticated using (public.has_org_role(org_id, 'owner')) with check (public.has_org_role(org_id, 'owner'));
create policy "owners delete services" on public.service_catalog for delete to authenticated using (public.has_org_role(org_id, 'owner'));

create policy "members read resources" on public.resources for select to authenticated using (public.is_org_member(org_id));
create policy "owners add resources" on public.resources for insert to authenticated with check (public.has_org_role(org_id, 'owner'));
create policy "owners edit resources" on public.resources for update to authenticated using (public.has_org_role(org_id, 'owner')) with check (public.has_org_role(org_id, 'owner'));
create policy "owners delete resources" on public.resources for delete to authenticated using (public.has_org_role(org_id, 'owner'));

create policy "members read packages" on public.packages for select to authenticated using (public.is_org_member(org_id));
create policy "members add packages" on public.packages for insert to authenticated with check (public.is_org_member(org_id));
create policy "members edit packages" on public.packages for update to authenticated using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));

create policy "members read bookings" on public.bookings for select to authenticated using (public.is_org_member(org_id));
-- Status changes (confirm, done, cancel) and notes by the team; times and
-- capacity-related fields only change through book_slot().
create policy "members update bookings" on public.bookings for update to authenticated using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
revoke insert, delete on public.bookings from authenticated;
revoke update on public.bookings from authenticated;
grant update (status, notes) on public.bookings to authenticated;

-- ---------------------------------------------------------------------------
-- book_slot(): saves a booking after re-checking capacity inside a lock.
--   p_capacity_scope: 'window' | 'day' | 'nights' | 'resource' | 'none'
--   p_capacity: how many fit (per window / per day / per night); ignored for 'resource'/'none'.
-- Server only (the app decides the rules, then calls this with the admin key).
-- Errors start with a code the app turns into friendly words: FULL, OVERLAP,
-- NO_SESSIONS, PACKAGE_EXPIRED.
-- ---------------------------------------------------------------------------
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
      service_zip, address, price_cents, customer_notes, notes, created_by
    ) values (
      v.org_id, v.contact_id, v.lead_id, v.subject_id, v.service_id, v.package_id, v.resource_id, v.mode,
      coalesce(v.status, 'confirmed'), coalesce(v.source, 'owner'),
      v.starts_at, v.ends_at, v.service_date, v.check_in, v.check_out, v.unit_class,
      coalesce(v.travel_before_minutes, 0), coalesce(v.travel_after_minutes, 0),
      v.service_zip, v.address, v.price_cents, v.customer_notes, v.notes, v.created_by
    ) returning id into v_id;
  exception when exclusion_violation then
    raise exception 'OVERLAP: that time was just taken';
  end;
  return v_id;
end;
$$;

revoke execute on function public.book_slot(jsonb, text, integer) from public, anon, authenticated;
