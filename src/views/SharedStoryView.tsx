import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { supabase } from '../lib/supabase'
import type { StoryWithStops } from '../types'
import { PhotoThumb } from '../components/PhotoThumb'
import { StoryPlayer } from '../components/StoryPlayer'

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

function dateRange(start: string | null, end: string | null): string {
  if (!start) return ''
  if (!end || end === start) return format(new Date(start), 'd MMM yyyy')
  const s = new Date(start)
  const e = new Date(end)
  if (s.getFullYear() === e.getFullYear()) return `${format(s, 'd MMM')} – ${format(e, 'd MMM yyyy')}`
  return `${format(s, 'd MMM yyyy')} – ${format(e, 'd MMM yyyy')}`
}

interface SharedStoryViewProps {
  token: string
}

export function SharedStoryView({ token }: SharedStoryViewProps) {
  const [story, setStory] = useState<StoryWithStops | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const { data, error: err } = await supabase
        .from('stories')
        .select(STORY_WITH_STOPS_SELECT)
        .eq('share_token', token)
        .order('sort_order', { referencedTable: 'story_stops', ascending: true })
        .maybeSingle()
      if (cancelled) return
      if (err || !data) {
        setError('This story link is no longer available.')
        setLoading(false)
        return
      }
      const result = data as unknown as StoryWithStops
      for (const stop of result.stops) stop.visit.photos.sort((a, b) => a.sort_order - b.sort_order)
      setStory(result)
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [token])

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-story-cream font-story-sans text-story-faint">
        Loading story…
      </div>
    )
  }

  if (error || !story) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-2 bg-story-cream px-8 text-center font-story-sans">
        <p className="font-story-serif text-[26px] text-story-ink">Story not found</p>
        <p className="text-[14px] text-story-faint">{error ?? 'This link may have been revoked.'}</p>
      </div>
    )
  }

  if (playing) {
    return <StoryPlayer story={story} onClose={() => setPlaying(false)} readOnly />
  }

  const cover = story.stops.find((s) => s.visit.photos.length > 0)?.visit.photos[0]
  const totalPhotos = story.stops.reduce((sum, s) => sum + s.visit.photos.length, 0)
  const minutes = Math.max(1, Math.round((story.stops.length * 6.5) / 1))

  return (
    <div className="min-h-screen bg-story-board font-story-sans text-story-ink">
    <div className="mx-auto flex min-h-screen max-w-lg flex-col bg-story-cream">
      <div className="flex items-center border-b border-story-hairline px-5 py-2.5 sm:px-6">
        <span className="rounded-full bg-story-photo-tint px-3.5 py-2 text-[12px] text-story-faint">
          {window.location.host}/s/{token}
        </span>
      </div>

      <div className="relative h-[300px] w-full flex-shrink-0 overflow-hidden">
        {cover ? (
          <PhotoThumb storagePath={cover.storage_path} className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full bg-story-photo" />
        )}
        <div
          className="absolute inset-0 flex flex-col justify-end p-5"
          style={{ background: 'linear-gradient(to top, rgba(20,18,16,.78), transparent 60%)' }}
        >
          <span className="text-[10px] font-bold uppercase tracking-[.16em] text-white/75">A holiday story</span>
          <h1 className="mt-1 font-story-serif text-[36px] leading-[1.05] text-white">{story.title}</h1>
          <span className="mt-1 text-[13px] text-white/80">
            {dateRange(story.start_date, story.end_date)} · {story.stops.length} stops
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-4 px-5 py-5 sm:px-6">
        <button
          onClick={() => setPlaying(true)}
          className="flex items-center justify-between rounded-2xl bg-story-coral px-5 py-[17px] text-left text-[16px] font-bold text-white"
        >
          <span>▶ Watch the story</span>
          <span className="text-[13px] font-normal opacity-85">{minutes} min</span>
        </button>
        <p className="-mt-2 text-center text-[12px] text-story-faint">
          Read-only link. Nothing here can be edited or added to.
        </p>

        <div className="mt-2 flex flex-col gap-0">
          <div className="mb-1 text-[11px] font-bold uppercase tracking-[.14em] text-story-faint">The stops</div>
          {story.stops.map((stop, i) => {
            const thumb = stop.visit.photos[0]
            const sticker = stop.stickers?.[0]
            return (
              <div
                key={stop.id}
                className="flex items-center gap-3.5 border-t border-story-hairline py-3"
              >
                <span className="w-4 flex-shrink-0 text-[13px] text-story-disabled">{i + 1}</span>
                {thumb ? (
                  <PhotoThumb storagePath={thumb.storage_path} className="h-[46px] w-[46px] flex-shrink-0 rounded-[10px] object-cover" />
                ) : (
                  <div className="h-[46px] w-[46px] flex-shrink-0 rounded-[10px] bg-story-photo" />
                )}
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[14px] font-bold leading-[1.2]">{stop.visit.place.town}</span>
                  <span className="text-[12px] text-story-faint">
                    {stop.visit.visited_date ? format(new Date(stop.visit.visited_date), 'd MMM') : ''}
                    {' · '}
                    {stop.visit.photos.length} photo{stop.visit.photos.length !== 1 ? 's' : ''}
                    {stop.story_note ? ' · note' : ''}
                  </span>
                </div>
                {sticker && <span className="flex-shrink-0 text-[18px]">{sticker.emoji}</span>}
              </div>
            )
          })}
        </div>

        <p className="pb-4 text-center text-[13px] text-story-faint">Total photos: {totalPhotos}</p>
      </div>
    </div>
    </div>
  )
}
