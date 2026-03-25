-- Schichtlimits pro Team (nicht nur pro Person): PK (employee_id, team_id)

alter table public.employee_shift_limits
  add column if not exists team_id uuid references public.teams (id) on delete cascade;

update public.employee_shift_limits esl
set team_id = p.team_id
from public.profiles p
where p.id = esl.employee_id
  and esl.team_id is null
  and p.team_id is not null;

-- Zeilen ohne zuordenbares Team entfernen (Altbestand ohne team_id im Profil)
delete from public.employee_shift_limits where team_id is null;

alter table public.employee_shift_limits drop constraint employee_shift_limits_pkey;

alter table public.employee_shift_limits
  add primary key (employee_id, team_id);

alter table public.employee_shift_limits alter column team_id set not null;

create index if not exists idx_employee_shift_limits_team_id on public.employee_shift_limits (team_id);

comment on table public.employee_shift_limits is
  'Maximale Schichten pro Kalendermonat je Mitarbeiter und Team; Generierung nutzt das Limit fuer den Monatsplan-Team.';

-- RLS neu: Mitarbeiter nur fuer Teams, in denen sie Mitglied sind
drop policy if exists "Admins verwalten Schichtlimits" on public.employee_shift_limits;
drop policy if exists "Superuser verwalten Schichtlimits eigenes Team" on public.employee_shift_limits;
drop policy if exists "Mitarbeiter lesen eigenes Schichtlimit" on public.employee_shift_limits;
drop policy if exists "Mitarbeiter verwalten eigenes Schichtlimit" on public.employee_shift_limits;

create policy "Admins verwalten Schichtlimits"
  on public.employee_shift_limits for all
  using (public.is_admin ())
  with check (public.is_admin ());

create policy "Superuser verwalten Schichtlimits eigenes Team"
  on public.employee_shift_limits for all
  using (
    public.is_superuser ()
    and team_id = public.current_user_team_id ()
    and exists (
      select 1
      from public.team_memberships m
      where m.user_id = employee_shift_limits.employee_id
        and m.team_id = employee_shift_limits.team_id
    )
  )
  with check (
    public.is_superuser ()
    and team_id = public.current_user_team_id ()
    and exists (
      select 1
      from public.team_memberships m
      where m.user_id = employee_shift_limits.employee_id
        and m.team_id = employee_shift_limits.team_id
    )
  );

create policy "Mitarbeiter lesen eigenes Schichtlimit"
  on public.employee_shift_limits for select
  using (employee_id = auth.uid ());

create policy "Mitarbeiter verwalten eigenes Schichtlimit"
  on public.employee_shift_limits for all
  using (
    employee_id = auth.uid ()
    and public.user_belongs_to_team (team_id)
  )
  with check (
    employee_id = auth.uid ()
    and public.user_belongs_to_team (team_id)
  );
