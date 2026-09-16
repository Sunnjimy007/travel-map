import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import type { PlaceWithVisits } from '../types'
import type { StopGroup } from '../hooks/useStories'
import { PhotoThumb } from './PhotoThumb'

interface NewStoryPhotoPickerProps {
  places: PlaceWithVisits[]
  usedPhotoIds: Set<string>
  presetVisitIds: string[] | null
  userEmail: string | null
  onCreate: (title: string, groups: StopGroup[]) => Promise<void>
  onClose: () => void
}

interface DayGroup {
  visitId: string
  town: string
  country: string
  date: string
  photoIds: string[]
}

export function NewStoryPhotoPicker({
  places,
  usedPhotoIds,
  presetVisitIds,
  userEmail,
  onCreate,
  onClose,
}: NewStoryPhotoPickerProps) {
  const groups = useMemo<DayGroup[]>(() => {
    const all = places.flatMap((p) =>
      p.visits
        .map((v) => ({
          visitId: v.id,
          town: p.town,
          country: p.country,
          date: v.visited_date,
          photoIds: v.photos.filter((ph) => !usedPhotoIds.has(ph.id)).map((ph) => ph.id),
        }))
        .filter((g) => g.photoIds.length > 0)
    )
    all.sort((a, b) => (a.date < b.date ? 1 : -1))
    return all
  }, [places, usedPhotoIds])

  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(presetVisitIds ? groups.filter((g) => presetVisitIds.includes(g.visitId)).flatMap((g) => g.photoIds) : [])
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const photosById = useMemo(() => {
    const map = new Map<string, { id: string; storage_path: string }>()
    for (const p of places) for (const v of p.visits) for (const ph of v.photos) map.set(ph.id, ph)
    return map
  }, [places])

  function togglePhoto(photoId: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(photoId)) next.delete(photoId)
      else next.add(photoId)
      return next
    })
  }

  function toggleGroup(group: DayGroup) {
    const allSelected = group.photoIds.every((id) => selected.has(id))
    setSelected((prev) => {
      const next = new Set(prev)
      for (const id of group.photoIds) {
        if (allSelected) next.delete(id)
        else next.add(id)
      }
      return next
    })
  }

  const stopCount = groups.filter((g) => g.photoIds.some((id) => selected.has(id))).length
  const initial = (userEmail?.[0] ?? '?').toUpperCase()

  async function handleUse() {
    setError(null)
    const stopGroups: StopGroup[] = groups
      .map((g) => ({ visitId: g.visitId, photoIds: g.photoIds.filter((id) => selected.has(id)) }))
      .filter((g) => g.photoIds.length > 0)
    if (stopGroups.length === 0) {
      setError('Pick at least one photo.')
      return
    }
    const towns = [...new Set(groups.filter((g) => g.photoIds.some((id) => selected.has(id))).map((g) => g.town))]
    const title = towns.join(' & ') || 'New story'
    setSaving(true)
    try {
      await onCreate(title, stopGroups)
    } catch (e: any) {
      setError(e.message ?? 'Failed to create story')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-center bg-story-board font-story-sans text-story-ink">
      <div className="flex w-full max-w-[480px] flex-col bg-story-cream">
        <div className="flex flex-col gap-3.5 px-5 pb-3 pt-4">
          <div className="flex items-start justify-between">
            <div className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-[.14em] text-story-faint">
                {userEmail ? `${userEmail.split('@')[0]}'s map` : 'Your map'}
              </span>
              <h1 className="font-story-serif text-[34px] leading-[1.05] text-story-ink">Pick your photos</h1>
            </div>
            <div className="grid h-[38px] w-[38px] flex-shrink-0 place-items-center rounded-full bg-story-photo-tint text-[13px] font-bold text-story-muted">
              {initial}
            </div>
          </div>
          <p className="text-[14px] leading-[1.5] text-story-muted">
            Choose the photos from this holiday. Each day becomes a stop you can edit next.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-2">
          {groups.length === 0 && (
            <p className="py-8 text-center text-[13px] text-story-faint">
              No photos to pick from yet — log a visit with photos first.
            </p>
          )}
          {groups.map((g) => {
            const groupSelected = g.photoIds.every((id) => selected.has(id))
            return (
              <div key={g.visitId} className="mb-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-[.14em] text-story-faint">
                    {format(new Date(g.date), 'EEE d MMM')} · {g.town}
                  </span>
                  <button onClick={() => toggleGroup(g)} className="text-[12px] font-bold text-story-coral-text">
                    {groupSelected ? 'Deselect all' : 'Select all'}
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {g.photoIds.map((photoId) => {
                    const photo = photosById.get(photoId)
                    const checked = selected.has(photoId)
                    if (!photo) return null
                    return (
                      <button
                        key={photoId}
                        onClick={() => togglePhoto(photoId)}
                        className="relative aspect-square overflow-hidden rounded-[10px] bg-story-photo"
                      >
                        <PhotoThumb storagePath={photo.storage_path} className="h-full w-full object-cover" />
                        <span
                          className={`absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full border-2 border-white text-[11px] font-bold text-white ${
                            checked ? 'bg-story-teal' : 'bg-white/25'
                          }`}
                        >
                          {checked ? '✓' : ''}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        <div className="flex flex-col gap-2.5 bg-gradient-to-t from-story-cream from-70% to-transparent px-5 pb-6 pt-3.5">
          {error && <p className="text-[12px] text-story-coral-text">{error}</p>}
          <div className="flex items-center justify-between text-[12px] text-story-muted">
            <span>
              <strong className="font-bold text-story-ink">{selected.size} photos</strong> selected · {stopCount} stops
            </span>
            <button onClick={() => setSelected(new Set())} className="font-bold text-story-coral-text">
              Clear
            </button>
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-2xl border border-story-divider px-5 py-4 text-[14px] font-bold text-story-body">
              ✕
            </button>
            <button
              onClick={handleUse}
              disabled={saving || selected.size === 0}
              className="flex flex-1 items-center rounded-2xl bg-story-coral px-5 py-4 text-left text-[16px] font-bold text-white disabled:opacity-50"
            >
              <span>{saving ? 'Creating…' : 'Use these photos'}</span>
              <span className="ml-auto text-[14px] font-normal opacity-85">→</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
