# PRD — "Where I've Been" Travel Map

> A personal, interactive world map that pins the towns I've travelled to, each with a date, a written memory, and up to 3 photos. Plus a chronological timeline and travel stats.

**Owner:** Sanjiv
**Status:** MVP spec, ready to build
**Intended build tool:** Claude Code
**Last updated:** 22 Aug 2026

---

## 1. Goal & one-line summary

Build a private web app where I can drop **pins on a world map** at the **town level**, attach a **date, a written memory, and up to 3 photos** to each pin, and browse everything as a map, a chronological timeline, or a stats summary. Data lives in a real backend (Supabase) so it persists everywhere and is ready to open up to family later.

---

## 2. Scope & phasing

The build is deliberately phased. **Build the MVP fully before touching MVP+1.**

| Phase | Includes |
|---|---|
| **MVP** | Single user (me). Auth. Map with pins. Click a pin → popup card listing every visit to that town (date, memory, up to 3 photos each). Log/edit/delete a visit; repeat visits share one pin. Direct photo upload to Supabase Storage. Timeline view. Editable table view (Flight Diary-style) + CSV export. Stats view. |
| **MVP+1** | **Flight tracking** (log flights; draw routes between airports on the map). Multi-profile / sharing (family members get their own maps; option to view mine read-only). **Google Photos Picker** integration as an alternative to direct upload. |
| **MVP+2** | Bulk import from CSV / spreadsheet. |

Anything not listed under MVP is **out of scope for v1** — see §11.

---

## 3. Users

- **MVP:** exactly one user — me. But the data model, auth, and row-level security are built multi-user from day one so MVP+1 is additive, not a rewrite.
- **MVP+1:** additional users with their own private maps, plus a way to share a read-only view of a map.

---

## 4. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Framework | **React + Vite + TypeScript** | Fast, familiar, works cleanly in Claude Code. |
| Styling | **Tailwind CSS** | Quick, consistent, good for the clean aesthetic below. |
| Map | **MapLibre GL JS** | Free and open-source, no mandatory API key, supports marker clustering and an optional **globe** projection. |
| Map tiles | **OpenFreeMap** (`https://tiles.openfreemap.org`) — no key, free. Fallback: MapTiler free tier (needs a key). | Avoids sign-up friction for the MVP. Swap to MapTiler later if a specific style is wanted. |
| Geocoding | **MapTiler Geocoding** free tier *or* **Nominatim** (OSM). Plus **click-to-place** on the map as a no-dependency fallback. | Turns "George Town, Penang" into coordinates; click-to-place always works even if geocoding is rate-limited. |
| Backend | **Supabase** — Postgres + Auth + Storage | Already connected. One platform for data, login, and images. |
| Auth | **Supabase Auth** — Google sign-in and/or magic link | Google sign-in is a natural fit given the later Google Photos work. |

> **Note for Claude Code:** MapLibre needs a tile *style* URL. Use OpenFreeMap's `liberty` or a dark style. Enable MapLibre's **globe** projection (v5+) for the world view and switch to **flat** when zoomed into a region. Cluster nearby pins so multi-town countries don't turn into a blob.

---

## 5. Data model (Supabase / Postgres)

Three tables plus one storage bucket. All rows scoped to a `user_id`.

A **place** is a town (one pin on the map). A **visit** is one time I was there. A place can have **many visits**, so returning to the same town simply adds another visit under the same pin — no duplicate markers. Photos attach to a visit.

```sql
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
  visited_date  date not null,          -- the date I was there
  end_date      date,                    -- optional, for multi-day stays
  notes         text,                    -- the "memory" / journal entry
  created_at    timestamptz default now()
);

-- Photos (max 3 per visit, enforced in app logic + optional trigger)
create table visit_photos (
  id            uuid primary key default gen_random_uuid(),
  visit_id      uuid not null references visits(id) on delete cascade,
  storage_path  text not null,           -- path in the Supabase Storage bucket
  caption       text,
  sort_order    int not null default 0,  -- 0,1,2 for ordering in the card
  created_at    timestamptz default now()
);

create index on places (user_id);
create index on visits (place_id);
create index on visit_photos (visit_id);
```

**Storage bucket:** `visit-photos` (private). Files stored under `{user_id}/{visit_id}/{filename}`.

