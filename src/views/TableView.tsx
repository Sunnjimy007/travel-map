import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import type { PlaceWithVisits, VisitPhoto } from '../types'
import { exportVisitsToCsv } from '../lib/csv'
import { PhotoThumb } from '../components/PhotoThumb'
import { Lightbox } from '../components/Lightbox'
import { MAX_PHOTOS_PER_VISIT } from '../lib/constants'

interface Row {
  visitId: string
  placeId: string
  town: string
  country: string
  visited_date: string
  end_date: string | null
  notes: string | null
  photos: VisitPhoto[]
  latitude: number
  longitude: number
}

type SortKey = 'town' | 'country' | 'visited_date' | 'end_date'

interface TableViewProps {
  places: PlaceWithVisits[]
  onUpdateVisit: (visitId: string, updates: { visited_date?: string; end_date?: string | null; notes?: string }) => Promise<void>
  onUpdatePlace: (placeId: string, updates: { town?: string; country?: string }) => Promise<void>
  onDeleteVisit: (visitId: string) => Promise<void>
  onAddVisit: () => void
  onAddPhotos: (visitId: string, files: File[], startOrder: number) => Promise<void>
}

const GRID_COLS = '148px 116px 104px 104px 1fr 82px 74px 74px 62px'

function dateShort(d: string): string {
  return format(new Date(d), 'd MMM yy').toUpperCase()
}

interface DraftState {
  town: string
  visited_date: string
  end_date: string
  notes: string
}

