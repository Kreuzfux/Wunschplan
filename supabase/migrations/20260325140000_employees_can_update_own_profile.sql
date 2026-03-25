-- Allow employees to update their own profile safely (name, email sync, avatar).
-- Protect privileged fields from being modified by non-admin/superuser.

create or replace function public.restrict_profile_updates()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_admin() or public.is_superuser() then
    return new;
  end if;

  -- Non-admin/superuser: force protected fields to stay unchanged.
  new.id := old.id;
  new.role := old.role;
  new.team_id := old.team_id;
  new.is_active := old.is_active;
  new.has_drivers_license := old.has_drivers_license;
  new.created_at := old.created_at;

  return new;
end;
$$;

drop trigger if exists trg_restrict_profile_updates on public.profiles;
create trigger trg_restrict_profile_updates
  before update on public.profiles
  for each row execute function public.restrict_profile_updates();

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

