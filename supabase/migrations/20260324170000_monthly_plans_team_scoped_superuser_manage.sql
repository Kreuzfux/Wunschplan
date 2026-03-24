-- Make monthly plans team-scoped and allow superusers to manage own team plans.

alter table monthly_plans
add column if not exists team_id uuid references teams(id);

update monthly_plans
set team_id = (
  select id
  from teams
  order by created_at asc
  limit 1
)
where team_id is null;

alter table monthly_plans
alter column team_id set not null;

alter table monthly_plans
drop constraint if exists monthly_plans_year_month_key;

create unique index if not exists uq_monthly_plans_team_year_month
on monthly_plans (team_id, year, month);

drop policy if exists "Employees view open/published plans" on monthly_plans;
create policy "Employees view open/published plans"
    on monthly_plans for select using (
        public.is_admin()
        or (public.is_superuser() and team_id = public.current_user_team_id())
        or (status in ('open', 'published') and team_id = public.current_user_team_id())
    );

drop policy if exists "Admins manage plans" on monthly_plans;
create policy "Admins and superusers manage plans"
    on monthly_plans for all using (
        public.is_admin()
        or (public.is_superuser() and team_id = public.current_user_team_id())
    )
    with check (
        public.is_admin()
        or (public.is_superuser() and team_id = public.current_user_team_id())
    );
