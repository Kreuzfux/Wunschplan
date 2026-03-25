-- Audit log for legally relevant planning actions.

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  actor_id uuid references public.profiles(id) on delete set null,
  team_id uuid references public.teams(id) on delete set null,
  action text not null,
  entity text not null,
  entity_id uuid,
  payload jsonb not null default '{}'::jsonb
);

comment on table public.audit_log is
  'Nachvollziehbarkeit für rechtlich relevante Aktionen (Monat, Generierung, Publizieren, Limits, Löschungen).';

create index if not exists idx_audit_log_created_at on public.audit_log (created_at desc);
create index if not exists idx_audit_log_entity on public.audit_log (entity, entity_id);
create index if not exists idx_audit_log_team on public.audit_log (team_id, created_at desc);

alter table public.audit_log enable row level security;

drop policy if exists "Admins view audit log" on public.audit_log;
create policy "Admins view audit log"
  on public.audit_log for select
  using (public.is_admin());

drop policy if exists "Superusers view audit log (own team)" on public.audit_log;
create policy "Superusers view audit log (own team)"
  on public.audit_log for select
  using (
    public.is_superuser()
    and team_id is not null
    and team_id = public.current_user_team_id()
  );

drop policy if exists "Admins insert audit log" on public.audit_log;
create policy "Admins insert audit log"
  on public.audit_log for insert
  with check (
    public.is_admin()
    and actor_id = auth.uid()
  );

drop policy if exists "Superusers insert audit log (own team)" on public.audit_log;
create policy "Superusers insert audit log (own team)"
  on public.audit_log for insert
  with check (
    public.is_superuser()
    and actor_id = auth.uid()
    and team_id is not null
    and team_id = public.current_user_team_id()
  );

create or replace function public.audit_log_insert(
  p_action text,
  p_entity text,
  p_entity_id uuid,
  p_team_id uuid,
  p_payload jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.audit_log (actor_id, team_id, action, entity, entity_id, payload)
  values (auth.uid(), p_team_id, p_action, p_entity, p_entity_id, coalesce(p_payload, '{}'::jsonb));
$$;

