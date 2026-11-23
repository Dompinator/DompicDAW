-- Run this once in Supabase: SQL Editor → New query → paste → Run.

create table if not exists public.songs (
  id          uuid primary key default gen_random_uuid(),
  title       text not null default 'Untitled song',
  data        jsonb not null,           -- the whole song: bpm, bars, tracks, notes
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.songs enable row level security;

-- DEV-ONLY policies: anyone who has your anon key can read/write/delete songs.
-- Fine while you're building alone. Before you share the site, add Supabase Auth,
-- add a user_id column, and change these to `using (auth.uid() = user_id)`.
create policy "dev read songs"   on public.songs for select to anon using (true);
create policy "dev insert songs" on public.songs for insert to anon with check (true);
create policy "dev update songs" on public.songs for update to anon using (true) with check (true);
create policy "dev delete songs" on public.songs for delete to anon using (true);
