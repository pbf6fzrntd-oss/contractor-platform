-- Rollback for Milestone 18. Deletes customer records, private details, file
-- records and credentials. Empty the 'private-files' bucket in Supabase first.
drop policy if exists "members read their business files" on storage.objects;
delete from storage.buckets where id = 'private-files';
drop table if exists public.business_credentials;
drop table if exists public.files;
drop table if exists public.subject_private;
drop table if exists public.subjects;
drop function if exists public.check_subject_private_org();
drop function if exists public.check_same_org_contact();
