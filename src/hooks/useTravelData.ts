import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { deleteVisitPhotoFile, uploadVisitPhoto } from '../lib/photos'
import type { Place, PlaceWithVisits, Visit, VisitPhoto } from '../types'

interface NewVisitInput {
  visited_date: string
  end_date?: string | null
  notes?: string | null
}

export function useTravelData(userId: string | null) {
  const [places, setPlaces] = useState<PlaceWithVisits[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!userId) {
      setPlaces([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const { data: placesData, error: placesErr } = await supabase
        .from('places')
        .select('*')
        .order('created_at', { ascending: true })
      if (placesErr) throw placesErr

      const { data: visitsData, error: visitsErr } = await supabase
        .from('visits')
        .select('*')
        .order('visited_date', { ascending: false })
      if (visitsErr) throw visitsErr

      const { data: photosData, error: photosErr } = await supabase
        .from('visit_photos')
        .select('*')
        .order('sort_order', { ascending: true })
      if (photosErr) throw photosErr

      const photosByVisit = new Map<string, VisitPhoto[]>()
      for (const photo of photosData as VisitPhoto[]) {
        const list = photosByVisit.get(photo.visit_id) ?? []
        list.push(photo)
        photosByVisit.set(photo.visit_id, list)
      }

      const visitsByPlace = new Map<string, Visit[]>()
      for (const visit of visitsData as Visit[]) {
        const list = visitsByPlace.get(visit.place_id) ?? []
        list.push(visit)
        visitsByPlace.set(visit.place_id, list)
      }

      const combined: PlaceWithVisits[] = (placesData as Place[]).map((place) => ({
        ...place,
        visits: (visitsByPlace.get(place.id) ?? []).map((v) => ({
          ...v,
          photos: photosByVisit.get(v.id) ?? [],
        })),
      }))

      setPlaces(combined)
    } catch (e: any) {
      setError(e.message ?? 'Failed to load travel data')
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    refresh()
  }, [refresh])

  const findOrCreatePlace = useCallback(
    async (town: string, country: string, latitude: number, longitude: number): Promise<Place> => {
      if (!userId) throw new Error('Not signed in')
      const existing = places.find(
        (p) => p.town.trim().toLowerCase() === town.trim().toLowerCase() &&
          p.country.trim().toLowerCase() === country.trim().toLowerCase()
      )
      if (existing) return existing

      const { data, error: err } = await supabase
        .from('places')
        .insert({ user_id: userId, town, country, latitude, longitude })
        .select()
        .single()
      if (err) throw err
      return data as Place
    },
    [places, userId]
  )

  const usePlaceById = useCallback(
    async (placeId: string): Promise<Place> => {
      const { data, error: err } = await supabase.from('places').select('*').eq('id', placeId).single()
      if (err) throw err
      return data as Place
    },
    []
  )

  const addVisit = useCallback(async (placeId: string, input: NewVisitInput): Promise<Visit> => {
    const { data, error: err } = await supabase
      .from('visits')
      .insert({ place_id: placeId, ...input })
      .select()
      .single()
    if (err) throw err
    await refresh()
    return data as Visit
  }, [refresh])

  const updateVisit = useCallback(
    async (visitId: string, updates: Partial<NewVisitInput>) => {
      const { error: err } = await supabase.from('visits').update(updates).eq('id', visitId)
      if (err) throw err
      await refresh()
    },
    [refresh]
  )

  const deleteVisit = useCallback(
    async (visitId: string) => {
      const place = places.find((p) => p.visits.some((v) => v.id === visitId))
      const visit = place?.visits.find((v) => v.id === visitId)

      if (visit) {
        await Promise.all(visit.photos.map((p) => deleteVisitPhotoFile(p.storage_path)))
      }

      const { error: err } = await supabase.from('visits').delete().eq('id', visitId)
      if (err) throw err

      if (place && place.visits.length === 1) {
        await supabase.from('places').delete().eq('id', place.id)
      }

      await refresh()
    },
    [places, refresh]
  )

  const updatePlace = useCallback(
    async (placeId: string, updates: Partial<Pick<Place, 'town' | 'country' | 'latitude' | 'longitude'>>) => {
      const { error: err } = await supabase.from('places').update(updates).eq('id', placeId)
      if (err) throw err
      await refresh()
    },
    [refresh]
  )

  const addPhotosToVisit = useCallback(
    async (visitId: string, files: File[], startOrder: number) => {
      if (!userId) throw new Error('Not signed in')
      const uploads = files.slice(0, 3).map(async (file, i) => {
        const path = await uploadVisitPhoto(userId, visitId, file)
        const { error: err } = await supabase
          .from('visit_photos')
          .insert({ visit_id: visitId, storage_path: path, sort_order: startOrder + i })
        if (err) throw err
      })
      await Promise.all(uploads)
      await refresh()
    },
    [refresh, userId]
  )

  const deletePhoto = useCallback(
    async (photo: VisitPhoto) => {
      await deleteVisitPhotoFile(photo.storage_path)
      const { error: err } = await supabase.from('visit_photos').delete().eq('id', photo.id)
      if (err) throw err
      await refresh()
    },
    [refresh]
  )

  return {
    places,
    loading,
    error,
    refresh,
    findOrCreatePlace,
    usePlaceById,
    addVisit,
    updateVisit,
    deleteVisit,
    updatePlace,
    addPhotosToVisit,
    deletePhoto,
  }
}
