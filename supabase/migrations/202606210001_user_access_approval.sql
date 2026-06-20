create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  role text not null default 'user' check (role in ('user', 'super_admin')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null
);

create index if not exists user_profiles_status_idx on public.user_profiles(status, created_at);
create index if not exists user_profiles_role_idx on public.user_profiles(role, status);

insert into public.user_profiles(id, email, display_name, created_at)
select
  users.id,
  coalesce(users.email, users.id::text || '@local.invalid'),
  nullif(coalesce(users.raw_user_meta_data->>'full_name', users.raw_user_meta_data->>'name'), ''),
  users.created_at
from auth.users users
on conflict (id) do nothing;

do $$
declare
  first_user_id uuid;
begin
  if not exists (
    select 1 from public.user_profiles where role = 'super_admin' and status = 'approved'
  ) then
    select id into first_user_id from public.user_profiles order by created_at, id limit 1;
    if first_user_id is not null then
      update public.user_profiles
      set role = 'super_admin', status = 'approved', approved_at = now(), approved_by = first_user_id, updated_at = now()
      where id = first_user_id;
    end if;
  end if;
end;
$$;

create or replace function public.handle_new_access_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  first_account boolean;
begin
  perform pg_advisory_xact_lock(918273645);
  select not exists (
    select 1 from public.user_profiles where role = 'super_admin' and status = 'approved'
  ) into first_account;

  insert into public.user_profiles(id, email, display_name, role, status, created_at, approved_at, approved_by)
  values (
    new.id,
    coalesce(new.email, new.id::text || '@local.invalid'),
    nullif(coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'), ''),
    case when first_account then 'super_admin' else 'user' end,
    case when first_account then 'approved' else 'pending' end,
    new.created_at,
    case when first_account then now() else null end,
    case when first_account then new.id else null end
  )
  on conflict (id) do update set
    email = excluded.email,
    display_name = coalesce(excluded.display_name, public.user_profiles.display_name),
    updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_access on auth.users;
create trigger on_auth_user_created_access
after insert or update of email, raw_user_meta_data on auth.users
for each row execute function public.handle_new_access_user();

create or replace function public.is_approved_user(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_profiles
    where id = p_user_id and status = 'approved'
  );
$$;

create or replace function public.is_super_admin(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_profiles
    where id = p_user_id and status = 'approved' and role = 'super_admin'
  );
$$;

alter table public.user_profiles enable row level security;
drop policy if exists profile_self_or_super_admin on public.user_profiles;
create policy profile_self_or_super_admin on public.user_profiles
for select to authenticated
using (id = auth.uid() or public.is_super_admin());

revoke all on public.user_profiles from anon;
revoke all on public.user_profiles from authenticated;
grant select on public.user_profiles to authenticated;

create or replace function public.admin_list_users()
returns table (
  id uuid,
  email text,
  display_name text,
  role text,
  status text,
  created_at timestamptz,
  approved_at timestamptz,
  is_current_user boolean
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Super admin access required';
  end if;
  return query
  select
    profile.id,
    profile.email,
    profile.display_name,
    profile.role,
    profile.status,
    profile.created_at,
    profile.approved_at,
    profile.id = auth.uid()
  from public.user_profiles profile
  order by
    case profile.status when 'pending' then 0 when 'approved' then 1 else 2 end,
    profile.created_at;
end;
$$;

create or replace function public.admin_set_user_access(
  p_user_id uuid,
  p_status text,
  p_role text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_role text;
begin
  if not public.is_super_admin() then
    raise exception 'Super admin access required';
  end if;
  if p_status not in ('pending', 'approved', 'rejected') then
    raise exception 'Invalid access status';
  end if;
  select coalesce(p_role, role) into next_role from public.user_profiles where id = p_user_id;
  if not found then raise exception 'User profile not found'; end if;
  if next_role not in ('user', 'super_admin') then raise exception 'Invalid user role'; end if;
  if p_user_id = auth.uid() and (p_status <> 'approved' or next_role <> 'super_admin') then
    raise exception 'A super admin cannot remove their own access or role';
  end if;

  update public.user_profiles
  set
    status = p_status,
    role = next_role,
    approved_at = case when p_status = 'approved' then coalesce(approved_at, now()) else null end,
    approved_by = case when p_status = 'approved' then auth.uid() else null end,
    updated_at = now()
  where id = p_user_id;

  insert into public.audit_logs(owner_id, action, entity_type, entity_id, metadata)
  values (
    auth.uid(),
    'user_access_updated',
    'user_profile',
    p_user_id::text,
    jsonb_build_object('status', p_status, 'role', next_role, 'updated_by', auth.uid())
  );
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'datasets', 'customers', 'customer_records', 'campaigns', 'campaign_targets',
    'campaign_results', 'goals', 'imports', 'export_history'
  ] loop
    execute format('drop policy if exists owner_access on public.%I', table_name);
    execute format(
      'create policy owner_access on public.%I for all to authenticated using (owner_id = auth.uid() and public.is_approved_user()) with check (owner_id = auth.uid() and public.is_approved_user())',
      table_name
    );
  end loop;
end;
$$;

drop policy if exists audit_logs_select on public.audit_logs;
create policy audit_logs_select on public.audit_logs
for select to authenticated
using (owner_id = auth.uid() and public.is_approved_user());

create or replace function public.import_dataset_snapshot_secure(p_dataset jsonb, p_replace_dataset_id text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_approved_user() then raise exception 'Approved account required'; end if;
  return public.import_dataset_snapshot(p_dataset, p_replace_dataset_id);
end;
$$;

create or replace function public.create_campaign_with_targets_secure(p_campaign jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_approved_user() then raise exception 'Approved account required'; end if;
  return public.create_campaign_with_targets(p_campaign);
end;
$$;

create or replace function public.delete_dataset_snapshot_secure(p_dataset_id text, p_confirmation text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_approved_user() then raise exception 'Approved account required'; end if;
  perform public.delete_dataset_snapshot(p_dataset_id, p_confirmation);
end;
$$;

revoke all on function public.is_approved_user(uuid) from public, anon;
revoke all on function public.is_super_admin(uuid) from public, anon;
revoke all on function public.admin_list_users() from public, anon;
revoke all on function public.admin_set_user_access(uuid, text, text) from public, anon;
revoke all on function public.import_dataset_snapshot(jsonb, text) from authenticated;
revoke all on function public.create_campaign_with_targets(jsonb) from authenticated;
revoke all on function public.delete_dataset_snapshot(text, text) from authenticated;
revoke all on function public.import_dataset_snapshot_secure(jsonb, text) from public, anon;
revoke all on function public.create_campaign_with_targets_secure(jsonb) from public, anon;
revoke all on function public.delete_dataset_snapshot_secure(text, text) from public, anon;

grant execute on function public.is_approved_user(uuid) to authenticated;
grant execute on function public.is_super_admin(uuid) to authenticated;
grant execute on function public.admin_list_users() to authenticated;
grant execute on function public.admin_set_user_access(uuid, text, text) to authenticated;
grant execute on function public.import_dataset_snapshot_secure(jsonb, text) to authenticated;
grant execute on function public.create_campaign_with_targets_secure(jsonb) to authenticated;
grant execute on function public.delete_dataset_snapshot_secure(text, text) to authenticated;
