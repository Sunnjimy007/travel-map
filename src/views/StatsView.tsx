import { useMemo } from 'react'
import { format } from 'date-fns'
import { continentForCountry } from '../lib/continents'
import type { PlaceWithVisits } from '../types'

interface StatsViewProps {
  places: PlaceWithVisits[]
}

export function StatsView({ places }: StatsViewProps) {
  const stats = useMemo(() => {
    const allVisits = places.flatMap((p) => p.visits.map((v) => ({ ...v, place: p })))
    const towns = new Set(places.map((p) => p.id)).size
    const continentSet = new Set(places.map((p) => continentForCountry(p.country)))
    const sortedVisits = [...allVisits].sort((a, b) => (a.visited_date < b.visited_date ? -1 : 1))
    const first = sortedVisits[0] ?? null
    const last = sortedVisits[sortedVisits.length - 1] ?? null

    const perYear = new Map<string, number>()
    for (const v of allVisits) {
      const y = v.visited_date.slice(0, 4)
      perYear.set(y, (perYear.get(y) ?? 0) + 1)
    }
    let years: string[] = []
    if (perYear.size > 0) {
      const sortedYears = [...perYear.keys()].sort()
      const startY = Number(sortedYears[0])
      const endY = Number(sortedYears[sortedYears.length - 1])
      for (let y = startY; y <= endY; y++) years.push(String(y))
    }
    const maxYearCount = Math.max(1, ...years.map((y) => perYear.get(y) ?? 0))
    const mostRecentYear = years[years.length - 1] ?? null

    let mostReturned: PlaceWithVisits | null = null
    for (const p of places) {
      if (!mostReturned || p.visits.length > mostReturned.visits.length) mostReturned = p
    }

    const countryVisitCounts = new Map<string, number>()
    for (const p of places) {
      countryVisitCounts.set(p.country, (countryVisitCounts.get(p.country) ?? 0) + p.visits.length)
    }
    const countryStats = [...countryVisitCounts.entries()].sort((a, b) => b[1] - a[1])
    const maxCountryCount = Math.max(1, ...countryStats.map(([, c]) => c))

    return {
      totalVisits: allVisits.length,
      towns,
      countries: countryStats.length,
      continents: [...continentSet].sort(),
      first,
      last,
      years,
      perYear,
      maxYearCount,
      mostRecentYear,
      mostReturned: mostReturned && mostReturned.visits.length > 1 ? mostReturned : null,
      countryStats,
      maxCountryCount,
    }
  }, [places])

  const tiles: [string, number][] = [
    ['Visits', stats.totalVisits],
    ['Towns', stats.towns],
    ['Countries', stats.countries],
  ]

  if (places.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-ink/50">
        No visits logged yet — stats will show up once you add one.
      </div>
    )
  }

  const visibleCountries = stats.countryStats.slice(0, 6)
  const remainingCountries = stats.countryStats.length - visibleCountries.length

  return (
    <div className="h-full overflow-y-auto">
      <div className="grid grid-cols-2 border-b-2 border-ink md:grid-cols-4">
        {tiles.map(([label, value], i) => (
          <div
            key={label}
            className={`px-5 py-6 md:px-8 md:py-7 ${i < 2 ? 'border-b md:border-b-0 md:border-r border-ink/20' : ''} ${
              i === 2 ? 'border-l md:border-l-0 md:border-r' : ''
            }`}
          >
            <div className="mb-2.5 font-mono text-[11px] font-extrabold uppercase tracking-[.12em] text-ink/60">
              {label}
            </div>
            <div className="text-5xl font-extrabold leading-[.85] tracking-[-.03em] md:text-[72px]">{value}</div>
          </div>
        ))}
        <div className="border-l bg-sage px-5 py-6 text-white md:border-l-0 md:px-8 md:py-7">
          <div className="mb-2.5 font-mono text-[11px] font-extrabold uppercase tracking-[.12em] text-white/80">
            Continents
          </div>
          <div className="text-5xl font-extrabold leading-[.85] tracking-[-.03em] md:text-[72px]">
            {stats.continents.length}
          </div>
          {stats.continents.length > 0 && (
            <div className="mt-3 font-mono text-[10px] tracking-[.08em] text-white/85 md:text-[11px]">
              {stats.continents.join(' · ').toUpperCase()}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 border-b-2 border-ink md:grid-cols-[1fr_380px]">
        <div className="border-b border-ink/20 px-5 py-7 md:border-b-0 md:border-r md:px-8 md:py-[34px]">
          <div className="mb-5 font-mono text-[11px] font-extrabold uppercase tracking-[.12em] text-ink/60">
            Visits per year
          </div>
          {stats.years.length > 0 ? (
            <>
              <div className="flex h-[190px] items-end gap-2 border-b-2 border-ink md:gap-4">
                {stats.years.map((y) => {
                  const count = stats.perYear.get(y) ?? 0
                  const height = count === 0 ? 0 : Math.max(4, (count / stats.maxYearCount) * 100)
                  return (
                    <div key={y} className="flex h-full flex-1 flex-col justify-end">
                      <div
                        style={{ height: `${height}%` }}
                        className={y === stats.mostRecentYear ? 'bg-coral' : count === 0 ? 'bg-ink/35' : 'bg-ink'}
                      />
                    </div>
                  )
                })}
              </div>
              <div className="mt-2 flex gap-2 md:gap-4">
                {stats.years.map((y) => (
                  <span
                    key={y}
                    className={`flex-1 font-mono text-[10px] md:text-[11px] ${
                      y === stats.mostRecentYear ? 'font-extrabold text-coral' : 'text-ink/60'
                    }`}
                  >
                    {y}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <p className="text-ink/50">No dated visits yet.</p>
          )}
        </div>

        <div className="flex flex-col gap-5 px-5 py-7 md:gap-[22px] md:px-8 md:py-[34px]">
          {stats.first && (
            <div>
              <div className="mb-2 font-mono text-[11px] font-extrabold uppercase tracking-[.12em] text-ink/60">
                First visit
              </div>
              <div className="text-[22px] font-extrabold">{stats.first.place.town}</div>
              <div className="font-mono text-[12px] text-ink/60">
                {format(new Date(stats.first.visited_date), 'd MMM yyyy').toUpperCase()}
              </div>
            </div>
          )}
          {stats.first && stats.last && <div className="h-0.5 bg-ink/40" />}
          {stats.last && (
            <div>
              <div className="mb-2 font-mono text-[11px] font-extrabold uppercase tracking-[.12em] text-ink/60">
                Most recent
              </div>
              <div className="text-[22px] font-extrabold">{stats.last.place.town}</div>
              <div className="font-mono text-[12px] text-coral">
                {format(new Date(stats.last.visited_date), 'd MMM yyyy').toUpperCase()}
              </div>
            </div>
          )}
          {stats.mostReturned && (
            <>
              <div className="h-0.5 bg-ink/40" />
              <div>
                <div className="mb-2 font-mono text-[11px] font-extrabold uppercase tracking-[.12em] text-ink/60">
                  Most returned to
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[22px] font-extrabold">{stats.mostReturned.town}</span>
                  <span className="bg-amber px-[7px] py-[3px] text-[11px] font-extrabold text-ink">
                    {stats.mostReturned.visits.length} VISITS
                  </span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {visibleCountries.length > 0 && (
        <div className="px-5 py-7 md:px-8 md:py-[34px]">
          <div className="mb-5 font-mono text-[11px] font-extrabold uppercase tracking-[.12em] text-ink/60">
            Visits by country
          </div>
          <div className="grid grid-cols-1 gap-x-12 md:grid-cols-2">
            {visibleCountries.map(([country, count]) => (
              <div key={country} className="flex items-center gap-3.5 border-b border-ink/[.15] py-2.5">
                <span className="w-[100px] flex-shrink-0 truncate text-[14px] font-extrabold">{country}</span>
                <span className="h-3 flex-1 bg-ink/[.07]">
                  <span
                    className="block h-3 bg-sage"
                    style={{ width: `${(count / stats.maxCountryCount) * 100}%` }}
                  />
                </span>
                <span className="w-[22px] text-right font-mono text-[12px]">{count}</span>
              </div>
            ))}
          </div>
          {remainingCountries > 0 && (
            <div className="mt-3.5 font-mono text-[11px] tracking-[.06em] text-ink/60">
              + {remainingCountries} MORE COUNTR{remainingCountries === 1 ? 'Y' : 'IES'}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
