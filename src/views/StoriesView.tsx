import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import type { PlaceWithVisits, StoryWithStops } from '../types'
import { suggestClusters } from '../lib/storySuggestions'
import { PhotoThumb } from '../components/PhotoThumb'
import { NewStoryModal } from '../components/NewStoryModal'

interface StoriesViewProps {
  places: PlaceWithVisits[]
  stories: StoryWithStops[]
  usedVisitIds: Set<string>
  userEmail: string | null
  onOpenStory: (storyId: string) => void
  onCreateStory: (title: string, visitIds: string[]) => Promise<void>
}

function dateRange(start: string | null, end: string | null): string {
  if (!start) return ''
  if (!end || end === start) return format(new Date(start), 'd MMM yyyy')
  const s = new Date(start)
  const e = new Date(end)
  if (s.getFullYear() === e.getFullYear()) {
    return `${format(s, 'd MMM')} – ${format(e, 'd MMM yyyy')}`
  }
  return `${format(s, 'd MMM yyyy')} – ${format(e, 'd MMM yyyy')}`
}

function storyMeta(story: StoryWithStops): string {
  const photos = story.stops.reduce((sum, s) => sum + s.visit.photos.length, 0)
  const notes = story.stops.filter((s) => s.story_note && s.story_note.trim().length > 0).length
  return `${story.stops.length} stop${story.stops.length !== 1 ? 's' : ''} · ${photos} photo${photos !== 1 ? 's' : ''} · ${notes} note${notes !== 1 ? 's' : ''}`
}

export function StoriesView({ places, stories, usedVisitIds, userEmail, onOpenStory, onCreateStory }: StoriesViewProps) {
  const [tab, setTab] = useState<'holidays' | 'mine'>('holidays')
  const [showNewStory, setShowNewStory] = useState(false)
  const [presetVisitIds, setPresetVisitIds] = useState<string[] | null>(null)

  const suggestions = useMemo(() => suggestClusters(places, usedVisitIds), [places, usedVisitIds])
  const initial = (userEmail?.[0] ?? '?').toUpperCase()

  function openNewStory(visitIds?: string[]) {
    setPresetVisitIds(visitIds ?? null)
    setShowNewStory(true)
  }

  return (
    <div className="h-full overflow-y-auto bg-story-cream font-story-sans text-story-ink">
      <div className="mx-auto flex max-w-lg flex-col gap-3.5 px-5 pb-4 pt-4 sm:px-6">
        <div className="flex items-start justify-between">
          <div className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-[.14em] text-story-faint">
              {userEmail ? `${userEmail.split('@')[0]}'s map` : 'Your map'}
            </span>
            <h1 className="font-story-serif text-[34px] leading-[1.05] text-story-ink">Holiday Stories</h1>
          </div>
          <div className="grid h-[38px] w-[38px] flex-shrink-0 place-items-center rounded-full bg-story-photo-tint text-[13px] font-bold text-story-muted">
            {initial}
          </div>
        </div>

        <div className="flex gap-1 rounded-xl bg-story-dark p-1">
          {(['holidays', 'mine'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 rounded-lg py-2.5 text-center text-[13px] font-bold ${
                tab === t ? 'bg-story-teal text-white' : 'text-story-disabled'
              }`}
            >
              {t === 'holidays' ? 'Holidays' : 'My stories'}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-auto flex max-w-lg flex-col gap-3 px-5 pb-28 sm:px-6">
        {stories.length === 0 && (
          <p className="py-6 text-center text-[13px] text-story-faint">
            No stories yet — pick a suggestion below or start one from scratch.
          </p>
        )}

        {stories.map((story) => {
          const coverPhoto = story.stops.find((s) => s.visit.photos.length > 0)?.visit.photos[0]
          const shared = !!story.share_token
          return (
            <button
              key={story.id}
              onClick={() => onOpenStory(story.id)}
              className="flex items-center gap-3.5 rounded-[18px] border border-story-hairline bg-white p-3.5 text-left"
            >
              {coverPhoto ? (
                <PhotoThumb
                  storagePath={coverPhoto.storage_path}
                  className="h-[82px] w-[82px] flex-shrink-0 rounded-[14px] object-cover"
                />
              ) : (
                <div className="grid h-[82px] w-[82px] flex-shrink-0 place-items-center rounded-[14px] bg-story-photo text-[10px] tracking-[.08em] text-story-faint">
                  PHOTO
                </div>
              )}
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <h3 className="truncate text-[17px] font-bold leading-[1.2]">{story.title}</h3>
                  <span
                    className={`flex-shrink-0 rounded-[5px] px-1.5 py-1 text-[10px] font-bold tracking-[.1em] ${
                      shared ? 'bg-story-coral-tint text-story-coral-text' : 'bg-story-teal-tint text-story-teal'
                    }`}
                  >
                    {shared ? 'SHARED' : 'DRAFT'}
                  </span>
                </div>
                <span className="text-[13px] text-story-muted">{dateRange(story.start_date, story.end_date)}</span>
                <span className="text-[13px] text-story-faint">{storyMeta(story)}</span>
              </div>
              <span className="flex-shrink-0 text-[20px] text-story-disabled">›</span>
            </button>
          )
        })}

        {suggestions.length > 0 && (
          <>
            <div className="mt-1.5 text-[11px] font-bold uppercase tracking-[.14em] text-story-faint">
              Suggested from your map
            </div>
            {suggestions.map((cluster) => (
              <div
                key={cluster.key}
                className="flex items-center gap-3.5 rounded-[18px] border border-dashed border-story-dashed p-3.5"
              >
                <div className="grid h-[60px] w-[60px] flex-shrink-0 place-items-center rounded-[14px] bg-story-photo-tint text-[10px] text-story-faint/80">
                  {cluster.visitIds.length}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <h3 className="truncate text-[16px] font-medium">{cluster.townNames.join(' & ')}</h3>
                  <span className="text-[13px] text-story-faint">
                    {cluster.visitIds.length} visits clustered {dateRange(cluster.startDate, cluster.endDate)}
                  </span>
                </div>
                <button
                  onClick={() => openNewStory(cluster.visitIds)}
                  className="flex-shrink-0 text-[13px] font-bold text-story-coral-text"
                >
                  Use
                </button>
              </div>
            ))}
          </>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-14 z-20 mx-auto max-w-lg bg-gradient-to-t from-story-cream from-60% to-transparent px-5 pb-4 pt-4 sm:px-6 md:bottom-0">
        <button
          onClick={() => openNewStory()}
          className="flex w-full items-center gap-2.5 rounded-2xl bg-story-coral px-5 py-4 text-left text-[16px] font-bold text-white hover:bg-story-coral-pressed"
        >
          <span className="text-[18px] leading-none">+</span>
          <span>Start a new story</span>
        </button>
      </div>

      {showNewStory && (
        <NewStoryModal
          places={places}
          usedVisitIds={usedVisitIds}
          presetVisitIds={presetVisitIds}
          onSave={onCreateStory}
          onClose={() => setShowNewStory(false)}
        />
      )}
    </div>
  )
}
