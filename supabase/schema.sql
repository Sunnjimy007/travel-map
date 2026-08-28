-- Where I've Been — MVP schema
-- Run this in the Supabase SQL editor (Project > SQL Editor > New query).

-- Places (one row per town = one pin on the map)
create table places (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  town          text not null,
  country       text not null,
  latitude      double precision not null,
  longitude     double precision not null,
  created_at    timestamptz default now()
);

-- Visits (one row per time I visited a place; a place can have many)
create table visits (
  id            uuid primary key default gen_random_uuid(),
  place_id      uuid not null references places(id) on delete cascade,
  visited_date  date not null,
  end_date      date,
  notes         text,
  created_at    timestamptz default now()
);

-- Photos (max 3 per visit, enforced in app logic)
create table visit_photos (
  id            uuid primary key default gen_random_uuid(),
  visit_id      uuid not null references visits(id) on delete cascade,
  storage_path  text not null,
  caption       text,
  sort_order    int not null default 0,
  created_at    timestamptz default now()
);

create index on places (user_id);
create index on visits (place_id);
create index on visit_photos (visit_id);

-- Row-Level Security
alter table places enable row level security;
alter table visits enable row level security;
alter table visit_photos enable row level security;

create policy "own places" on places
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own visits" on visits
  for all using (
    exists (select 1 from places p where p.id = place_id and p.user_id = auth.uid())
  ) with check (
    exists (select 1 from places p where p.id = place_id and p.user_id = auth.uid())
  );

create policy "own visit photos" on visit_photos
  for all using (
    exists (
      select 1 from visits v join places p on p.id = v.place_id
      where v.id = visit_id and p.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from visits v join places p on p.id = v.place_id
      where v.id = visit_id and p.user_id = auth.uid()
    )
  );

-- Storage bucket for visit photos (private; files under {user_id}/{visit_id}/{filename})
insert into storage.buckets (id, name, public)
values ('visit-photos', 'visit-photos', false)
on conflict (id) do nothing;

create policy "own visit photo files select" on storage.objects
  for select using (
    bucket_id = 'visit-photos' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "own visit photo files insert" on storage.objects
  for insert with check (
    bucket_id = 'visit-photos' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "own visit photo files update" on storage.objects
  for update using (
    bucket_id = 'visit-photos' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "own visit photo files delete" on storage.objects
  for delete using (
    bucket_id = 'visit-photos' and (storage.foldername(name))[1] = auth.uid()::text
  );
