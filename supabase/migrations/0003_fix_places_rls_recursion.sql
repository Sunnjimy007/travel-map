-- Fixes "infinite recursion detected in policy for relation 'places'" from
-- 0002_stories.sql. The pre-existing "own visits" policy (schema.sql) joins
-- visits -> places to check ownership; the new "public read shared story
-- places" policy joins places -> visits the other way. Postgres enforces RLS
-- on every table a policy subquery touches, so the two policies triggered
-- each other in a loop.
--
-- Fix: do the shared-story lookup in a SECURITY DEFINER function. Functions
-- run as their owner (the project's postgres role via the SQL editor), and a
-- table's owner bypasses its own RLS by default (schema.sql never set FORCE
-- ROW LEVEL SECURITY), so the lookup inside the function doesn't re-trigger
-- any policy at all — breaking the cycle.

create or replace function public.place_in_shared_story(target_place_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from story_stops ss
    join stories s on s.id = ss.story_id
    join visits v on v.id = ss.visit_id
    where v.place_id = target_place_id and s.share_token is not null
  );
$$;

drop policy if exists "public read shared story places" on places;
create policy "public read shared story places" on places
  for select using (public.place_in_shared_story(places.id));
