-- Make shift types team-scoped instead of global.

alter table shift_types
add column if not exists team_id uuid references teams(id);

update shift_types
set team_id = (
  select id
  from teams
  order by created_at asc
  limit 1
)
where team_id is null;

alter table shift_types
alter column team_id set not null;

create index if not exists idx_shift_types_team_id on shift_types(team_id);

drop policy if exists "Everyone can view shift types" on shift_types;
create policy "Team members can view team shift types"
    on shift_types for select using (
        public.is_admin()
        or team_id = public.current_user_team_id()
    );

drop policy if exists "Admins manage shift types" on shift_types;
create policy "Admins and superusers manage team shift types"
    on shift_types for all using (
        public.is_admin()
        or (public.is_superuser() and team_id = public.current_user_team_id())
    )
    with check (
        public.is_admin()
        or (public.is_superuser() and team_id = public.current_user_team_id())
    );
