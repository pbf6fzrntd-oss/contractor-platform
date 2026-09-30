-- Demo sandboxes: "Try it live" businesses that prospects can click around in.
--  * Marked is_demo, deleted automatically after demo_expires_at (daily job).
--  * Only pretend (simulator) numbers, so they can never text a real phone.
-- Additive only. Rollback: supabase/rollbacks/20260930030000_demo_sandboxes.down.sql

alter table public.organizations
  add column is_demo boolean not null default false,
  add column demo_expires_at timestamptz;
-- (Owners can't change these: organizations updates are granted per column, and these aren't granted.)
create index organizations_demo_expiry_idx on public.organizations (demo_expires_at) where is_demo;

-- Starting a demo is rate limited like public booking.
alter table public.public_request_log drop constraint public_request_log_kind_check;
alter table public.public_request_log add constraint public_request_log_kind_check check (kind in ('lookup', 'booking', 'demo'));
