-- Mehrere Teams pro Benutzer: Mitgliedschaftstabelle + aktives Team im Profil.

-- 1) Mitgliedschaften
create table if not exists public.team_memberships (
  user_id uuid not null references public.profiles (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, team_id)
);

create index if not exists idx_team_memberships_team_id on public.team_memberships (team_id);

insert into public.team_memberships (user_id, team_id)
select id, team_id from public.profiles where team_id is not null
on conflict do nothing;

-- 2) Aktives Team (Kontext für current_user_team_id)
alter table public.profiles add column if not exists active_team_id uuid references public.teams (id) on delete set null;

update public.profiles
set active_team_id = team_id
where team_id is not null and active_team_id is null;

-- 3) Hilfsfunktionen
create or replace function public.user_belongs_to_team (p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.team_memberships m
    where m.user_id = auth.uid()
      and m.team_id = p_team_id
  );
$$;

create or replace function public.current_user_team_id ()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(p.active_team_id, p.team_id)
  from public.profiles p
  where p.id = auth.uid()
  limit 1;
$$;

-- 4) Nach jedem neuen Profil: Mitgliedschaft für Default-Team
create or replace function public.trg_profiles_after_insert_membership ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.team_id is not null then
    insert into public.team_memberships (user_id, team_id)
    values (new.id, new.team_id)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profiles_after_insert_membership on public.profiles;
create trigger trg_profiles_after_insert_membership
after insert on public.profiles
for each row execute function public.trg_profiles_after_insert_membership ();

-- 5) RLS team_memberships
alter table public.team_memberships enable row level security;

drop policy if exists "Users read own memberships" on public.team_memberships;
create policy "Users read own memberships"
  on public.team_memberships for select
  using (user_id = auth.uid() or public.is_admin ());

drop policy if exists "Superusers read memberships in team" on public.team_memberships;
drop policy if exists "Superusers manage memberships own team" on public.team_memberships;
drop policy if exists "Superusers delete memberships own team" on public.team_memberships;
drop policy if exists "Superusers manage team memberships" on public.team_memberships;

create policy "Superusers manage team memberships"
  on public.team_memberships for all
  using (public.is_superuser () and team_id = public.current_user_team_id ())
  with check (public.is_superuser () and team_id = public.current_user_team_id ());

drop policy if exists "Admins manage all memberships" on public.team_memberships;
create policy "Admins manage all memberships"
  on public.team_memberships for all
  using (public.is_admin ())
  with check (public.is_admin ());

-- 6) Profil lesen: Teamkollegen über Mitgliedschaft
drop policy if exists "Team members can view team profiles" on public.profiles;
create policy "Team members can view team profiles"
  on public.profiles for select
  using (
    auth.uid () is not null
    and team_id is not null
    and public.user_belongs_to_team (team_id)
  );

-- 7) Superuser: sichtbar, wenn Zielperson im Superuser-Team ist (über Mitgliedschaft)
drop policy if exists "Superusers can view own team profiles" on public.profiles;
create policy "Superusers can view own team profiles"
  on public.profiles for select
  using (
    public.is_superuser ()
    and exists (
      select 1
      from public.team_memberships m
      where m.user_id = public.profiles.id
        and m.team_id = public.current_user_team_id ()
    )
  );

drop policy if exists "Superusers can manage own team profiles" on public.profiles;
create policy "Superusers can manage own team profiles"
  on public.profiles for update
  using (
    public.is_superuser ()
    and exists (
      select 1
      from public.team_memberships m
      where m.user_id = public.profiles.id
        and m.team_id = public.current_user_team_id ()
    )
  )
  with check (
    public.is_superuser ()
    and exists (
      select 1
      from public.team_memberships m
      where m.user_id = public.profiles.id
        and m.team_id = public.current_user_team_id ()
    )
  );

-- 8) Wünsche / Einreichungen: Mitarbeiter über Mitgliedschaft zum Team
drop policy if exists "Superusers view own team wishes" on public.shift_wishes;
create policy "Superusers view own team wishes"
  on public.shift_wishes for select
  using (
    public.is_superuser ()
    and exists (
      select 1
      from public.team_memberships m
      where m.user_id = shift_wishes.employee_id
        and m.team_id = public.current_user_team_id ()
    )
  );

drop policy if exists "Superusers view own team submissions" on public.wish_submissions;
create policy "Superusers view own team submissions"
  on public.wish_submissions for select
  using (
    public.is_superuser ()
    and exists (
      select 1
      from public.team_memberships m
      where m.user_id = wish_submissions.employee_id
        and m.team_id = public.current_user_team_id ()
    )
  );

-- 9) Avatar-Storage lesen
drop policy if exists "Team can read avatars" on storage.objects;
create policy "Team can read avatars"
  on storage.objects for select
  using (
    bucket_id = 'avatars'
    and (
      public.is_admin ()
      or exists (
        select 1
        from public.profiles owner
        where owner.id::text = (storage.foldername (name)) [1]
          and (
            owner.role = 'superuser'
            or public.user_belongs_to_team (owner.team_id)
          )
      )
    )
  );

-- 10) Profil-Updates: aktives Team nur bei gültiger Mitgliedschaft änderbar
create or replace function public.restrict_profile_updates ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_admin () or public.is_superuser () then
    return new;
  end if;

  new.id := old.id;
  new.role := old.role;
  new.team_id := old.team_id;
  new.is_active := old.is_active;
  new.has_drivers_license := old.has_drivers_license;
  new.created_at := old.created_at;

  if new.active_team_id is distinct from old.active_team_id then
    if new.active_team_id is not null and not exists (
      select 1
      from public.team_memberships m
      where m.user_id = auth.uid ()
        and m.team_id = new.active_team_id
    ) then
      new.active_team_id := old.active_team_id;
    end if;
  end if;

  return new;
end;
$$;
