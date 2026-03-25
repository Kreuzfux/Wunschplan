-- Add avatar fields to profiles.

alter table public.profiles
add column if not exists avatar_url text;

alter table public.profiles
add column if not exists avatar_updated_at timestamptz;

