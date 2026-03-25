-- Allow authenticated users to read profiles within their own team.
-- Needed for chat sender resolution (name/avatar) for employees.

drop policy if exists "Team members can view team profiles" on public.profiles;
create policy "Team members can view team profiles"
  on public.profiles for select
  using (
    auth.uid() is not null
    and team_id is not null
    and team_id = public.current_user_team_id()
  );
