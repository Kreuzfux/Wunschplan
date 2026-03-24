-- Fix infinite recursion in profiles RLS by moving role checks
-- into SECURITY DEFINER helper functions.

create or replace function public.is_admin_or_superuser()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('admin', 'superuser')
  );
$$;

create or replace function public.is_superuser()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'superuser'
  );
$$;

drop policy if exists "Admins can view all profiles" on profiles;
create policy "Admins can view all profiles"
    on profiles for select using (public.is_admin_or_superuser());

drop policy if exists "Admins can manage profiles" on profiles;
create policy "Admins can manage profiles"
    on profiles for all using (public.is_admin_or_superuser());

drop policy if exists "Superusers manage teams" on teams;
create policy "Superusers manage teams"
    on teams for all using (public.is_superuser())
    with check (public.is_superuser());
