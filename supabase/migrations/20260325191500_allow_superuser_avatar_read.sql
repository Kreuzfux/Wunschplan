-- Allow authenticated users to read superuser avatars globally.
-- Reason: superusers may not always have a team_id, which blocks the existing team-based rule.

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
          and (
            owner.role = 'superuser'
            or owner.team_id = public.current_user_team_id()
          )
      )
    )
  );
