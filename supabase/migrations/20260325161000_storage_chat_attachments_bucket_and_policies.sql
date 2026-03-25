-- Storage bucket + policies for chat attachments.

insert into storage.buckets (id, name, public)
values ('chat-attachments', 'chat-attachments', false)
on conflict (id) do nothing;

-- Helper functions to parse path: {thread_id}/{message_id}/...
create or replace function public.storage_path_thread_id(p_name text)
returns uuid
language sql
stable
as $$
  select nullif((storage.foldername(p_name))[1], '')::uuid
$$;

-- Read: if user can access the thread (team room or member), allow read.
drop policy if exists "Users can read chat attachments" on storage.objects;
create policy "Users can read chat attachments"
  on storage.objects for select
  using (
    bucket_id = 'chat-attachments'
    and (
      public.is_admin()
      or exists (
        select 1
        from public.chat_threads t
        where t.id = public.storage_path_thread_id(name)
          and (
            (t.thread_type = 'team' and t.team_id = public.current_user_team_id())
            or public.is_thread_member(t.id)
          )
      )
    )
  );

-- Write: allow insert/update/delete only if user is sender in that thread (checked via message row).
drop policy if exists "Users can write chat attachments" on storage.objects;
create policy "Users can write chat attachments"
  on storage.objects for insert
  with check (
    bucket_id = 'chat-attachments'
    and exists (
      select 1
      from public.chat_messages m
      where m.id::text = (storage.foldername(name))[2]
        and m.sender_id = auth.uid()
    )
  );

drop policy if exists "Users can update chat attachments" on storage.objects;
create policy "Users can update chat attachments"
  on storage.objects for update
  using (
    bucket_id = 'chat-attachments'
    and exists (
      select 1
      from public.chat_messages m
      where m.id::text = (storage.foldername(name))[2]
        and m.sender_id = auth.uid()
    )
  )
  with check (
    bucket_id = 'chat-attachments'
    and exists (
      select 1
      from public.chat_messages m
      where m.id::text = (storage.foldername(name))[2]
        and m.sender_id = auth.uid()
    )
  );

drop policy if exists "Users can delete chat attachments" on storage.objects;
create policy "Users can delete chat attachments"
  on storage.objects for delete
  using (
    bucket_id = 'chat-attachments'
    and exists (
      select 1
      from public.chat_messages m
      where m.id::text = (storage.foldername(name))[2]
        and m.sender_id = auth.uid()
    )
  );

