-- Reverse hierarchy: admin is highest, superuser is team-scoped.

create or replace function public.is_admin()
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
      and p.role = 'admin'
  );
$$;

create or replace function public.current_user_team_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.team_id
  from public.profiles p
  where p.id = auth.uid()
  limit 1;
$$;

drop policy if exists "Admins can view all profiles" on profiles;
create policy "Admins can view all profiles"
    on profiles for select using (public.is_admin());

drop policy if exists "Admins can manage profiles" on profiles;
create policy "Admins can manage profiles"
    on profiles for all using (public.is_admin());

drop policy if exists "Superusers can view own team profiles" on profiles;
create policy "Superusers can view own team profiles"
    on profiles for select using (
        public.is_superuser()
        and team_id = public.current_user_team_id()
    );

drop policy if exists "Superusers can manage own team profiles" on profiles;
create policy "Superusers can manage own team profiles"
    on profiles for update using (
        public.is_superuser()
        and team_id = public.current_user_team_id()
    )
    with check (
        public.is_superuser()
        and team_id = public.current_user_team_id()
    );

drop policy if exists "Superusers manage teams" on teams;
drop policy if exists "Admins manage teams" on teams;
create policy "Admins manage teams"
    on teams for all using (public.is_admin())
    with check (public.is_admin());

drop policy if exists "Admins manage shift types" on shift_types;
create policy "Admins manage shift types"
    on shift_types for all using (public.is_admin());

drop policy if exists "Employees view open/published plans" on monthly_plans;
create policy "Employees view open/published plans"
    on monthly_plans for select using (
        status in ('open', 'published')
        or public.is_admin()
    );

drop policy if exists "Admins manage plans" on monthly_plans;
create policy "Admins manage plans"
    on monthly_plans for all using (public.is_admin());

drop policy if exists "Admins view all wishes" on shift_wishes;
create policy "Admins view all wishes"
    on shift_wishes for select using (public.is_admin());

drop policy if exists "Superusers view own team wishes" on shift_wishes;
create policy "Superusers view own team wishes"
    on shift_wishes for select using (
        public.is_superuser()
        and exists (
            select 1
            from profiles p
            where p.id = shift_wishes.employee_id
              and p.team_id = public.current_user_team_id()
        )
    );

drop policy if exists "Admins manage schedule" on schedule_assignments;
create policy "Admins manage schedule"
    on schedule_assignments for all using (public.is_admin());

drop policy if exists "Admins view all submissions" on wish_submissions;
create policy "Admins view all submissions"
    on wish_submissions for select using (public.is_admin());

drop policy if exists "Admins manage submissions" on wish_submissions;
create policy "Admins manage submissions"
    on wish_submissions for all using (public.is_admin())
    with check (public.is_admin());

drop policy if exists "Superusers view own team submissions" on wish_submissions;
create policy "Superusers view own team submissions"
    on wish_submissions for select using (
        public.is_superuser()
        and exists (
            select 1
            from profiles p
            where p.id = wish_submissions.employee_id
              and p.team_id = public.current_user_team_id()
        )
    );

update profiles
set role = 'admin'
where lower(email) = lower('nitzschkepa@yahoo.de');
