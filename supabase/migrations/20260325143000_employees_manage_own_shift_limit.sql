-- Allow employees to manage their own max_shifts_per_month.

drop policy if exists "Mitarbeiter verwalten eigenes Schichtlimit" on public.employee_shift_limits;
create policy "Mitarbeiter verwalten eigenes Schichtlimit"
  on public.employee_shift_limits
  for all
  using (employee_id = auth.uid())
  with check (employee_id = auth.uid());