**Row-Level Security (turn on from day one):**

```sql
alter table places enable row level security;
alter table visits enable row level security;
alter table visit_photos enable row level security;

-- places: users see and edit only their own
create policy "own places" on places
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- visits: reachable only via a place the user owns
create policy "own visits" on visits
  for all using (
    exists (select 1 from places p where p.id = place_id and p.user_id = auth.uid())
  ) with check (
    exists (select 1 from places p where p.id = place_id and p.user_id = auth.uid())
  );

-- visit_photos: reachable only via a visit under a place the user owns
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
```

Storage bucket policy: users can read/write only within their own `{user_id}/…` prefix.

---

## 6. Features (MVP)

### 6.1 Authentication
- Sign in with **Google (Google OAuth via Supabase Auth)** — this is the **MVP sign-in method**. Magic-link email sign-in is planned for later but deferred (it needs extra setup), so Google is the single method at launch.
- On first load, unauthenticated users see a simple sign-in screen.
- After sign-in, the map loads with that user's pins only.

### 6.2 Map view (default view)
- Full-screen world map with a **pin/marker for every place (town)**. No filled-in countries.
- A town visited multiple times is still a **single pin**; the card lists all its visits.
- Pins **cluster** when zoomed out; expand as you zoom in.
- Clicking a pin opens a **popup card** (see 6.3).
- A floating **"+ Add visit"** button.
- A view switcher: **Map / Timeline / Table / Stats**.

### 6.3 Pin popup card
Opens on pin click. Because a town may have been visited more than once, the card is organised as **place → visits**:
- **Town, Country** (heading), with a small count if there's more than one visit (e.g. "3 visits").
- **A list of visits**, most recent first. Each visit shows:
  - **Date** (`visited_date`, plus `end_date` if present, formatted nicely e.g. "12–15 Jun 2024")
  - **Memory / notes** (the journal text)
  - **Photo strip** — up to 3 photos; click to enlarge (lightbox)
  - **Edit**, **Save**, and **Delete** actions — in view mode each visit shows **Edit** and **Delete**; clicking **Edit** makes that visit's memory and photo strip editable inline, with a **Save** button to persist changes and **Cancel** to discard them. **Delete** removes just that one visit.
- **"+ Add another visit"** — logs a new visit to this same town without creating a second pin.

### 6.4 Add a visit (form)
A form (modal or side panel) for **logging a visit**, with:
- **Location:** a search box that geocodes the town → lat/lng, **and/or** a "drop pin on map" mode where clicking the map sets coordinates and reverse-geocodes the town/country to prefill.
  - If the town already exists as one of my **places**, the visit attaches to that existing pin — **no duplicate pin is created**. Otherwise a new place is created. Also let me pick from my existing places directly, so returning somewhere is a couple of taps.
- **Date** (required) + optional **end date**.
- **Memory / notes** (multi-line text).
- **Photos:** upload up to **3** image files → stored in the `visit-photos` bucket. Show thumbnails, allow reorder and remove, enforce the 3-photo max.
- **Save** creates the place if it's new, then writes the `visits` row and any `visit_photos` rows.

**Editing** an existing visit happens inline in the popup card (§6.3), not here — this form is for logging visits. **Deleting** a visit (from the card) cascades its photos (DB cascade + delete files from Storage); removing a place's last remaining visit also removes the now-empty pin.

### 6.5 Timeline view
- A **chronological list of visits**, newest or oldest first (toggle), grouped by year. A town visited more than once appears **once per visit**.
- Each entry: town, country, date, a thumbnail, and a snippet of the memory.
- Clicking an entry flies the map to that town's pin and opens its card at that visit.

### 6.6 Stats view
A compact dashboard:
- **Total visits** (every visit logged)
- **Towns visited** (distinct places / pins)
- **Countries visited** (distinct)
- **Continents visited** (derive from country → continent lookup)
- **First** and **most recent** visit dates
- Optional nice-to-have: visits-per-year mini bar chart

### 6.7 Table view (editable data grid) & CSV export
A spreadsheet-style view of **all my data in one editable table** — inspired by Flightradar24's **Flight Diary**, where every entry is a row you can read and edit in place. This is the fast way to log and manage lots of entries without clicking pins one by one.

