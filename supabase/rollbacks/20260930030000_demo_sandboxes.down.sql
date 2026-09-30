-- Rollback for demo sandboxes (deploy the previous code first). Deletes all demo businesses.
delete from public.organizations where is_demo;
delete from public.public_request_log where kind = 'demo';
alter table public.public_request_log drop constraint public_request_log_kind_check;
alter table public.public_request_log add constraint public_request_log_kind_check check (kind in ('lookup', 'booking'));
drop index if exists public.organizations_demo_expiry_idx;
alter table public.organizations drop column if exists demo_expires_at, drop column if exists is_demo;
