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
  target: 'photo' | 'fact'
  photoId: string | null // the story_stop_photos.id it sits on; null when target is 'fact'
  x: number // fraction of the target box, 0-1
  y: number
  rot: number
  scale: number
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
  stickers: Sticker[] | null
  note_photo_id: string | null
  created_at: string
}

// A photo selected into a story, with its own guided-prompt answer. A photo
// with answer === null is unanswered and excluded from playback entirely —
// that's the editorial rule the whole feature rests on.
export interface StoryStopPhoto {
  id: string
  story_stop_id: string
  visit_photo_id: string
  sort_order: number
  prompt_id: string | null
  answer: string | null
  created_at: string
  photo: VisitPhoto
}

export interface StoryStopWithVisit extends StoryStop {
  visit: VisitWithPhotos & { place: Place }
  storyPhotos: StoryStopPhoto[]
}

export interface StoryWithStops extends Story {
  stops: StoryStopWithVisit[]
}
