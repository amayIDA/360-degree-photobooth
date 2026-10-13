-- Run in Supabase dashboard > SQL Editor

-- 1. Public bucket for videos (anon may upload, anyone with the link may download)
insert into storage.buckets (id, name, public)
values ('videos', 'videos', true)
on conflict (id) do nothing;

drop policy if exists "anon can upload videos" on storage.objects;
create policy "anon can upload videos"
on storage.objects for insert to anon, authenticated
with check (bucket_id = 'videos');

drop policy if exists "anon can overwrite own upload" on storage.objects;

-- 2. Registrations (name / email / phone / video link)
create table if not exists public.sessions (
  id uuid primary key,
  name text not null,
  email text not null,
  phone text not null,
  status text not null default 'registered',
  video_url text,
  created_at timestamptz not null default now()
);

alter table public.sessions enable row level security;

-- The apps can only INSERT. Nobody using the anon key can read other guests' details.
drop policy if exists "anon can register" on public.sessions;
create policy "anon can register"
on public.sessions for insert to anon
with check (status = 'registered' and video_url is null);

-- 3. Camera app attaches the finished video to the registration
create or replace function public.finish_session(p_id uuid, p_url text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.sessions set status = 'done', video_url = p_url where id = p_id;
$$;

grant execute on function public.finish_session(uuid, text) to anon;
