-- Rollback for Milestone 19. Deletes all bookings, services, resources and packages.
drop function if exists public.book_slot(jsonb, text, integer);
drop table if exists public.bookings;
drop function if exists public.bookings_before_write();
drop table if exists public.packages;
drop table if exists public.resources;
drop table if exists public.service_catalog;
revoke update (booking_enabled, booking_settings) on public.organizations from authenticated;
alter table public.organizations drop column if exists booking_settings, drop column if exists booking_enabled;
-- btree_gist is left installed (harmless).
