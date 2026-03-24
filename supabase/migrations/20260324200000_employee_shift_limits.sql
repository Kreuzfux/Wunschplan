-- Monatliche Maximal-Schichten pro Mitarbeiter (teambezogen verwaltbar durch Admin/Superuser).

create table if not exists public.employee_shift_limits (
  employee_id uuid primary key references public.profiles (id) on delete cascade,
  max_shifts_per_month integer not null default 31
    check (max_shifts_per_month >= 0 and max_shifts_per_month <= 366),
  updated_at timestamptz not null default now()
);

comment on table public.employee_shift_limits is
  'Maximale Schichten pro Kalendermonat je Mitarbeiter; Generierung respektiert dieses Limit.';

create or replace function public.set_employee_shift_limits_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_employee_shift_limits_updated_at on public.employee_shift_limits;
create trigger trg_employee_shift_limits_updated_at
  before update on public.employee_shift_limits
  for each row execute function public.set_employee_shift_limits_updated_at();

alter table public.employee_shift_limits enable row level security;

-- Hilfsausdruck: Mitarbeiter gehört zum Team des Superusers
-- (profiles.team_id = current_user_team_id())

drop policy if exists "Admins verwalten Schichtlimits" on public.employee_shift_limits;
create policy "Admins verwalten Schichtlimits"
  on public.employee_shift_limits
  for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Superuser verwalten Schichtlimits eigenes Team" on public.employee_shift_limits;
create policy "Superuser verwalten Schichtlimits eigenes Team"
  on public.employee_shift_limits
  for all
  using (
    public.is_superuser()
    and exists (
      select 1
      from public.profiles p
      where p.id = employee_shift_limits.employee_id
        and p.team_id is not null
        and p.team_id = public.current_user_team_id()
    )
  )
  with check (
    public.is_superuser()
    and exists (
      select 1
      from public.profiles p
      where p.id = employee_shift_limits.employee_id
        and p.team_id is not null
        and p.team_id = public.current_user_team_id()
    )
  );

drop policy if exists "Mitarbeiter lesen eigenes Schichtlimit" on public.employee_shift_limits;
create policy "Mitarbeiter lesen eigenes Schichtlimit"
  on public.employee_shift_limits
  for select
  using (employee_id = auth.uid());
