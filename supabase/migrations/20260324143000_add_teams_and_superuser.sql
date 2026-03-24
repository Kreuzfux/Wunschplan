-- Introduce teams and superuser role.

alter type user_role add value if not exists 'superuser';

create table if not exists teams (
    id uuid primary key default gen_random_uuid(),
    name text not null unique,
    is_active boolean default true,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

insert into teams (name)
values ('Standardteam')
on conflict (name) do nothing;

alter table profiles
add column if not exists team_id uuid references teams(id);

update profiles
set team_id = (select id from teams order by created_at asc limit 1)
where team_id is null;

create index if not exists idx_profiles_team_id on profiles(team_id);

create or replace function public.assign_default_team_to_profile()
returns trigger
language plpgsql
as $$
begin
  if new.team_id is null then
    new.team_id := (select id from teams order by created_at asc limit 1);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profiles_assign_default_team on profiles;
create trigger trg_profiles_assign_default_team
before insert on profiles
for each row
execute function public.assign_default_team_to_profile();

alter table teams enable row level security;

drop policy if exists "All authenticated users can view teams" on teams;
create policy "All authenticated users can view teams"
    on teams for select using (auth.uid() is not null);

drop policy if exists "Admins manage teams" on teams;
create policy "Admins manage teams"
    on teams for all using (
        exists (select 1 from profiles where id = auth.uid() and role = 'admin')
    )
    with check (
        exists (select 1 from profiles where id = auth.uid() and role = 'admin')
    );
