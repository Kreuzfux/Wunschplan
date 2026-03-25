-- Employees should only see their own published schedule, team-scoped.

drop policy if exists "Employees view published schedule" on schedule_assignments;
create policy "Employees view own published schedule"
  on schedule_assignments for select using (
    employee_id = auth.uid()
    and exists (
      select 1
      from monthly_plans mp
      where mp.id = schedule_assignments.monthly_plan_id
        and mp.status = 'published'
        and mp.team_id = public.current_user_team_id()
    )
  );

