-- Operator-only switch for a dedicated fictional deployment. Ordinary apps default off.
create schema if not exists deployment_private;
revoke all on schema deployment_private from public, anon, authenticated;
create table deployment_private.demo_settings (
  singleton boolean primary key default true check (singleton),
  demo_only boolean not null default false
);
alter table deployment_private.demo_settings enable row level security;
revoke all on deployment_private.demo_settings from public, anon, authenticated, service_role;
insert into deployment_private.demo_settings(singleton, demo_only) values (true, false);

create function deployment_private.guard_demo_organization()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select demo_only from deployment_private.demo_settings where singleton)
     and new.is_demo is distinct from true then
    raise exception 'This deployment only permits fictional demo businesses.' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function deployment_private.guard_demo_organization() from public, anon, authenticated, service_role;
create trigger guard_demo_organization before insert or update of is_demo on public.organizations
for each row execute function deployment_private.guard_demo_organization();
