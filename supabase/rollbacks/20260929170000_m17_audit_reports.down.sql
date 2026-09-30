-- Rollback for Milestone 17 (deletes saved sales audits).
drop table if exists public.audit_reports;
