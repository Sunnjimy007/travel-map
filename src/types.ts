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
