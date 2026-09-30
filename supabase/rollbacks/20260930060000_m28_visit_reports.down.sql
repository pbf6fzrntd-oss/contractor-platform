-- Rollback for Milestone 28 (deploy the previous code first). Visit photos stay in storage and in files.
drop index if exists public.files_job_idx;
alter table public.files drop column if exists job_id;
drop table if exists public.rh_visit_reports;
drop function if exists public.rh_visit_reports_same_org_job();
