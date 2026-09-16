import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Story, StoryWithStops, Sticker } from '../types'

function randomToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(9)))
    .map((b) => b.toString(36).padStart(2, '0'))
    .join('')
    .slice(0, 12)
}

const STORY_WITH_STOPS_SELECT = `
  *,
  stops:story_stops(
    *,
    visit:visits(
      *,
      place:places(*),
      photos:visit_photos(*)
    ),
    storyPhotos:story_stop_photos(
      *,
      photo:visit_photos(*)
    )
  )
`

export interface StopGroup {
  visitId: string
  photoIds: string[]
}

export function useStories(userId: string | null) {
  const [stories, setStories] = useState<StoryWithStops[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!userId) {
      setStories([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from('stories')
        .select(STORY_WITH_STOPS_SELECT)
        .order('created_at', { ascending: false })
        .order('sort_order', { referencedTable: 'story_stops', ascending: true })
      if (err) throw err

      const result = (data ?? []) as unknown as StoryWithStops[]
      // Sorted client-side rather than trusted to the nested foreign-table
      // order clauses above — fragile once you're three joins deep, and in
      // practice the .order('sort_order', {referencedTable: 'story_stops'})
      // clause stopped reliably applying once each stop gained a second
      // nested embed (storyPhotos), silently returning stops out of their
      // real chronological order (routes rendered as a fan/star instead of
      // following the trip). A plain sort here is simpler and just as
      // correct regardless of what Postgres/PostgREST decide to do.
      for (const story of result) {
        story.stops.sort((a, b) => a.sort_order - b.sort_order)
        for (const stop of story.stops) {
          stop.visit.photos.sort((a, b) => a.sort_order - b.sort_order)
          stop.storyPhotos.sort((a, b) => a.sort_order - b.sort_order)
        }
      }
      setStories(result)
    } catch (e: any) {
      setError(e.message ?? 'Failed to load stories')
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    refresh()
  }, [refresh])

  // A photo counts as "used" once it's in any story, regardless of whether
  // it ended up answered — it's already been through the picker.
  const usedPhotoIds = new Set(
    stories.flatMap((s) => s.stops.flatMap((stop) => stop.storyPhotos.map((sp) => sp.visit_photo_id)))
  )
  // Whole visits already turned into a stop — used for the "suggested from
  // your map" clusters, which offer entire untouched holidays, not partial
  // top-ups of a holiday you've already started.
  const usedVisitIds = new Set(stories.flatMap((s) => s.stops.map((stop) => stop.visit_id)))

  const createStory = useCallback(
    async (title: string, groups: StopGroup[]): Promise<Story> => {
      if (!userId) throw new Error('Not signed in')
      if (groups.length === 0) throw new Error('Pick at least one photo for the story')

      const { data: visitsData, error: visitsErr } = await supabase
        .from('visits')
        .select('id, visited_date, end_date')
        .in('id', groups.map((g) => g.visitId))
      if (visitsErr) throw visitsErr
      const dates = (visitsData ?? []).map((v) => v.visited_date).sort()

      const { data: story, error: storyErr } = await supabase
        .from('stories')
        .insert({
          user_id: userId,
          title,
          start_date: dates[0] ?? null,
          end_date: dates[dates.length - 1] ?? null,
        })
        .select()
        .single()
      if (storyErr) throw storyErr

      // Groups already arrive in chronological order from the photo picker
      // (grouped by day + place); stops follow that same order.
      const { data: stopsData, error: stopsErr } = await supabase
        .from('story_stops')
        .insert(groups.map((g, i) => ({ story_id: story.id, visit_id: g.visitId, sort_order: i })))
        .select()
      if (stopsErr) throw stopsErr

      const stopPhotoRows = groups.flatMap((g, i) =>
        g.photoIds.map((photoId, j) => ({
          story_stop_id: stopsData![i].id,
          visit_photo_id: photoId,
          sort_order: j,
        }))
      )
      if (stopPhotoRows.length > 0) {
        const { error: spErr } = await supabase.from('story_stop_photos').insert(stopPhotoRows)
        if (spErr) throw spErr
      }

      await refresh()
      return story as Story
    },
    [userId, refresh]
  )

  const deleteStory = useCallback(
    async (storyId: string) => {
      const { error: err } = await supabase.from('stories').delete().eq('id', storyId)
      if (err) throw err
      await refresh()
    },
    [refresh]
  )

  const updateStop = useCallback(
    async (
      stopId: string,
      updates: Partial<{
        fact_text: string
        fact_source: 'generated' | 'edited'
        stickers: Sticker[]
        note_photo_id: string | null
      }>
    ) => {
      const { error: err } = await supabase.from('story_stops').update(updates).eq('id', stopId)
      if (err) throw err
      await refresh()
    },
    [refresh]
  )

  const removeStop = useCallback(
    async (stopId: string) => {
      const { error: err } = await supabase.from('story_stops').delete().eq('id', stopId)
      if (err) throw err
      await refresh()
    },
    [refresh]
  )

  // Answers are per photo: null clears/skips it, which also excludes it
  // from playback — the caller doesn't need a separate "remove" path.
  const updateStopPhotoAnswer = useCallback(
    async (stopPhotoId: string, promptId: string | null, answer: string | null) => {
      // .update() doesn't error when RLS quietly matches zero rows — it just
      // "succeeds" having changed nothing. .select() gets the row back so we
      // can tell the two cases apart instead of failing silently.
      const { data, error: err } = await supabase
        .from('story_stop_photos')
        .update({ prompt_id: promptId, answer })
        .eq('id', stopPhotoId)
        .select()
      if (err) throw err
      if (!data || data.length === 0) {
        throw new Error('Could not save — this photo record was not found or is not editable.')
      }
      await refresh()
    },
    [refresh]
  )

  const shareStory = useCallback(
    async (storyId: string): Promise<string> => {
      const token = randomToken()
      const { error: err } = await supabase.from('stories').update({ share_token: token }).eq('id', storyId)
      if (err) throw err
      await refresh()
      return token
    },
    [refresh]
  )

  const unshareStory = useCallback(
    async (storyId: string) => {
      const { error: err } = await supabase.from('stories').update({ share_token: null }).eq('id', storyId)
      if (err) throw err
      await refresh()
    },
    [refresh]
  )

  return {
    stories,
    loading,
    error,
    refresh,
    usedPhotoIds,
    usedVisitIds,
    createStory,
    deleteStory,
    updateStop,
    removeStop,
    updateStopPhotoAnswer,
    shareStory,
    unshareStory,
  }
}
