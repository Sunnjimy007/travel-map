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
    )
  )
`

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
      // Photo order within a stop is sorted client-side rather than via a
      // deeply-nested PostgREST foreign-table order clause (story_stops ->
      // visits -> visit_photos), whose dot-path syntax is easy to get wrong
      // silently — a plain JS sort here is simpler and just as correct.
      for (const story of result) {
        for (const stop of story.stops) {
          stop.visit.photos.sort((a, b) => a.sort_order - b.sort_order)
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

  const usedVisitIds = new Set(stories.flatMap((s) => s.stops.map((stop) => stop.visit_id)))

  const createStory = useCallback(
    async (title: string, visitIds: string[]): Promise<Story> => {
      if (!userId) throw new Error('Not signed in')
      if (visitIds.length === 0) throw new Error('A story needs at least one stop')

      const { data: visitsData, error: visitsErr } = await supabase
        .from('visits')
        .select('id, visited_date, end_date')
        .in('id', visitIds)
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

      // Stops follow the same chronological order as the visits themselves.
      const orderedIds = [...visitIds].sort((a, b) => {
        const va = visitsData!.find((v) => v.id === a)!
        const vb = visitsData!.find((v) => v.id === b)!
        return va.visited_date < vb.visited_date ? -1 : 1
      })

      const { error: stopsErr } = await supabase.from('story_stops').insert(
        orderedIds.map((visitId, i) => ({
          story_id: story.id,
          visit_id: visitId,
          sort_order: i,
        }))
      )
      if (stopsErr) throw stopsErr

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
        story_note: string
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
    usedVisitIds,
    createStory,
    deleteStory,
    updateStop,
    removeStop,
    shareStory,
    unshareStory,
  }
}
