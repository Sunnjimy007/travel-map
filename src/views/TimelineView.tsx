import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import type { PlaceWithVisits } from '../types'
import { PhotoThumb } from '../components/PhotoThumb'

interface Entry {
  place: PlaceWithVisits
  visitId: string
  visited_date: string
  end_date: string | null
  notes: string | null
  photos: { id: string; storage_path: string }[]
  visitOrdinal: number
}

interface TimelineViewProps {
  places: PlaceWithVisits[]
  onSelectVisit: (placeId: string, visitId: string) => void
}

function ordinal(n: number): string {
  const suffixes = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${suffixes[(v - 20) % 10] ?? suffixes[v] ?? suffixes[0]}`
}

function dateNoYear(visitedDate: string, endDate: string | null): string {
  const start = new Date(visitedDate)
  if (!endDate) return format(start, 'd MMMM').toUpperCase()
  const end = new Date(endDate)
  if (start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth()) {
    return `${start.getDate()}–${end.getDate()} ${format(start, 'MMMM').toUpperCase()}`
  }
  return `${format(start, 'd MMM').toUpperCase()} – ${format(end, 'd MMM').toUpperCase()}`
}

function dateWithYear(visitedDate: string): string {
  return format(new Date(visitedDate), 'd MMM yyyy').toUpperCase()
}

function buildEntries(places: PlaceWithVisits[]): Entry[] {
  const entries: Entry[] = []
  for (const place of places) {
    const sorted = [...place.visits].sort((a, b) => (a.visited_date < b.visited_date ? -1 : 1))
    sorted.forEach((v, i) => {
      entries.push({
        place,
        visitId: v.id,
        visited_date: v.visited_date,
        end_date: v.end_date,
        notes: v.notes,
        photos: v.photos,
        visitOrdinal: i + 1,
      })
    })
  }
  return entries
}

function PhotoStrip({ photos }: { photos: Entry['photos'] }) {
  if (photos.length === 0) return null
  if (photos.length === 1) {
    return (
      <div className="h-[180px]">
        <PhotoThumb storagePath={photos[0].storage_path} className="h-full w-full object-cover" />
      </div>
    )
  }
  if (photos.length === 2) {
    return (
      <div className="grid h-[200px] grid-cols-2 gap-1.5">
        {photos.map((p) => (
          <PhotoThumb key={p.id} storagePath={p.storage_path} className="h-full w-full object-cover" />
        ))}
      </div>
    )
  }
  return (
    <div className="grid h-[260px] grid-cols-[2fr_1fr] grid-rows-2 gap-1.5">
      <div className="row-span-2">
        <PhotoThumb storagePath={photos[0].storage_path} className="h-full w-full object-cover" />
      </div>
      <PhotoThumb storagePath={photos[1].storage_path} className="h-full w-full object-cover" />
      <PhotoThumb storagePath={photos[2].storage_path} className="h-full w-full object-cover" />
    </div>
  )
}

export function TimelineView({ places, onSelectVisit }: TimelineViewProps) {
  const [order, setOrder] = useState<'newest' | 'oldest'>('newest')

  const allEntries = useMemo(() => buildEntries(places), [places])

  const sorted = useMemo(() => {
    const copy = [...allEntries].sort((a, b) => (a.visited_date < b.visited_date ? -1 : 1))
    if (order === 'newest') copy.reverse()
    return copy
  }, [allEntries, order])

  const grouped = useMemo(() => {
    const map = new Map<string, Entry[]>()
    for (const e of sorted) {
      const year = e.visited_date.slice(0, 4)
      const list = map.get(year) ?? []
      list.push(e)
      map.set(year, list)
    }
    return map
  }, [sorted])

  const years = allEntries.map((e) => e.visited_date.slice(0, 4)).sort()
  const yearRange = years.length > 0 ? `${years[0]}—${years[years.length - 1]}` : '—'
  const mostRecentYear = years.length > 0 ? years[years.length - 1] : null
  const townCount = new Set(places.map((p) => p.id)).size

  if (allEntries.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
        <div className="font-mono text-[11px] uppercase tracking-[.14em] text-ink/60">Chronology</div>
        <div className="text-2xl font-extrabold">No visits logged yet.</div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header — shared by desktop and mobile, adapted per breakpoint */}
      <div className="hidden shrink-0 items-end justify-between gap-6 px-8 pb-2 pt-11 md:flex">
        <div>
          <div className="mb-2.5 font-mono text-[11px] uppercase tracking-[.14em] text-ink/60">
            Chronology · {yearRange}
          </div>
          <div className="text-[52px] font-extrabold leading-[1] tracking-[-.02em]">
            {allEntries.length} visits, {townCount} towns.
          </div>
        </div>
        <div className="flex border border-ink">
          {(['newest', 'oldest'] as const).map((o) => (
            <button
              key={o}
              onClick={() => setOrder(o)}
              className={`px-4 py-2.5 text-[12px] font-extrabold capitalize ${
                order === o ? 'bg-ink text-ground' : 'font-normal text-ink/60'
              }`}
            >
              {o}
            </button>
          ))}
        </div>
      </div>

      {/* Mobile header */}
      <div className="flex shrink-0 items-center justify-between border-b-2 border-t-2 border-ink px-4 py-2.5 md:hidden">
        <span className="text-[14px] font-extrabold uppercase tracking-[.1em]">Timeline</span>
        <button
          onClick={() => setOrder(order === 'newest' ? 'oldest' : 'newest')}
          className="border border-ink px-2 py-1 font-mono text-[11px] uppercase text-ink/70"
        >
          {order} ↓
        </button>
      </div>

      <div className="hidden shrink-0 border-t-2 border-ink px-8 md:mx-8 md:mt-7 md:block" />

      {/* Desktop editorial list */}
      <div className="hidden flex-1 overflow-y-auto px-8 pb-10 md:block">
        {[...grouped.entries()].map(([year, entries]) => (
          <div
            key={year}
            className="grid grid-cols-[200px_1fr] gap-8 border-b border-ink/20 py-[34px] last:border-b-0"
          >
            <div
              className={`sticky top-0 self-start text-[96px] font-extrabold leading-[.8] tracking-[-.04em] ${
                year === mostRecentYear ? 'text-coral' : 'text-ink/20'
              }`}
            >
              {year}
            </div>
            <div className="flex flex-col gap-[34px]">
              {entries.map((e) => (
                <div key={e.visitId} className="grid grid-cols-[1fr_420px] items-start gap-7">
                  <div>
                    <div className="mb-2 font-mono text-[11px] text-ink/60">{dateNoYear(e.visited_date, e.end_date)}</div>
                    <div className="text-[34px] font-extrabold leading-[1.05] tracking-[-.02em]">{e.place.town}</div>
                    <div className="mt-1.5 mb-3 text-[13px] uppercase tracking-[.1em] text-ink/60">
                      {e.place.country}
                      {e.visitOrdinal > 1 && (
                        <span className="ml-2 bg-amber px-[7px] py-[2px] tracking-[.06em] text-ink">
                          {ordinal(e.visitOrdinal)} visit
                        </span>
                      )}
                    </div>
                    {e.notes && <p className="max-w-[52ch] text-[16px] leading-[1.55] text-pretty">{e.notes}</p>}
                    <div className="mt-4 flex gap-4">
                      <button
                        onClick={() => onSelectVisit(e.place.id, e.visitId)}
                        className="border-b-2 border-sage text-[12px] font-extrabold text-sage hover:text-sage-pressed hover:border-sage-pressed"
                      >
                        Show on map →
                      </button>
                    </div>
                  </div>
                  <PhotoStrip photos={e.photos} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Mobile list */}
      <div className="flex-1 overflow-y-auto md:hidden">
        {[...grouped.entries()].map(([year, entries]) => (
          <div key={year}>
            <div className="sticky top-0 z-10 flex items-baseline gap-2 bg-ink px-4 py-2.5 text-ground">
              <span className="text-[18px] font-extrabold">{year}</span>
              <span className="font-mono text-[10px] opacity-70">
                {entries.length} VISIT{entries.length !== 1 ? 'S' : ''}
              </span>
            </div>

            {entries.map((e, i) => {
              const isLead = i === 0
              if (isLead) {
                return (
                  <div key={e.visitId} className="border-b border-ink/[.15]">
                    {e.photos[0] ? (
                      <PhotoThumb storagePath={e.photos[0].storage_path} className="h-[190px] w-full object-cover" />
                    ) : (
                      <div
                        className="h-[190px] w-full"
                        style={{
                          background:
                            'repeating-linear-gradient(45deg, #F4F4F5 0 8px, #E4E4E7 8px 16px)',
                        }}
                      />
                    )}
                    <div className="px-4 pb-4 pt-3">
                      <div className="mb-1 font-mono text-[11px] text-coral">{dateWithYear(e.visited_date)}</div>
                      <div className="text-2xl font-extrabold leading-[1.1]">{e.place.town}</div>
                      <div className="mb-2 mt-1 text-[11px] uppercase tracking-[.1em] text-ink/60">
                        {e.place.country}
                        {e.visitOrdinal > 1 && ` · ${ordinal(e.visitOrdinal)} visit`}
                      </div>
                      {e.notes && <p className="text-[14px] leading-[1.5] text-pretty">{e.notes}</p>}
                      <div className="mt-3 flex gap-1.5">
                        {e.photos.length > 1 && (
                          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center bg-amber text-[11px] font-extrabold text-ink">
                            +{e.photos.length - 1}
                          </div>
                        )}
                        <button
                          onClick={() => onSelectVisit(e.place.id, e.visitId)}
                          className="flex h-11 flex-1 items-center bg-coral px-3.5 text-left text-[13px] font-extrabold text-white"
                        >
                          Show on map
                        </button>
                      </div>
                    </div>
                  </div>
                )
              }
              return (
                <button
                  key={e.visitId}
                  onClick={() => onSelectVisit(e.place.id, e.visitId)}
                  className="flex w-full gap-3 border-b border-ink/[.15] px-4 py-3.5 text-left"
                >
                  {e.photos[0] ? (
                    <PhotoThumb storagePath={e.photos[0].storage_path} className="h-[84px] w-[84px] flex-shrink-0 object-cover" />
                  ) : (
                    <div
                      className="h-[84px] w-[84px] flex-shrink-0"
                      style={{
                        background: 'repeating-linear-gradient(45deg, #F4F4F5 0 8px, #E4E4E7 8px 16px)',
                      }}
                    />
                  )}
                  <div className="min-w-0">
                    <div className="mb-1 font-mono text-[11px] text-ink/60">{dateWithYear(e.visited_date)}</div>
                    <div className="text-[19px] font-extrabold leading-[1.1]">{e.place.town}</div>
                    <div className="mb-1.5 mt-0.5 text-[10px] uppercase tracking-[.1em] text-ink/60">
                      {e.place.country}
                    </div>
                    {e.notes && (
                      <p className="line-clamp-2 text-[13px] leading-[1.45]">{e.notes}</p>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
