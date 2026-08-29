import { useEffect, useRef, useState } from 'react'
import { searchTown, reverseGeocode, type GeocodeResult } from '../lib/geocode'
import type { PlaceWithVisits } from '../types'
import { GooglePhotosButton } from './GooglePhotosButton'
import type { PickedPhoto } from '../lib/googlePhotos'
import { MAX_PHOTOS_PER_VISIT } from '../lib/constants'

interface AddVisitFormProps {
  places: PlaceWithVisits[]
  pendingPick: { lat: number; lng: number } | null
  onStartPickMode: () => void
  onClearPick: () => void
  onSave: (input: {
    existingPlaceId: string | null
    town: string
    country: string
    latitude: number
    longitude: number
    visited_date: string
    end_date: string | null
    notes: string
    photos: File[]
  }) => Promise<void>
  onClose: () => void
}

function earliestDate(times: string[]): string | null {
  if (times.length === 0) return null
  const earliest = times.reduce((min, t) => (t < min ? t : min))
  return earliest.slice(0, 10) // ISO date -> yyyy-mm-dd for the <input type="date">
}

export function AddVisitForm({
  places,
  pendingPick,
  onStartPickMode,
  onClearPick,
  onSave,
  onClose,
}: AddVisitFormProps) {
  const [mode, setMode] = useState<'existing' | 'search'>('search')
  const [existingPlaceId, setExistingPlaceId] = useState('')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<GeocodeResult[]>([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<GeocodeResult | null>(null)
  const [visitedDate, setVisitedDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [notes, setNotes] = useState('')
  const [photos, setPhotos] = useState<File[]>([])
  const photoCreateTimesRef = useRef<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!pendingPick) return
    reverseGeocode(pendingPick.lat, pendingPick.lng)
      .then((r) => setSelected(r))
      .catch(() =>
        setSelected({ town: '', country: '', latitude: pendingPick.lat, longitude: pendingPick.lng })
      )
      .finally(() => onClearPick())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPick])

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([])
      return
    }
    let cancelled = false
    setSearching(true)
    const timer = setTimeout(() => {
      searchTown(query)
        .then((r) => {
          if (!cancelled) setResults(r)
        })
        .catch(() => {
          if (!cancelled) setError('Search failed — try again or click the map to drop a pin.')
        })
        .finally(() => {
          if (!cancelled) setSearching(false)
        })
    }, 350)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!visitedDate) {
      setError('Date is required.')
      return
    }
    setSaving(true)
    try {
      if (mode === 'existing') {
        const place = places.find((p) => p.id === existingPlaceId)
        if (!place) throw new Error('Pick a place')
        await onSave({
          existingPlaceId: place.id,
          town: place.town,
          country: place.country,
          latitude: place.latitude,
          longitude: place.longitude,
          visited_date: visitedDate,
          end_date: endDate || null,
          notes,
          photos,
        })
      } else {
        if (!selected) throw new Error('Search a town or click the map to place a pin.')
        await onSave({
          existingPlaceId: null,
          town: selected.town,
          country: selected.country,
          latitude: selected.latitude,
          longitude: selected.longitude,
          visited_date: visitedDate,
          end_date: endDate || null,
          notes,
          photos,
        })
      }
      onClose()
    } catch (e: any) {
      setError(e.message ?? 'Failed to save visit')
    } finally {
      setSaving(false)
    }
  }

  function onFilesChosen(files: FileList | null) {
    if (!files) return
    const arr = Array.from(files).slice(0, MAX_PHOTOS_PER_VISIT - photos.length)
    setPhotos((prev) => [...prev, ...arr].slice(0, MAX_PHOTOS_PER_VISIT))
  }

  function onGooglePhotosPicked(picked: PickedPhoto[]) {
    setPhotos((prev) => [...prev, ...picked.map((p) => p.file)].slice(0, MAX_PHOTOS_PER_VISIT))
    const newTimes = picked.map((p) => p.createTime).filter((t): t is string => !!t)
    if (newTimes.length === 0) return
    photoCreateTimesRef.current = [...photoCreateTimesRef.current, ...newTimes]
    // Google's metadata gives us a date, not a town — prefill only the
    // date, and only while the user hasn't already set one themselves.
    setVisitedDate((current) => current || earliestDate(photoCreateTimesRef.current) || current)
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/50 sm:items-center">
      <form
        onSubmit={handleSubmit}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto border-2 border-ink bg-ground p-6"
      >
        <div className="mb-4 flex items-center justify-between border-b-2 border-ink pb-3">
          <h2 className="text-xl font-extrabold">Log a visit</h2>
          <button type="button" onClick={onClose} className="text-ink/40 hover:text-ink">
            &times;
          </button>
        </div>

        <div className="mb-4">
          <GooglePhotosButton remainingSlots={MAX_PHOTOS_PER_VISIT - photos.length} onPicked={onGooglePhotosPicked} variant="primary" />
          <p className="mt-1.5 text-[11px] text-ink/50">
            Fills in the date from the photo — you'll still need to set the town.
          </p>
        </div>

        <div className="mb-4">
          <label className="mb-1 block text-[12px] text-ink/60">Photos (up to {MAX_PHOTOS_PER_VISIT})</label>
          <div className="flex flex-wrap gap-2">
            {photos.map((f, i) => (
              <div key={i} className="relative h-20 w-20 bg-surface">
                <img src={URL.createObjectURL(f)} className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => setPhotos((prev) => prev.filter((_, idx) => idx !== i))}
                  className="absolute right-0 top-0 bg-ink/70 px-1 text-xs text-white hover:bg-coral"
                >
                  &times;
                </button>
              </div>
            ))}
            {photos.length < MAX_PHOTOS_PER_VISIT && (
              <label className="flex h-20 w-20 cursor-pointer items-center justify-center border border-dashed border-ink/30 text-ink/40 hover:border-coral">
                +
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => onFilesChosen(e.target.files)}
                />
              </label>
            )}
          </div>
        </div>

        <div className="mb-4 flex border border-ink">
          <button
            type="button"
            className={`px-3 py-1.5 text-[12px] font-extrabold ${mode === 'search' ? 'bg-sage text-white' : 'text-ink/60'}`}
            onClick={() => setMode('search')}
          >
            New / search town
          </button>
          <button
            type="button"
            className={`border-l border-ink px-3 py-1.5 text-[12px] font-extrabold ${mode === 'existing' ? 'bg-sage text-white' : 'text-ink/60'}`}
            onClick={() => setMode('existing')}
          >
            Existing place
          </button>
        </div>

        {mode === 'existing' ? (
          <select
            className="mb-4 w-full border border-ink/25 bg-surface px-3 py-2"
            value={existingPlaceId}
            onChange={(e) => setExistingPlaceId(e.target.value)}
          >
            <option value="">Select a place…</option>
            {places.map((p) => (
              <option key={p.id} value={p.id}>
                {p.town}, {p.country}
              </option>
            ))}
          </select>
        ) : (
          <div className="mb-4 space-y-2">
            <div className="relative">
              <input
                className="w-full border border-ink/25 bg-surface px-3 py-2"
                placeholder="Search a town, e.g. George Town, Penang"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setSelected(null)
                }}
                onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
              />
              {searching && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink/40">…</span>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                onClose()
                onStartPickMode()
              }}
              className="text-[13px] text-sage underline hover:text-sage-pressed"
            >
              or click the map to drop a pin
            </button>
            {results.length > 0 && !selected && (
              <ul className="max-h-40 overflow-y-auto border border-ink/20 bg-ground">
                {results.map((r, i) => (
                  <li key={i}>
                    <button
                      type="button"
                      className="w-full px-3 py-2 text-left text-sm hover:bg-surface"
                      onClick={() => {
                        setSelected(r)
                        setResults([])
                        setQuery(`${r.town}, ${r.country}`)
                      }}
                    >
                      {r.town}, {r.country}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {selected && (
              <p className="text-sm text-ink/60">
                Selected: <strong>{selected.town || '(unnamed)'}</strong>, {selected.country || '?'}
              </p>
            )}
          </div>
        )}

        <div className="mb-4 grid grid-cols-2 gap-3">
          <label className="text-[12px] text-ink/60">
            Date
            <input
              type="date"
              required
              value={visitedDate}
              onChange={(e) => setVisitedDate(e.target.value)}
              className="mt-1 w-full border border-ink/25 bg-surface px-3 py-2"
            />
          </label>
          <label className="text-[12px] text-ink/60">
            End date (optional)
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="mt-1 w-full border border-ink/25 bg-surface px-3 py-2"
            />
          </label>
        </div>

        <label className="mb-4 block text-[12px] text-ink/60">
          Memory
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            className="mt-1 w-full border border-ink/25 bg-surface px-3 py-2 text-pretty"
            placeholder="What happened here?"
          />
        </label>

        {error && <p className="mb-3 text-sm text-coral-pressed">{error}</p>}

        <button
          type="submit"
          disabled={saving}
          className="w-full bg-coral py-3 text-[13px] font-extrabold text-white hover:bg-coral-pressed disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save visit'}
        </button>
      </form>
    </div>
  )
}
