-- Storage bucket + policies for team-visible avatars, self-write.
-- Note: Storage tables live in schema "storage".

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', false)
on conflict (id) do nothing;

-- Read: Users can read avatars of profiles in their own team (and admins can read all).
drop policy if exists "Team can read avatars" on storage.objects;
create policy "Team can read avatars"
  on storage.objects for select
  using (
    bucket_id = 'avatars'
    and (
      public.is_admin()
      or exists (
        select 1
        from public.profiles owner
        where owner.id::text = (storage.foldername(name))[1]
          and owner.team_id = public.current_user_team_id()
      )
    )
  );

-- Write: Users can write only into their own prefix "{uid}/..."
drop policy if exists "Users can write own avatar" on storage.objects;
create policy "Users can write own avatar"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can update own avatar" on storage.objects;
create policy "Users can update own avatar"
  on storage.objects for update
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can delete own avatar" on storage.objects;
create policy "Users can delete own avatar"
  on storage.objects for delete
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

