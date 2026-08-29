import { useState } from 'react'
import { format } from 'date-fns'
import type { PlaceWithVisits, VisitPhoto, VisitWithPhotos } from '../types'
import { PhotoThumb } from './PhotoThumb'
import { Lightbox } from './Lightbox'
import { GooglePhotosButton } from './GooglePhotosButton'
import { MAX_PHOTOS_PER_VISIT } from '../lib/constants'

interface PlaceCardProps {
  place: PlaceWithVisits
  onClose: () => void
  onAddVisit: () => void
  onUpdateVisit: (visitId: string, updates: { notes: string }) => Promise<void>
  onUpdatePlace: (updates: { town?: string; country?: string }) => Promise<void>
  onDeleteVisit: (visitId: string) => Promise<void>
  onAddPhotos: (visitId: string, files: File[], startOrder: number) => Promise<void>
  onDeletePhoto: (photo: VisitPhoto) => Promise<void>
  initialVisitId?: string | null
}

function formatRange(visitedDate: string, endDate: string | null) {
  const start = new Date(visitedDate)
  if (!endDate) return format(start, 'd MMM yyyy')
  const end = new Date(endDate)
  if (start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth()) {
    return `${start.getDate()}–${end.getDate()} ${format(start, 'MMM yyyy')}`
  }
  return `${format(start, 'd MMM')} – ${format(end, 'd MMM yyyy')}`
}

function formatCoord(lat: number, lng: number) {
  const latDir = lat >= 0 ? 'N' : 'S'
  const lngDir = lng >= 0 ? 'E' : 'W'
  return `${Math.abs(lat).toFixed(4)} ${latDir}, ${Math.abs(lng).toFixed(4)} ${lngDir}`
}

function PhotoStrip({
  photos,
  editing,
  height,
  onRemove,
  onAddFiles,
  onPhotoClick,
}: {
  photos: VisitPhoto[]
  editing: boolean
  height: number
  onRemove: (p: VisitPhoto) => void
  onAddFiles: (files: File[]) => void
  onPhotoClick: (index: number) => void
}) {
  if (photos.length === 0 && !editing) return null
  const cols = photos.length >= 3 ? 'grid-cols-3' : photos.length === 2 ? 'grid-cols-2' : 'grid-cols-1'

  return (
    <div>
      <div className={`grid ${cols} gap-[5px]`}>
        {photos.map((p, i) => (
          <div key={p.id} className="relative" style={{ height }}>
            <PhotoThumb
              storagePath={p.storage_path}
              className="h-full w-full cursor-pointer object-cover"
              onClick={() => onPhotoClick(i)}
            />
            {editing && (
              <button
                onClick={() => onRemove(p)}
                className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center bg-ink/70 text-xs text-white hover:bg-coral"
              >
                &times;
              </button>
            )}
          </div>
        ))}
        {editing && photos.length < MAX_PHOTOS_PER_VISIT && (
          <label
            className="flex cursor-pointer items-center justify-center border border-dashed border-ink/30 text-ink/40 hover:border-coral"
            style={{ height }}
          >
            +
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []).slice(0, MAX_PHOTOS_PER_VISIT - photos.length)
                if (files.length) onAddFiles(files)
              }}
            />
          </label>
        )}
      </div>
      {editing && (
        <div className="mt-1.5">
          <GooglePhotosButton
            remainingSlots={MAX_PHOTOS_PER_VISIT - photos.length}
            onPicked={(picked) => onAddFiles(picked.map((p) => p.file))}
          />
        </div>
      )}
    </div>
  )
}

