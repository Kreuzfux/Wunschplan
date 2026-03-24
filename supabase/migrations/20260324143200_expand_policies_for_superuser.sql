-- Extend admin-scoped policies to include superuser role.

drop policy if exists "Admins manage teams" on teams;
drop policy if exists "Superusers manage teams" on teams;
create policy "Superusers manage teams"
    on teams for all using (
        exists (select 1 from profiles where id = auth.uid() and role = 'superuser')
    )
    with check (
        exists (select 1 from profiles where id = auth.uid() and role = 'superuser')
    );

drop policy if exists "Admins can view all profiles" on profiles;
create policy "Admins can view all profiles"
    on profiles for select using (
        exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'superuser'))
    );

drop policy if exists "Admins can manage profiles" on profiles;
create policy "Admins can manage profiles"
    on profiles for all using (
        exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'superuser'))
    );

drop policy if exists "Admins manage shift types" on shift_types;
create policy "Admins manage shift types"
    on shift_types for all using (
        exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'superuser'))
    );

drop policy if exists "Employees view open/published plans" on monthly_plans;
create policy "Employees view open/published plans"
    on monthly_plans for select using (
        status in ('open', 'published')
        or exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'superuser'))
    );

drop policy if exists "Admins manage plans" on monthly_plans;
create policy "Admins manage plans"
    on monthly_plans for all using (
        exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'superuser'))
    );

drop policy if exists "Admins view all wishes" on shift_wishes;
create policy "Admins view all wishes"
    on shift_wishes for select using (
        exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'superuser'))
    );

drop policy if exists "Admins manage schedule" on schedule_assignments;
create policy "Admins manage schedule"
    on schedule_assignments for all using (
        exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'superuser'))
    );

drop policy if exists "Admins view all submissions" on wish_submissions;
create policy "Admins view all submissions"
    on wish_submissions for select using (
        exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'superuser'))
    );

drop policy if exists "Admins manage submissions" on wish_submissions;
create policy "Admins manage submissions"
    on wish_submissions for all using (
        exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'superuser'))
    )
    with check (
        exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'superuser'))
    );
