// Geocoding via Photon (Komoot's OSM-based geocoder) — free, no key, and
// (unlike Nominatim) sends CORS headers so it actually works from a browser.
// Click-to-place on the map is the no-dependency fallback if a place can't be found.
export interface GeocodeResult {
  town: string
  country: string
  latitude: number
  longitude: number
}

const PHOTON_BASE = 'https://photon.komoot.io/api'
const PHOTON_REVERSE = 'https://photon.komoot.io/reverse'

interface PhotonFeature {
  properties: {
    name?: string
    city?: string
    town?: string
    village?: string
    locality?: string
    country?: string
  }
  geometry: { coordinates: [number, number] }
}

function townFromProperties(props: PhotonFeature['properties']): string {
  return props.name ?? props.city ?? props.town ?? props.village ?? props.locality ?? ''
}

export async function searchTown(query: string): Promise<GeocodeResult[]> {
  if (!query.trim()) return []
  const url = `${PHOTON_BASE}/?q=${encodeURIComponent(query)}&limit=5`
  const res = await fetch(url)
  if (!res.ok) throw new Error('Geocoding search failed')
  const data = await res.json()
  return (data.features as PhotonFeature[]).map((f) => ({
    town: townFromProperties(f.properties),
    country: f.properties.country ?? '',
    longitude: f.geometry.coordinates[0],
    latitude: f.geometry.coordinates[1],
  }))
}

export async function reverseGeocode(lat: number, lng: number): Promise<GeocodeResult> {
  const url = `${PHOTON_REVERSE}?lon=${lng}&lat=${lat}`
  const res = await fetch(url)
  if (!res.ok) throw new Error('Reverse geocoding failed')
  const data = await res.json()
  const feature = data.features?.[0] as PhotonFeature | undefined
  return {
    town: feature ? townFromProperties(feature.properties) : '',
    country: feature?.properties.country ?? '',
    latitude: lat,
    longitude: lng,
  }
}
