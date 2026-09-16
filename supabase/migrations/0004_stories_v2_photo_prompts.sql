-- Holiday Stories v2 — redone per the 2026-09-16 design handoff.
-- Guided prompts now belong to an individual PHOTO, not a stop: a photo
-- with no answer is excluded from the story entirely. Replaces the old
-- per-stop story_note field with a story_stop_photos join table carrying
-- each selected photo's prompt/answer and its order within the stop.
--
-- Story creation also moved from "pick a whole visit" to "pick individual
-- photos, grouped by day + place" — the schema doesn't need to change for
-- that (a story_stops row is still one visit), just the app logic that
-- populates story_stop_photos.
--
-- Existing story data predates this model entirely (whole-visit stops, no
-- per-photo answers) and is cleared as part of the redo — this is a
-- personal project with no real Holiday Stories content published yet.

delete from stories;

alter table story_stops drop column if exists story_note;

create table story_stop_photos (
  id             uuid primary key default gen_random_uuid(),
  story_stop_id  uuid not null references story_stops(id) on delete cascade,
  visit_photo_id uuid not null references visit_photos(id) on delete cascade,
  sort_order     int not null default 0,
  prompt_id      text,
  answer         text,
  created_at     timestamptz default now()
);

create index on story_stop_photos (story_stop_id);
create index on story_stop_photos (visit_photo_id);

alter table story_stop_photos enable row level security;

create policy "own story stop photos" on story_stop_photos
  for all using (
    exists (
      select 1 from story_stops ss join stories s on s.id = ss.story_id
      where ss.id = story_stop_id and s.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from story_stops ss join stories s on s.id = ss.story_id
      where ss.id = story_stop_id and s.user_id = auth.uid()
    )
  );

create policy "public read shared story stop photos" on story_stop_photos
  for select using (
    exists (
      select 1 from story_stops ss join stories s on s.id = ss.story_id
      where ss.id = story_stop_id and s.share_token is not null
    )
  );

-- story_stops.stickers keeps its jsonb type but its shape gains a "target":
-- [{ emoji, target: 'photo' | 'fact', photoId: string | null, x, y, rot, scale }]
-- — a sticker can now land on the fact card as well as a photo.
