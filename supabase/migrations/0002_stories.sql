-- Holiday Stories (MVP+1) — run this in the Supabase SQL editor after schema.sql.
-- Adds stories + story_stops, and a public read-only path for the share link
-- (PRD §11: "/s/:token resolves ... with no auth").

create table stories (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  title         text not null,
  start_date    date,
  end_date      date,
  cover_path    text,
  share_token   text unique,
  created_at    timestamptz default now()
);

create table story_stops (
  id            uuid primary key default gen_random_uuid(),
  story_id      uuid not null references stories(id) on delete cascade,
  visit_id      uuid not null references visits(id) on delete cascade,
  sort_order    int not null,
  fact_text     text,
  fact_source   text check (fact_source in ('generated', 'edited')),
  story_note    text,
  stickers      jsonb,
  note_photo_id uuid references visit_photos(id) on delete set null,
  created_at    timestamptz default now()
);

create index on stories (user_id);
create index on stories (share_token);
create index on story_stops (story_id);
create index on story_stops (visit_id);

alter table stories enable row level security;
alter table story_stops enable row level security;

-- Owner access
create policy "own stories" on stories
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own story stops" on story_stops
  for all using (
    exists (select 1 from stories s where s.id = story_id and s.user_id = auth.uid())
  ) with check (
    exists (select 1 from stories s where s.id = story_id and s.user_id = auth.uid())
  );

-- Public read for the share link — a story with a non-null share_token is
-- readable by anyone who knows its id/token (an "anyone with the link" model,
-- same as Docs/Figma sharing). The token itself is the secret, not RLS.
create policy "public read shared stories" on stories
  for select using (share_token is not null);

create policy "public read shared story stops" on story_stops
  for select using (
    exists (select 1 from stories s where s.id = story_stops.story_id and s.share_token is not null)
  );

-- The same shared-story chain also needs to unlock the underlying visit data
-- for anonymous readers. Postgres OR's multiple permissive SELECT policies on
-- the same table together, so this stacks with the existing "own X" policies
-- from schema.sql without touching them.
create policy "public read shared story places" on places
  for select using (
    exists (
      select 1 from story_stops ss
      join stories s on s.id = ss.story_id
      join visits v on v.id = ss.visit_id
      where v.place_id = places.id and s.share_token is not null
    )
  );

create policy "public read shared story visits" on visits
  for select using (
    exists (
      select 1 from story_stops ss join stories s on s.id = ss.story_id
      where ss.visit_id = visits.id and s.share_token is not null
    )
  );

create policy "public read shared story visit photos" on visit_photos
  for select using (
    exists (
      select 1 from story_stops ss join stories s on s.id = ss.story_id
      where ss.visit_id = visit_photos.visit_id and s.share_token is not null
    )
  );

-- ...and the actual photo files in Storage, so a signed URL can be minted
-- for an anonymous visitor.
create policy "public read shared story photo files" on storage.objects
  for select using (
    bucket_id = 'visit-photos' and exists (
      select 1 from visit_photos vp
      join story_stops ss on ss.visit_id = vp.visit_id
      join stories s on s.id = ss.story_id
      where vp.storage_path = storage.objects.name and s.share_token is not null
    )
  );
