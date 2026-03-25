-- Employees should be able to see all months of their team (for selection),
-- but can only enter wishes when a month is open (handled via shift_wishes RLS).

drop policy if exists "Employees view open/published plans" on monthly_plans;
create policy "Employees view team plans"
  on monthly_plans for select using (
    public.is_admin()
    or (public.is_superuser() and team_id = public.current_user_team_id())
    or (team_id = public.current_user_team_id())
  );