export function PlaceCard({
  place,
  onClose,
  onAddVisit,
  onUpdateVisit,
  onUpdatePlace,
  onDeleteVisit,
  onAddPhotos,
  onDeletePhoto,
  initialVisitId,
}: PlaceCardProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftNotes, setDraftNotes] = useState('')
  const [draftTown, setDraftTown] = useState('')
  const [draftCountry, setDraftCountry] = useState('')
  const [lightbox, setLightbox] = useState<{ photos: VisitPhoto[]; index: number } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const visits = [...place.visits].sort((a, b) => (a.visited_date < b.visited_date ? 1 : -1))
  const highlighted = initialVisitId ?? visits[0]?.id

  function startEdit(v: VisitWithPhotos) {
    setEditingId(v.id)
    setDraftNotes(v.notes ?? '')
    setDraftTown(place.town)
    setDraftCountry(place.country)
  }

  async function saveEdit(visitId: string) {
    setBusy(visitId)
    try {
      const placeUpdates: { town?: string; country?: string } = {}
      if (draftTown.trim() && draftTown !== place.town) placeUpdates.town = draftTown.trim()
      if (draftCountry.trim() && draftCountry !== place.country) placeUpdates.country = draftCountry.trim()
      await Promise.all([
        onUpdateVisit(visitId, { notes: draftNotes }),
        Object.keys(placeUpdates).length > 0 ? onUpdatePlace(placeUpdates) : Promise.resolve(),
      ])
      setEditingId(null)
    } finally {
      setBusy(null)
    }
  }

  async function handleDelete(visitId: string) {
    if (!confirm('Delete this visit and its photos?')) return
    setBusy(visitId)
    try {
      await onDeleteVisit(visitId)
    } finally {
      setBusy(null)
    }
  }

  function Header({ compact }: { compact?: boolean }) {
    return (
      <div className={compact ? 'px-4 pt-2' : 'px-[18px] pt-4'}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h4 className={`font-extrabold leading-[1.1] ${compact ? 'text-[22px]' : 'text-2xl'}`}>{place.town}</h4>
            <div className="mt-1.5 font-mono text-[11px] uppercase tracking-[.06em] text-ink/60">
              {place.country.toUpperCase()}
              {!compact && ` · ${formatCoord(place.latitude, place.longitude)}`}
            </div>
          </div>
          {visits.length > 1 && (
            <div className="whitespace-nowrap bg-amber px-2 py-1 text-[11px] font-extrabold text-ink">
              {visits.length} VISITS
            </div>
          )}
          {compact && (
            <button onClick={onClose} className="text-ink/40 hover:text-ink">
              &times;
            </button>
          )}
        </div>
      </div>
    )
  }

  function VisitList({ photoHeight }: { photoHeight: number }) {
    return (
      <>
        {visits.map((v, i) => (
          <div
            key={v.id}
            className={`px-2 py-3.5 -mx-2 ${i === 0 ? 'border-t-2 border-ink' : 'border-t border-ink/[.15]'} ${
              v.id === highlighted ? 'bg-surface' : ''
            }`}
          >
            <div className="mb-1.5 flex items-center justify-between">
              <span className={`font-mono text-[11px] uppercase tracking-[.06em] ${i === 0 ? 'text-coral' : 'text-ink/60'}`}>
                {formatRange(v.visited_date, v.end_date)}
              </span>
              {editingId === v.id ? (
                <div className="flex gap-3 text-[12px]">
                  <button onClick={() => saveEdit(v.id)} disabled={busy === v.id} className="font-extrabold text-sage">
                    Save
                  </button>
                  <button onClick={() => setEditingId(null)} className="text-ink/40">
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex gap-3.5 text-[12px]">
                  <button onClick={() => startEdit(v)} className="font-extrabold text-sage hover:text-sage-pressed">
                    Edit
                  </button>
                  <button onClick={() => handleDelete(v.id)} disabled={busy === v.id} className="text-ink/60 hover:text-ink">
                    Delete
                  </button>
                </div>
              )}
            </div>

            {editingId === v.id && (
              <div className="mb-2.5 grid grid-cols-2 gap-2">
                <label className="text-[11px] text-ink/60">
                  Town
                  <input
                    value={draftTown}
                    onChange={(e) => setDraftTown(e.target.value)}
                    className="mt-1 w-full border border-ink/25 bg-surface px-2 py-1.5 text-sm"
                  />
                </label>
                <label className="text-[11px] text-ink/60">
                  Country
                  <input
                    value={draftCountry}
                    onChange={(e) => setDraftCountry(e.target.value)}
                    className="mt-1 w-full border border-ink/25 bg-surface px-2 py-1.5 text-sm"
                  />
                </label>
              </div>
            )}

            {editingId === v.id ? (
              <textarea
                value={draftNotes}
                onChange={(e) => setDraftNotes(e.target.value)}
                rows={3}
                className="mb-2.5 w-full border border-ink/25 bg-surface px-2.5 py-2 text-sm text-pretty"
              />
            ) : (
              v.notes && <p className="mb-2.5 whitespace-pre-wrap text-[14px] leading-[1.5] text-pretty">{v.notes}</p>
            )}

            <PhotoStrip
              photos={v.photos}
              editing={editingId === v.id}
              height={photoHeight}
              onRemove={onDeletePhoto}
              onAddFiles={(files) => onAddPhotos(v.id, files, v.photos.length)}
              onPhotoClick={(index) => setLightbox({ photos: v.photos, index })}
            />
          </div>
        ))}

        <button
          onClick={onAddVisit}
          className="mt-3.5 block w-full bg-coral px-4 py-3.5 text-left text-[13px] font-extrabold text-white hover:bg-coral-pressed"
        >
          + Add another visit
        </button>
      </>
    )
  }

  return (
    <>
      {/* Desktop floating panel */}
      <div className="pointer-events-auto absolute left-6 top-6 z-20 hidden max-h-[calc(100%-48px)] w-[372px] flex-col border-2 border-ink bg-ground sm:flex">
        <div className="flex items-start justify-between border-b-2 border-ink pb-2">
          <div className="flex-1">
            <Header />
          </div>
          <button onClick={onClose} className="mr-3 mt-4 text-ink/40 hover:text-ink">
            &times;
          </button>
        </div>
        <div className="overflow-y-auto px-[18px] pb-[18px]">
          <VisitList photoHeight={72} />
        </div>
      </div>

      {/* Mobile bottom sheet */}
      <div className="pointer-events-auto fixed inset-x-0 bottom-14 z-20 flex max-h-[65vh] flex-col border-t-2 border-ink bg-ground sm:hidden">
        <div className="mx-auto mb-2 mt-3.5 h-1 w-11 flex-shrink-0 bg-ink/15" />
        <Header compact />
        <div className="mt-2 overflow-y-auto px-4 pb-4">
          <VisitList photoHeight={74} />
        </div>
      </div>

      {lightbox && (
        <Lightbox photos={lightbox.photos} startIndex={lightbox.index} onClose={() => setLightbox(null)} />
      )}
    </>
  )
}
