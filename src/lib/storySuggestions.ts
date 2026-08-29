import type { PlaceWithVisits } from '../types'

export interface SuggestedCluster {
  key: string
  visitIds: string[]
  townNames: string[]
  startDate: string
  endDate: string
}

const GAP_DAYS = 3

// Clusters visits by date proximity — a gap of GAP_DAYS or more breaks a
// cluster (PRD §11 "Suggestion logic"). Only clusters of 2+ visits are
// offered, and any visit already used by a story is excluded entirely.
export function suggestClusters(
  places: PlaceWithVisits[],
  usedVisitIds: Set<string>
): SuggestedCluster[] {
  const flat = places.flatMap((p) =>
    p.visits
      .filter((v) => !usedVisitIds.has(v.id))
      .map((v) => ({ visitId: v.id, town: p.town, date: v.visited_date }))
  )
  flat.sort((a, b) => (a.date < b.date ? -1 : 1))

  const clusters: SuggestedCluster[] = []
  let current: typeof flat = []

  function flush() {
    if (current.length >= 2) {
      clusters.push({
        key: current.map((v) => v.visitId).join('-'),
        visitIds: current.map((v) => v.visitId),
        townNames: [...new Set(current.map((v) => v.town))],
        startDate: current[0].date,
        endDate: current[current.length - 1].date,
      })
    }
    current = []
  }

  for (const v of flat) {
    if (current.length === 0) {
      current.push(v)
      continue
    }
    const prev = current[current.length - 1]
    const gapDays = (new Date(v.date).getTime() - new Date(prev.date).getTime()) / 86_400_000
    if (gapDays >= GAP_DAYS) {
      flush()
    }
    current.push(v)
  }
  flush()

  return clusters
}