**Design reference:** the Flight Diary table — a clean, dense grid with one row per entry, all fields visible as columns, per-row edit and delete controls, and an **"+ Add"** button at the top. Match that ease of use.

- **Editable grid:** every visit is a row. Columns: **town, country, visited date, end date, notes, photos, latitude, longitude**. Rows are **sortable and filterable** (e.g. sort by date, filter by country).
- **Inline add / edit / delete** — the point of this view:
  - **"+ Add visit"** at the top adds a new row I can fill in directly (town via the same geocode/place-matching as the form in §6.4, so a repeat town still attaches to its existing pin).
  - **Edit in place:** click a cell to edit date, dates, notes, or town; changes save straight to the `visits` / `places` tables.
  - **Delete** a row (with confirm) removes that visit and its photos.
  - Photos can't be typed into a text cell, so the **photos** column shows a count + thumbnails and opens the uploader/lightbox when clicked (same 3-photo max).
- **Two ways to edit, one source of data:** edits here and inline edits in the popup card (§6.3) both write to the same Supabase tables — use whichever is handier (grid for bulk logging, card for a single memory with photos).
- **Click-through:** clicking a row's location can also fly the map to that visit's pin.
- **CSV export:** a **"Download CSV"** button exports the grid as a `.csv`. Because a `.csv` is flat text, photos are represented by their **storage paths / public URLs and a count**, not embedded.
- **Source of truth stays Supabase.** The grid reads live from `places` + `visits`; the CSV is generated on demand. This keeps photos, per-user access (RLS), and future multi-user working. Pairs with the **CSV import** planned for MVP+2 (§11) for a clean round-trip: export → edit in a spreadsheet → re-import.

---

## 7. UX & aesthetic direction

Clean, modern, slightly editorial — it should feel like a considered personal artifact, not a dashboard.

