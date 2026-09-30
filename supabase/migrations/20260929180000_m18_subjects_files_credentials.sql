-- Milestone 18: customer records (property / pet / vehicle), private fields,
-- private files, and the business's licenses & insurance.
-- Additive only. Rollback: supabase/rollbacks/20260929180000_m18_subjects_files_credentials.down.sql
--
-- PRIVATE DATA RULE: gate/lockbox/alarm codes, access notes, VINs, behavior and
-- care notes live ONLY in subject_private, and uploaded files live ONLY in the
-- private storage bucket. Public pages, public agent tools and text templates
-- never read them.

-- Makes sure a row's contact (or subject) belongs to the same business.
create or replace function public.check_same_org_contact()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.contact_id is not null and not exists (
    select 1 from public.contacts c where c.id = new.contact_id and c.org_id = new.org_id
  ) then
    raise exception 'That customer belongs to a different business.';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Subjects: the thing a business services for a customer.
-- ---------------------------------------------------------------------------
create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  kind text not null check (kind in ('property', 'pet', 'vehicle')),
  label text not null check (char_length(label) between 1 and 120),
  -- Non-secret details (breed, make/model, property type...). Shape: lib/subjects/fields.ts
  attributes jsonb not null default '{}'::jsonb,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index subjects_contact_idx on public.subjects (org_id, contact_id);
create trigger subjects_same_org before insert or update on public.subjects
  for each row execute function public.check_same_org_contact();
create trigger subjects_updated_at before update on public.subjects
  for each row execute function public.set_updated_at();

alter table public.subjects enable row level security;
create policy "members read subjects" on public.subjects
  for select to authenticated using (public.is_org_member(org_id));
create policy "members add subjects" on public.subjects
  for insert to authenticated with check (public.is_org_member(org_id));
create policy "members edit subjects" on public.subjects
  for update to authenticated using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
create policy "members delete subjects" on public.subjects
  for delete to authenticated using (public.is_org_member(org_id));

-- ---------------------------------------------------------------------------
-- Private fields, kept apart so public/agent code can never select them by accident.
-- ---------------------------------------------------------------------------
create table public.subject_private (
  subject_id uuid primary key references public.subjects (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  access_notes text check (access_notes is null or char_length(access_notes) <= 1000),
  vin text check (vin is null or vin ~ '^[A-HJ-NPR-Z0-9]{17}$'),
  behavior_notes text check (behavior_notes is null or char_length(behavior_notes) <= 1000),
  care_notes text check (care_notes is null or char_length(care_notes) <= 1000),
  updated_at timestamptz not null default now()
);

create or replace function public.check_subject_private_org()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from public.subjects s where s.id = new.subject_id and s.org_id = new.org_id) then
    raise exception 'That record belongs to a different business.';
  end if;
  return new;
end;
$$;

create trigger subject_private_same_org before insert or update on public.subject_private
  for each row execute function public.check_subject_private_org();
create trigger subject_private_updated_at before update on public.subject_private
  for each row execute function public.set_updated_at();

alter table public.subject_private enable row level security;
create policy "members read private details" on public.subject_private
  for select to authenticated using (public.is_org_member(org_id));
create policy "members add private details" on public.subject_private
  for insert to authenticated with check (public.is_org_member(org_id));
create policy "members edit private details" on public.subject_private
  for update to authenticated using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
-- Logged-out visitors never get anything (anon has no grants in this schema).

-- ---------------------------------------------------------------------------
-- Files: photos and documents in the PRIVATE storage bucket. Uploads go through
-- the server (type sniffing + size limits in lib/files/validate.ts); team
-- members get short-lived signed links.
-- ---------------------------------------------------------------------------
create table public.files (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete cascade,
  subject_id uuid references public.subjects (id) on delete cascade,
  kind text not null check (kind in ('photo', 'document', 'vaccination_record', 'credential')),
  -- e.g. 'rabies' for a vaccination record; used by booking requirements (Milestone 19).
  document_type text check (document_type is null or document_type ~ '^[a-z0-9_]{1,40}$'),
  expires_on date,
  storage_path text not null unique check (storage_path ~ '^[0-9a-f-]{36}/'),
  content_type text not null check (content_type in ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf')),
  size_bytes integer not null check (size_bytes between 1 and 10485760),
  original_name text check (original_name is null or char_length(original_name) <= 200),
  uploaded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index files_subject_idx on public.files (org_id, subject_id) where deleted_at is null;
create index files_contact_idx on public.files (org_id, contact_id) where deleted_at is null;
create trigger files_same_org before insert or update on public.files
  for each row execute function public.check_same_org_contact();

alter table public.files enable row level security;
create policy "members read files" on public.files
  for select to authenticated using (public.is_org_member(org_id));
-- Only the server records uploads and deletions (after validating the file).
revoke insert, update, delete on public.files from authenticated;

-- ---------------------------------------------------------------------------
-- Licenses, certifications and insurance (shown on the hosted profile in M22).
-- ---------------------------------------------------------------------------
create table public.business_credentials (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  kind text not null check (kind in ('license', 'certification', 'insurance', 'registration', 'bond')),
  label text not null check (char_length(label) between 1 and 150),
  number text check (number is null or char_length(number) <= 80),
  issuer text check (issuer is null or char_length(issuer) <= 150),
  expires_on date,
  show_on_profile boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index business_credentials_org_idx on public.business_credentials (org_id);
create trigger business_credentials_updated_at before update on public.business_credentials
  for each row execute function public.set_updated_at();

alter table public.business_credentials enable row level security;
create policy "members read credentials" on public.business_credentials
  for select to authenticated using (public.is_org_member(org_id));
create policy "owners add credentials" on public.business_credentials
  for insert to authenticated with check (public.has_org_role(org_id, 'owner'));
create policy "owners edit credentials" on public.business_credentials
  for update to authenticated using (public.has_org_role(org_id, 'owner')) with check (public.has_org_role(org_id, 'owner'));
create policy "owners delete credentials" on public.business_credentials
  for delete to authenticated using (public.has_org_role(org_id, 'owner'));

-- ---------------------------------------------------------------------------
-- Private storage bucket (Supabase Storage). Skipped on plain Postgres (tests).
-- Files are stored at <org_id>/<year>/<uuid>.<ext>.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage')
     and exists (select 1 from pg_tables where schemaname = 'storage' and tablename = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('private-files', 'private-files', false, 10485760,
            array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
    on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

    execute $p$
      create policy "members read their business files" on storage.objects
        for select to authenticated
        using (bucket_id = 'private-files' and public.is_org_member(((storage.foldername(name))[1])::uuid))
    $p$;
  end if;
end;
$$;