export function TableView({
  places,
  onUpdateVisit,
  onUpdatePlace,
  onDeleteVisit,
  onAddVisit,
  onAddPhotos,
}: TableViewProps) {
  const [sortKey, setSortKey] = useState<SortKey>('visited_date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [countryFilter, setCountryFilter] = useState('')
  const [yearFilter, setYearFilter] = useState('')
  const [search, setSearch] = useState('')
  const [lightbox, setLightbox] = useState<{ photos: VisitPhoto[]; index: number } | null>(null)
  const [uploadTarget, setUploadTarget] = useState<Row | null>(null)
  const [editingVisitId, setEditingVisitId] = useState<string | null>(null)
  const [draft, setDraft] = useState<DraftState>({ town: '', visited_date: '', end_date: '', notes: '' })
  const [saving, setSaving] = useState(false)

  const rows: Row[] = useMemo(() => {
    const all: Row[] = []
    for (const p of places) {
      for (const v of p.visits) {
        all.push({
          visitId: v.id,
          placeId: p.id,
          town: p.town,
          country: p.country,
          visited_date: v.visited_date,
          end_date: v.end_date,
          notes: v.notes,
          photos: v.photos,
          latitude: p.latitude,
          longitude: p.longitude,
        })
      }
    }
    return all
  }, [places])

  const countries = useMemo(() => [...new Set(places.map((p) => p.country))].sort(), [places])
  const years = useMemo(
    () => [...new Set(rows.map((r) => r.visited_date.slice(0, 4)))].sort().reverse(),
    [rows]
  )
  const townCount = new Set(places.map((p) => p.id)).size

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (countryFilter && r.country !== countryFilter) return false
      if (yearFilter && r.visited_date.slice(0, 4) !== yearFilter) return false
      if (search) {
        const s = search.toLowerCase()
        if (!r.town.toLowerCase().includes(s) && !r.country.toLowerCase().includes(s) && !(r.notes ?? '').toLowerCase().includes(s)) {
          return false
        }
      }
      return true
    })
  }, [rows, countryFilter, yearFilter, search])

  const sorted = useMemo(() => {
    const copy = [...filtered]
    copy.sort((a, b) => {
      const av = a[sortKey] ?? ''
      const bv = b[sortKey] ?? ''
      const cmp = av < bv ? -1 : av > bv ? 1 : 0
      return sortDir === 'asc' ? cmp : -cmp
    })
    return copy
  }, [filtered, sortKey, sortDir])

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  function startEdit(r: Row) {
    setEditingVisitId(r.visitId)
    setDraft({ town: r.town, visited_date: r.visited_date, end_date: r.end_date ?? '', notes: r.notes ?? '' })
  }

  async function saveEdit(r: Row) {
    setSaving(true)
    try {
      const placeUpdates: { town?: string } = {}
      if (draft.town.trim() && draft.town !== r.town) placeUpdates.town = draft.town.trim()
      await Promise.all([
        onUpdateVisit(r.visitId, {
          visited_date: draft.visited_date,
          end_date: draft.end_date || null,
          notes: draft.notes,
        }),
        Object.keys(placeUpdates).length > 0 ? onUpdatePlace(r.placeId, placeUpdates) : Promise.resolve(),
      ])
      setEditingVisitId(null)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(visitId: string) {
    if (!confirm('Delete this visit and its photos?')) return
    await onDeleteVisit(visitId)
  }

  const headerCell = (key: SortKey, label: string) => (
    <span
      className={`cursor-pointer select-none whitespace-nowrap font-mono text-[10px] font-extrabold uppercase tracking-[.12em] ${
        sortKey === key ? 'text-ink' : 'text-ink/60 hover:text-ink'
      }`}
      onClick={() => toggleSort(key)}
    >
      {label} {sortKey === key ? '▼' : ''}
    </span>
  )

  const filterSelectClass = 'border border-ink/25 px-2.5 py-1.5 text-[12px] bg-ground cursor-pointer'

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-ink/35 px-5 py-3.5 md:px-5">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="font-mono text-[11px] font-extrabold uppercase tracking-[.12em] text-ink/60">
            {rows.length} visits · {townCount} towns
          </span>
          <select value={countryFilter} onChange={(e) => setCountryFilter(e.target.value)} className={filterSelectClass}>
            <option value="">Country: All</option>
            {countries.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select value={yearFilter} onChange={(e) => setYearFilter(e.target.value)} className={filterSelectClass}>
            <option value="">Year: All</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <input
            placeholder="Search towns and notes"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border border-ink/25 px-2.5 py-1.5 text-[12px]"
          />
        </div>
        <div className="flex gap-2.5">
          <button
            onClick={() => exportVisitsToCsv(places)}
            className="border border-sage px-3.5 py-2 text-[12px] font-extrabold text-sage hover:bg-sage/10"
          >
            Download CSV
          </button>
          <button
            onClick={onAddVisit}
            className="bg-coral px-3.5 py-2 text-[12px] font-extrabold text-white hover:bg-coral-pressed"
          >
            + Add visit
          </button>
        </div>
      </div>

      {/* Desktop grid */}
      <div className="hidden flex-1 flex-col overflow-y-auto md:flex">
        <div
          className="sticky top-0 z-10 grid gap-3.5 border-b-2 border-ink bg-ground px-5 py-2.5"
          style={{ gridTemplateColumns: GRID_COLS }}
        >
          {headerCell('town', 'Town')}
          {headerCell('country', 'Country')}
          {headerCell('visited_date', 'Visited')}
          {headerCell('end_date', 'End')}
          <span className="font-mono text-[10px] font-extrabold uppercase tracking-[.12em] text-ink/60">Notes</span>
          <span className="font-mono text-[10px] font-extrabold uppercase tracking-[.12em] text-ink/60">Photos</span>
          <span className="font-mono text-[10px] font-extrabold uppercase tracking-[.12em] text-ink/60">Lat</span>
          <span className="font-mono text-[10px] font-extrabold uppercase tracking-[.12em] text-ink/60">Long</span>
          <span />
        </div>

        {sorted.map((r) => {
          const isEditing = editingVisitId === r.visitId
          if (isEditing) {
            return (
              <div
                key={r.visitId}
                className="grid items-center gap-3.5 border-b-2 border-t-2 border-coral bg-surface px-5 py-2.5"
                style={{ gridTemplateColumns: GRID_COLS }}
              >
                <input
                  value={draft.town}
                  onChange={(e) => setDraft((d) => ({ ...d, town: e.target.value }))}
                  className="border border-ink/25 bg-ground px-2 py-1.5 text-[13px]"
                />
                <span className="text-[13px] text-ink/60">{r.country}</span>
                <input
                  type="date"
                  value={draft.visited_date}
                  onChange={(e) => setDraft((d) => ({ ...d, visited_date: e.target.value }))}
                  className="border border-ink/25 bg-ground px-2 py-1.5 font-mono text-[12px]"
                />
                <input
                  type="date"
                  value={draft.end_date}
                  onChange={(e) => setDraft((d) => ({ ...d, end_date: e.target.value }))}
                  className="border border-ink/25 bg-ground px-2 py-1.5 font-mono text-[12px]"
                />
                <input
                  value={draft.notes}
                  onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
                  className="border border-ink/25 bg-ground px-2 py-1.5 text-[13px]"
                />
                <span className="font-mono text-[11px] text-sage">
                  {r.photos.length}/3
                </span>
                <span className="font-mono text-[12px] text-ink/60">{r.latitude.toFixed(3)}</span>
                <span className="font-mono text-[12px] text-ink/60">{r.longitude.toFixed(3)}</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => saveEdit(r)}
                    disabled={saving}
                    className="bg-coral px-2 py-1 text-[11px] font-extrabold text-white"
                  >
                    Save
                  </button>
                  <button onClick={() => setEditingVisitId(null)} className="text-[11px] text-ink/60">
                    Esc
                  </button>
                </div>
              </div>
            )
          }
          return (
            <div
              key={r.visitId}
              className="grid items-center gap-3.5 border-b border-ink/[.15] px-5 py-2.5 hover:bg-surface"
              style={{ gridTemplateColumns: GRID_COLS }}
            >
              <span className="truncate text-[14px] font-extrabold">{r.town}</span>
              <span className="truncate text-[13px]">{r.country}</span>
              <span className="font-mono text-[12px]">{dateShort(r.visited_date)}</span>
              <span className="font-mono text-[12px] text-ink/60">{r.end_date ? dateShort(r.end_date) : '—'}</span>
              <span className="truncate text-[13px] text-ink/80">{r.notes || <span className="text-ink/30">—</span>}</span>
              <div className="flex items-center gap-1">
                {r.photos.slice(0, 2).map((p, i) => (
                  <PhotoThumb
                    key={p.id}
                    storagePath={p.storage_path}
                    className="h-6 w-6 cursor-pointer object-cover"
                    onClick={() => setLightbox({ photos: r.photos, index: i })}
                  />
                ))}
                {r.photos.length > 2 && (
                  <span className="font-mono text-[11px] text-ink/60">+{r.photos.length - 2}</span>
                )}
                {r.photos.length === 0 && (
                  <button
                    onClick={() => setUploadTarget(r)}
                    className="font-mono text-[11px] text-sage hover:text-sage-pressed"
                  >
                    upload
                  </button>
                )}
                {r.photos.length > 0 && r.photos.length < 3 && (
                  <button
                    onClick={() => setUploadTarget(r)}
                    className="flex h-6 w-6 items-center justify-center border border-dashed border-ink/30 text-ink/40 hover:border-coral"
                  >
                    +
                  </button>
                )}
              </div>
              <span className="font-mono text-[12px] text-ink/60">{r.latitude.toFixed(4)}</span>
              <span className="font-mono text-[12px] text-ink/60">{r.longitude.toFixed(4)}</span>
              <div className="flex gap-2.5">
                <button onClick={() => startEdit(r)} className="text-[11px] font-extrabold text-sage hover:text-sage-pressed">
                  Edit
                </button>
                <button onClick={() => handleDelete(r.visitId)} className="text-[11px] text-ink/60 hover:text-coral-pressed">
                  Del
                </button>
              </div>
            </div>
          )
        })}

        {sorted.length === 0 && (
          <div className="px-5 py-10 text-center text-ink/40">No visits match.</div>
        )}

        <div className="mt-auto flex items-center justify-between border-t-2 border-ink px-5 py-3 font-mono text-[11px] tracking-[.06em] text-ink/60">
          <span>
            SHOWING {sorted.length} OF {rows.length}
          </span>
          <span>PHOTOS EXPORT AS STORAGE PATHS + A COUNT</span>
        </div>
      </div>

      {/* Mobile field cards */}
      <div className="flex-1 overflow-y-auto pb-20 md:hidden">
        {sorted.map((r) => {
          const isEditing = editingVisitId === r.visitId
          if (isEditing) {
            return (
              <div key={r.visitId} className="flex flex-col gap-2.5 border-b-2 border-t-2 border-coral bg-surface px-4 py-3.5">
                <div className="font-mono text-[11px] font-extrabold uppercase tracking-[.12em] text-coral">Editing visit</div>
                <label className="block">
                  <div className="mb-1 font-mono text-[10px] font-extrabold uppercase tracking-[.1em] text-ink/60">Town</div>
                  <input
                    value={draft.town}
                    onChange={(e) => setDraft((d) => ({ ...d, town: e.target.value }))}
                    className="w-full border border-ink/25 bg-ground px-2.5 py-2 text-[14px]"
                  />
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  <label className="block">
                    <div className="mb-1 font-mono text-[10px] font-extrabold uppercase tracking-[.1em] text-ink/60">Visited</div>
                    <input
                      type="date"
                      value={draft.visited_date}
                      onChange={(e) => setDraft((d) => ({ ...d, visited_date: e.target.value }))}
                      className="w-full border border-ink/25 bg-ground px-2.5 py-2 font-mono text-[13px]"
                    />
                  </label>
                  <label className="block">
                    <div className="mb-1 font-mono text-[10px] font-extrabold uppercase tracking-[.1em] text-ink/60">End</div>
                    <input
                      type="date"
                      value={draft.end_date}
                      onChange={(e) => setDraft((d) => ({ ...d, end_date: e.target.value }))}
                      className="w-full border border-ink/25 bg-ground px-2.5 py-2 font-mono text-[13px]"
                    />
                  </label>
                </div>
                <label className="block">
                  <div className="mb-1 font-mono text-[10px] font-extrabold uppercase tracking-[.1em] text-ink/60">Memory</div>
                  <textarea
                    value={draft.notes}
                    onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
                    rows={3}
                    className="w-full border border-ink/25 bg-ground px-2.5 py-2 text-[14px]"
                  />
                </label>
                <div>
                  <div className="mb-1 font-mono text-[10px] font-extrabold uppercase tracking-[.1em] text-ink/60">
                    Photos · {r.photos.length} of {MAX_PHOTOS_PER_VISIT}
                  </div>
                  <div className="flex gap-1.5">
                    {r.photos.map((p, i) => (
                      <PhotoThumb
                        key={p.id}
                        storagePath={p.storage_path}
                        className="h-14 w-14 cursor-pointer object-cover"
                        onClick={() => setLightbox({ photos: r.photos, index: i })}
                      />
                    ))}
                    {r.photos.length < MAX_PHOTOS_PER_VISIT && (
                      <button
                        onClick={() => setUploadTarget(r)}
                        className="flex h-14 w-14 items-center justify-center border border-dashed border-ink/30 text-lg font-extrabold text-sage"
                      >
                        +
                      </button>
                    )}
                  </div>
                </div>
                <div className="mt-0.5 flex gap-2">
                  <button
                    onClick={() => saveEdit(r)}
                    disabled={saving}
                    className="flex-1 bg-coral py-3 text-[13px] font-extrabold text-white"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditingVisitId(null)}
                    className="border border-ink/25 px-4 py-3 text-[13px] font-extrabold text-ink/60"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleDelete(r.visitId)}
                    className="border border-ink/25 px-4 py-3 text-[13px] font-extrabold text-ink/60"
                  >
                    Delete
                  </button>
                </div>
              </div>
            )
          }
          return (
            <div key={r.visitId} className="flex items-start justify-between gap-3 border-b border-ink/[.15] px-4 py-3.5">
              <div className="min-w-0">
                <div className="text-[18px] font-extrabold">{r.town}</div>
                <div className="my-[3px] font-mono text-[11px] text-ink/60">
                  {r.country.toUpperCase()} · {dateShort(r.visited_date)}
                  {r.end_date ? `–${dateShort(r.end_date)}` : ''} ·{' '}
                  {r.photos.length === 0 ? 'NO PHOTOS' : `${r.photos.length} PHOTO${r.photos.length !== 1 ? 'S' : ''}`}
                </div>
                {r.notes && <div className="truncate text-[13px] leading-[1.4]">{r.notes}</div>}
              </div>
              <button onClick={() => startEdit(r)} className="flex-shrink-0 text-[11px] font-extrabold text-sage">
                Edit
              </button>
            </div>
          )
        })}

        {sorted.length === 0 && <div className="px-4 py-10 text-center text-ink/40">No visits match.</div>}
      </div>

      <div className="fixed inset-x-0 bottom-14 z-20 px-4 py-3 md:hidden">
        <button
          onClick={onAddVisit}
          className="block w-full bg-coral px-4 py-3.5 text-left text-[13px] font-extrabold text-white shadow-[0_-4px_12px_rgba(30,41,59,0.15)]"
        >
          + Add visit
        </button>
      </div>

      {uploadTarget && (
        <input
          type="file"
          accept="image/*"
          multiple
          autoFocus
          className="fixed bottom-16 left-4 z-30 md:bottom-4"
          onChange={async (e) => {
            const files = Array.from(e.target.files ?? []).slice(0, MAX_PHOTOS_PER_VISIT - uploadTarget.photos.length)
            if (files.length) await onAddPhotos(uploadTarget.visitId, files, uploadTarget.photos.length)
            setUploadTarget(null)
          }}
        />
      )}

      {lightbox && (
        <Lightbox photos={lightbox.photos} startIndex={lightbox.index} onClose={() => setLightbox(null)} />
      )}
    </div>
  )
}
