import type { PlaceWithVisits } from '../types'
import { PHOTOS_BUCKET } from './supabase'
import { supabase } from './supabase'

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

export async function exportVisitsToCsv(places: PlaceWithVisits[]) {
  const headers = [
    'town',
    'country',
    'visited_date',
    'end_date',
    'notes',
    'photo_count',
    'photo_urls',
    'latitude',
    'longitude',
  ]

  const rows: string[][] = []
  for (const place of places) {
    for (const v of place.visits) {
      const photoUrls = await Promise.all(
        v.photos.map(async (p) => {
          const { data } = await supabase.storage.from(PHOTOS_BUCKET).createSignedUrl(p.storage_path, 3600)
          return data?.signedUrl ?? ''
        })
      )
      rows.push([
        place.town,
        place.country,
        v.visited_date,
        v.end_date ?? '',
        v.notes ?? '',
        String(v.photos.length),
        photoUrls.join(' | '),
        String(place.latitude),
        String(place.longitude),
      ])
    }
  }

  const csv = [headers, ...rows].map((r) => r.map(csvEscape).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `travel-map-export-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
