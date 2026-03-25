-- Team chat (team room + direct messages) with RLS.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'chat_thread_type') then
    create type chat_thread_type as enum ('team', 'dm');
  end if;
end
$$;

create table if not exists public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references public.teams(id) on delete set null,
  thread_type chat_thread_type not null,
  created_at timestamptz not null default now()
);

-- One team thread per team (enforced via partial unique index).
create unique index if not exists uq_chat_threads_team_room
  on public.chat_threads (team_id)
  where thread_type = 'team';

create table if not exists public.chat_thread_members (
  thread_id uuid references public.chat_threads(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (thread_id, user_id)
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid references public.chat_threads(id) on delete cascade,
  sender_id uuid references public.profiles(id) on delete cascade,
  body text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id),
  constraint chat_messages_body_or_deleted check (body is not null or deleted_at is not null)
);

create index if not exists idx_chat_messages_thread_created
  on public.chat_messages (thread_id, created_at);

create table if not exists public.chat_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid references public.chat_messages(id) on delete cascade,
  storage_path text not null,
  mime_type text not null,
  size_bytes int not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_chat_attachments_message
  on public.chat_attachments (message_id);

alter table public.chat_threads enable row level security;
alter table public.chat_thread_members enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_attachments enable row level security;

-- Helper: current user is member of a thread.
create or replace function public.is_thread_member(p_thread_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.chat_thread_members m
    where m.thread_id = p_thread_id
      and m.user_id = auth.uid()
  );
$$;

-- Threads: Team room is visible to team members; DM visible to members.
drop policy if exists "Users view accessible threads" on public.chat_threads;
create policy "Users view accessible threads"
  on public.chat_threads for select
  using (
    public.is_admin()
    or (
      thread_type = 'team'
      and team_id = public.current_user_team_id()
    )
    or public.is_thread_member(id)
  );

drop policy if exists "Admins manage threads" on public.chat_threads;
create policy "Admins manage threads"
  on public.chat_threads for all
  using (public.is_admin())
  with check (public.is_admin());

-- Members: only members can view membership of threads they can access; admin can view all.
drop policy if exists "Users view thread members" on public.chat_thread_members;
create policy "Users view thread members"
  on public.chat_thread_members for select
  using (
    public.is_admin()
    or public.is_thread_member(thread_id)
    or exists (
      select 1
      from public.chat_threads t
      where t.id = chat_thread_members.thread_id
        and t.thread_type = 'team'
        and t.team_id = public.current_user_team_id()
    )
  );

drop policy if exists "Admins manage thread members" on public.chat_thread_members;
create policy "Admins manage thread members"
  on public.chat_thread_members for all
  using (public.is_admin())
  with check (public.is_admin());

-- Messages: members can read/write; team members can read/write in team thread.
drop policy if exists "Users view messages" on public.chat_messages;
create policy "Users view messages"
  on public.chat_messages for select
  using (
    public.is_admin()
    or public.is_thread_member(thread_id)
    or exists (
      select 1
      from public.chat_threads t
      where t.id = chat_messages.thread_id
        and t.thread_type = 'team'
        and t.team_id = public.current_user_team_id()
    )
  );

drop policy if exists "Users send messages" on public.chat_messages;
create policy "Users send messages"
  on public.chat_messages for insert
  with check (
    sender_id = auth.uid()
    and (
      public.is_thread_member(thread_id)
      or exists (
        select 1
        from public.chat_threads t
        where t.id = chat_messages.thread_id
          and t.thread_type = 'team'
          and t.team_id = public.current_user_team_id()
      )
    )
  );

-- Soft-delete/update allowed for author, admin, or superuser(team) if team thread.
drop policy if exists "Users update own messages" on public.chat_messages;
create policy "Users update own messages"
  on public.chat_messages for update
  using (
    public.is_admin()
    or sender_id = auth.uid()
    or (
      public.is_superuser()
      and exists (
        select 1
        from public.chat_threads t
        where t.id = chat_messages.thread_id
          and t.team_id = public.current_user_team_id()
      )
    )
  )
  with check (
    public.is_admin()
    or sender_id = auth.uid()
    or (
      public.is_superuser()
      and exists (
        select 1
        from public.chat_threads t
        where t.id = chat_messages.thread_id
          and t.team_id = public.current_user_team_id()
      )
    )
  );

-- Attachments: visible if message is visible; insert only by sender.
drop policy if exists "Users view attachments" on public.chat_attachments;
create policy "Users view attachments"
  on public.chat_attachments for select
  using (
    public.is_admin()
    or exists (
      select 1
      from public.chat_messages m
      where m.id = chat_attachments.message_id
        and (
          public.is_thread_member(m.thread_id)
          or exists (
            select 1
            from public.chat_threads t
            where t.id = m.thread_id
              and t.thread_type = 'team'
              and t.team_id = public.current_user_team_id()
          )
        )
    )
  );

drop policy if exists "Users insert attachments" on public.chat_attachments;
create policy "Users insert attachments"
  on public.chat_attachments for insert
  with check (
    exists (
      select 1
      from public.chat_messages m
      where m.id = chat_attachments.message_id
        and m.sender_id = auth.uid()
    )
  );

