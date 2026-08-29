export interface Place {
  id: string
  user_id: string
  town: string
  country: string
  latitude: number
  longitude: number
  created_at: string
}

export interface Visit {
  id: string
  place_id: string
  visited_date: string
  end_date: string | null
  notes: string | null
  created_at: string
}

export interface VisitPhoto {
  id: string
  visit_id: string
  storage_path: string
  caption: string | null
  sort_order: number
  created_at: string
}

export interface VisitWithPhotos extends Visit {
  photos: VisitPhoto[]
}

export interface PlaceWithVisits extends Place {
  visits: VisitWithPhotos[]
}

export interface Sticker {
  emoji: string
  x: number // fraction of the photo box, 0-1
  y: number
  rot: number
  scale: number
  photoId: string
}

export interface Story {
  id: string
  user_id: string
  title: string
  start_date: string | null
  end_date: string | null
  cover_path: string | null
  share_token: string | null
  created_at: string
}

export interface StoryStop {
  id: string
  story_id: string
  visit_id: string
  sort_order: number
  fact_text: string | null
  fact_source: 'generated' | 'edited' | null
  story_note: string | null
  stickers: Sticker[] | null
  note_photo_id: string | null
  created_at: string
}

export interface StoryStopWithVisit extends StoryStop {
  visit: VisitWithPhotos & { place: Place }
}

export interface StoryWithStops extends Story {
  stops: StoryStopWithVisit[]
}