- **Map:** dark or muted map style so colourful pins and photos pop. Use a **globe** projection for the zoomed-out world view, switching to **flat** when zoomed into a region.
- **Pins:** a single warm accent colour; scale/animate gently on hover.
- **UI chrome:** light, generous whitespace, one strong accent colour, restrained typography (one clean sans, maybe one display face for headings).
- **Cards & modals:** rounded corners, soft shadow, photo-forward.
- **Responsive:** works on mobile (I'll often log visits from my phone).

> You may want to prototype this look in **Claude Design** first, then implement here. Not required.

---

## 8. Build order (suggested for Claude Code)

1. Scaffold Vite + React + TS + Tailwind. Add MapLibre with OpenFreeMap tiles; render a full-screen world map.
2. Wire up Supabase client + Auth (**Google OAuth** for the MVP; magic link later). Gate the app behind sign-in.
3. Create the DB schema, RLS policies, and the `visit-photos` bucket (SQL in §5).
4. Read + render one pin per `place`; add clustering.
5. Pin popup card listing a place's visits (read-only first).
6. Add-visit form: geocode/click-to-place, matching an existing place when the town already exists, date, notes — save a visit (no photos yet).
7. Photo upload to Storage (max 3 per visit), show in card with lightbox.
8. Inline edit + delete of an individual visit, plus "add another visit" to an existing place (with Storage cleanup).
9. Timeline view.
10. Stats view.
11. Editable table view (inline add/edit/delete, Flight Diary-style) + CSV export ("Download CSV").
12. Aesthetic polish pass + mobile responsiveness.

---

## 9. Acceptance criteria (MVP is "done" when…)

- [ ] I can sign in and only see my own data.
- [ ] I can log a visit by searching a town **or** clicking the map, set a date, write a memory, and upload up to 3 photos.
- [ ] A pin appears at the right place; clicking it shows every visit to that town, each with its date, memory, and photos.
- [ ] Logging a **second visit to a town I've already pinned** adds it under the **same pin** — not a duplicate — and I can also add another visit from the card.
- [ ] I can edit and delete an **individual visit**; deleting removes that visit's photos from Storage too.
- [ ] Nearby pins cluster sensibly when zoomed out.
- [ ] The Timeline lists visits chronologically (a repeat town appearing once per visit) and links back to the map.
- [ ] The Stats view shows correct totals for visits, towns, countries, and continents.
- [ ] The Table view shows all visits as sortable rows and lets me **add, edit, and delete** entries inline (Flight Diary-style); "Download CSV" exports the same data as a `.csv` file.
- [ ] It works on my phone.
- [ ] Refreshing the browser (or opening on another device) shows the same data.

---

## 10. Config the user must supply

Claude Code will need these — set as environment variables, never hard-coded:

- `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (from the Supabase project).
- Google OAuth client ID/secret configured in Supabase Auth (the MVP sign-in method).
- (Optional) `VITE_MAPTILER_KEY` if switching from OpenFreeMap to MapTiler for tiles/geocoding.

---

## 11. Out of scope for MVP (future phases)

### MVP+1 — Flight tracking, Sharing & Google Photos

**Flight tracking** — log flights and draw them as routes on the map, alongside the town-visit pins. Modelled on the Flightradar24 Flight Diary that inspired the editable grid.

- **Concept:** a `flight` is a journey between two airports on a date. Flights are a **separate layer** from town-visits — they can be toggled on/off — but share the same map and the same editable-grid experience.
- **Fields** (mirroring Flight Diary): date, flight number, airline, **from** airport, **to** airport, departure/arrival times, aircraft, seat, distance, note. Airports are stored by **IATA code** (e.g. SIN, PEN, BKK).
- **Data model sketch:**
  ```sql
  create table flights (
    id           uuid primary key default gen_random_uuid(),
    user_id      uuid not null references auth.users(id) on delete cascade,
    flight_date  date not null,
    flight_no    text,
    airline      text,
    from_iata    text not null,   -- e.g. 'SIN'
    to_iata      text not null,   -- e.g. 'PEN'
    dep_time     time,
    arr_time     time,
    aircraft     text,
    seat         text,
    distance_km  int,
    note         text,
    created_at   timestamptz default now()
  );
  ```
  Same RLS pattern as everything else (`auth.uid() = user_id`).
- **Airport lookup:** bundle a static **IATA → { name, city, country, lat, lng }** dataset (there are open ones) so typing "SIN" resolves to Singapore Changi's coordinates. No external API call needed at runtime.
- **Map rendering:** draw each flight as a **great-circle arc** between its two airports (curved line, subtle animation optional). A **toggle** switches the flight layer on/off so the map isn't cluttered. Optionally colour or weight arcs by frequency (routes flown often stand out).
- **Editing:** reuse the **editable data grid (§6.7)** — a "Flights" tab with the Flight Diary columns, inline add/edit/delete, and CSV export. This is the closest match to what I already use and like.
- **Relationship to town-visits:** kept intentionally simple for MVP+1 — flights and visits are independent layers. (A future nicety could auto-suggest a town-visit when I log a flight into a new city, but that's not in scope yet.)

**Multi-profile / sharing** — other users with their own maps; a read-only public share link for a given map. RLS already supports this; adds a `shared` flag or a share-token table.

**Google Photos Picker integration.** Important reality check so this is scoped correctly:
- Google **removed** the old "read the user's whole library" scopes on **31 March 2025**. The only supported path now is the **Picker API**, where the user manually selects photos in a Google-hosted dialog.
- The Picker returns temporary `baseUrl`s that **expire after ~60 minutes**, so the app must **download the selected bytes and re-store them in Supabase Storage** — it cannot just save the Google URL.
- Requires its own **Google Cloud project + OAuth consent screen + verification**. Plan this as a proper sub-project, not a quick add-on.
- Net effect: Google Photos becomes an *alternative source* that feeds the same `visit-photos` bucket the MVP already uses.

### MVP+2 — Bulk import
- Upload a CSV/spreadsheet of past visits (town, country, date, notes, optional photo URLs) and batch-create the matching **places + visits** (reusing existing places where the town already exists). Reuse the same geocoding + insert logic as the manual form.

---

## 12. Decisions (resolved)

- **Sign-in method:** both Google and magic link long-term, but **Google OAuth only for the MVP** — magic link is deferred to a later phase as it needs extra setup.
- **Map projection:** **globe** for the zoomed-out world view, **flat** when zoomed into a region.
- **Continent lookup:** bundle a small static country→continent map (no external call needed).
