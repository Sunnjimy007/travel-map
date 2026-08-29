import { useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import Supercluster from 'supercluster'
import type { PlaceWithVisits } from '../types'

const DARK_STYLE = 'https://tiles.openfreemap.org/styles/dark'

// Esri World Imagery + a transparent labels/roads overlay — free, no API key.
const SATELLITE_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    esriSatellite: {
      type: 'raster',
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      attribution: 'Esri, Maxar, Earthstar Geographics',
    },
    esriLabels: {
      type: 'raster',
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
    },
  },
  layers: [
    { id: 'esri-satellite', type: 'raster', source: 'esriSatellite' },
    { id: 'esri-labels', type: 'raster', source: 'esriLabels' },
  ],
}

type BaseStyle = 'dark' | 'satellite'

function styleFor(s: BaseStyle): string | maplibregl.StyleSpecification {
  return s === 'dark' ? DARK_STYLE : SATELLITE_STYLE
}

const SEA = '#182233'
const LAND = '#2b3a4f'
const LANDLINE = '#3c4d66'
const CORAL = '#E07A5F'
const GROUND = '#FAF9F6'

// Layers to keep from the OpenFreeMap "dark" style; everything else (roads,
// buildings, landuse texture, all text) is hidden so the geography reads as
// plain background and the pins are the only content, per the design spec.
const KEEP_LAYERS = new Set([
  'background',
  'water',
  'boundary_state',
  'boundary_country_z0-4',
  'boundary_country_z5-',
])

function applyPalette(map: maplibregl.Map) {
  map.setPaintProperty('background', 'background-color', LAND)
  map.setPaintProperty('water', 'fill-color', SEA)
  map.setPaintProperty('boundary_state', 'line-color', LANDLINE)
  map.setPaintProperty('boundary_state', 'line-opacity', 0.6)
  map.setPaintProperty('boundary_country_z0-4', 'line-color', LANDLINE)
  map.setPaintProperty('boundary_country_z5-', 'line-color', LANDLINE)
  for (const layer of map.getStyle()?.layers ?? []) {
    if (!KEEP_LAYERS.has(layer.id)) {
      map.setLayoutProperty(layer.id, 'visibility', 'none')
    }
  }
}

const FLAT_PROJECTION_ZOOM = 5

// Roughly matches the old GL circle-radius interpolation (2→14, 7→21, 30→30)
// so cluster bubbles are about the same size as before.
function clusterRadius(count: number): number {
  if (count <= 2) return 14
  if (count <= 7) return 14 + ((count - 2) / 5) * 7
  if (count >= 30) return 30
  return 21 + ((count - 7) / 23) * 9
}

interface PlaceProps {
  placeId: string
}
interface ClusterProps extends Supercluster.ClusterProperties {}

type MarkerEntry = { marker: maplibregl.Marker; el: HTMLDivElement }

interface MapViewProps {
  places: PlaceWithVisits[]
  selectedPlaceId: string | null
  onSelectPlace: (placeId: string) => void
  pickMode: boolean
  onPickLocation: (lat: number, lng: number) => void
  flyToTarget: { lat: number; lng: number } | null
}

export function MapView({
  places,
  selectedPlaceId,
  onSelectPlace,
  pickMode,
  onPickLocation,
  flyToTarget,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const loadedRef = useRef(false)
  const placesRef = useRef(places)
  const selectedPlaceIdRef = useRef(selectedPlaceId)
  const onSelectRef = useRef(onSelectPlace)
  const onPickRef = useRef(onPickLocation)
  const pickModeRef = useRef(pickMode)
  const markersRef = useRef(new Map<string, MarkerEntry>())
  // Clustering computed entirely client-side against the in-memory places
  // list — deliberately independent of MapLibre's own tile/source loading
  // pipeline. querySourceFeatures() (the tile-based approach this replaced)
  // only returns features for tiles MapLibre has actually loaded, which
  // silently broke after switching base map styles.
  const clusterIndexRef = useRef<Supercluster<PlaceProps, ClusterProps> | null>(null)
  const [projection, setProjectionState] = useState<'globe' | 'flat'>('globe')
  const [baseStyle, setBaseStyle] = useState<BaseStyle>('satellite')

  placesRef.current = places
  selectedPlaceIdRef.current = selectedPlaceId
  onSelectRef.current = onSelectPlace
  onPickRef.current = onPickLocation
  pickModeRef.current = pickMode

  const counts = {
    visits: places.reduce((sum, p) => sum + p.visits.length, 0),
    towns: places.length,
    countries: new Set(places.map((p) => p.country.trim().toLowerCase())).size,
  }

  function rebuildClusterIndex() {
    const index = new Supercluster<PlaceProps, ClusterProps>({ radius: 50, maxZoom: 12 })
    index.load(
      placesRef.current.map((p) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [p.longitude, p.latitude] },
        properties: { placeId: p.id },
      }))
    )
    clusterIndexRef.current = index
  }

  function renderMarkerContent(el: HTMLDivElement, place: PlaceWithVisits, selected: boolean) {
    el.innerHTML = ''
    el.style.position = 'relative'
    el.style.display = 'inline-block'
    el.style.cursor = 'pointer'

    const square = document.createElement('div')
    const size = selected ? 15 : 11
    square.style.width = `${size}px`
    square.style.height = `${size}px`
    square.style.background = CORAL
    square.style.opacity = selected ? '1' : '0.62'
    square.style.transition = 'width 120ms ease-out, height 120ms ease-out'
    if (selected) {
      square.style.boxShadow = `0 0 0 6px ${CORAL}59`
    }
    el.appendChild(square)

    el.onmouseenter = () => {
      if (!selected) {
        square.style.width = '13px'
        square.style.height = '13px'
      }
    }
    el.onmouseleave = () => {
      if (!selected) {
        square.style.width = '11px'
        square.style.height = '11px'
      }
    }

    if (selected) {
      const label = document.createElement('div')
      label.textContent = `${place.town} · ${place.visits.length} visit${place.visits.length !== 1 ? 's' : ''}`
      label.style.position = 'absolute'
      label.style.top = '100%'
      label.style.left = '50%'
      label.style.transform = 'translateX(-50%)'
      label.style.marginTop = '10px'
      label.style.whiteSpace = 'nowrap'
      label.style.background = GROUND
      label.style.color = '#1E293B'
      label.style.font = '800 11px Archivo, sans-serif'
      label.style.padding = '4px 7px'
      el.appendChild(label)
    }
  }

  function renderClusterContent(el: HTMLDivElement, count: number) {
    el.innerHTML = ''
    el.style.position = 'relative'
    el.style.display = 'flex'
    el.style.alignItems = 'center'
    el.style.justifyContent = 'center'
    el.style.cursor = 'pointer'

    const r = clusterRadius(count)
    const halo = document.createElement('div')
    halo.style.position = 'absolute'
    halo.style.width = `${(r + 7) * 2}px`
    halo.style.height = `${(r + 7) * 2}px`
    halo.style.borderRadius = '50%'
    halo.style.background = CORAL
    halo.style.opacity = '0.18'
    el.appendChild(halo)

    const core = document.createElement('div')
    core.style.position = 'relative'
    core.style.width = `${r * 2}px`
    core.style.height = `${r * 2}px`
    core.style.borderRadius = '50%'
    core.style.background = CORAL
    core.style.display = 'flex'
    core.style.alignItems = 'center'
    core.style.justifyContent = 'center'
    core.style.color = '#fff'
    core.style.font = `800 ${count > 99 ? 11 : 13}px Archivo, sans-serif`
    core.textContent = String(count)
    el.appendChild(core)
  }

  function syncMarkers() {
    const map = mapRef.current
    const index = clusterIndexRef.current
    if (!map || !loadedRef.current || !index) return

    const bounds = map.getBounds()
    const bbox: [number, number, number, number] = [
      bounds.getWest(),
      bounds.getSouth(),
      bounds.getEast(),
      bounds.getNorth(),
    ]
    const zoom = Math.round(map.getZoom())
    const clusters = index.getClusters(bbox, zoom)

    const seen = new Set<string>()
    const byId = new Map(placesRef.current.map((p) => [p.id, p]))

    for (const feature of clusters) {
      const [lng, lat] = feature.geometry.coordinates

      if ('cluster' in feature.properties && feature.properties.cluster) {
        const clusterId = feature.properties.cluster_id
        const key = `cluster-${clusterId}`
        const count = feature.properties.point_count
        seen.add(key)
        const existing = markersRef.current.get(key)
        if (existing) {
          existing.marker.setLngLat([lng, lat])
        } else {
          const el = document.createElement('div')
          renderClusterContent(el, count)
          el.addEventListener('click', (e) => {
            e.stopPropagation()
            const expansionZoom = Math.min(index.getClusterExpansionZoom(clusterId), 20)
            map.easeTo({ center: [lng, lat], zoom: expansionZoom })
          })
          const marker = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([lng, lat]).addTo(map)
          markersRef.current.set(key, { marker, el })
        }
      } else {
        const placeId = (feature.properties as PlaceProps).placeId
        const place = byId.get(placeId)
        if (!place) continue
        seen.add(placeId)
        const selected = placeId === selectedPlaceIdRef.current
        const existing = markersRef.current.get(placeId)
        if (existing) {
          existing.marker.setLngLat([lng, lat])
          renderMarkerContent(existing.el, place, selected)
        } else {
          const el = document.createElement('div')
          renderMarkerContent(el, place, selected)
          el.addEventListener('click', (e) => {
            e.stopPropagation()
            onSelectRef.current(placeId)
          })
          const marker = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([lng, lat]).addTo(map)
          markersRef.current.set(placeId, { marker, el })
        }
      }
    }

    for (const [key, entry] of markersRef.current) {
      if (!seen.has(key)) {
        entry.marker.remove()
        markersRef.current.delete(key)
      }
    }
  }

  useEffect(() => {
    if (!containerRef.current) return
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: styleFor(baseStyle),
      center: [10, 20],
      zoom: 1.5,
      attributionControl: false,
    })
    mapRef.current = map

    // Default the view to the visitor's own location, unless we're mounting
    // because a specific pin was requested (e.g. "Show on map" from the
    // Timeline) — that flyTo should win instead of getting overridden here.
    if (!flyToTarget && 'geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          map.jumpTo({ center: [pos.coords.longitude, pos.coords.latitude], zoom: 4 })
        },
        () => {
          // Permission denied or unavailable — keep the default world view.
        },
        { timeout: 8000, maximumAge: 5 * 60 * 1000 }
      )
    }

    map.on('click', (e: maplibregl.MapMouseEvent) => {
      // Marker elements sit in their own DOM layer above the canvas and stop
      // propagation on click, so a map click that reaches here never hit a
      // pin or cluster — no need to hit-test for them separately.
      if (!pickModeRef.current) return
      onPickRef.current(e.lngLat.lat, e.lngLat.lng)
    })

    map.on('zoom', () => {
      setProjectionState(map.getZoom() >= FLAT_PROJECTION_ZOOM ? 'flat' : 'globe')
    })

    map.on('load', () => {
      if (baseStyle === 'dark') applyPalette(map)
      map.setProjection({ type: 'globe' })
      loadedRef.current = true
      map.resize()
      rebuildClusterIndex()
      syncMarkers()
    })

    map.on('zoomend', syncMarkers)
    map.on('moveend', syncMarkers)

    const resizeObserver = new ResizeObserver(() => map.resize())
    resizeObserver.observe(containerRef.current)

    // MapLibre's globe projection clips landmass/water to the sphere correctly,
    // but label text (and any raster tile with text baked in, like satellite)
    // ignores that horizon and bleeds past the circle's edge. Mask the view to
    // a circle while zoomed out enough that the globe is still a full sphere on
    // screen; past that MapLibre interpolates to flat mercator, where a
    // circular mask would wrongly clip real content.
    const GLOBE_MASK_MAX_ZOOM = 4
    function updateGlobeMask() {
      const el = containerRef.current
      if (!el) return
      // A strict "<" here left the mask on at exactly zoom 4 (float rounding
      // regularly lands a hair under 4), which cropped an already-large globe
      // down to a small circle. Back off the threshold so the mask reliably
      // clears once we're actually at the default zoom.
      if (map.getZoom() < GLOBE_MASK_MAX_ZOOM - 0.05) {
        const mask = 'radial-gradient(circle 66vmin at 50% 50%, black 96%, transparent 100%)'
        el.style.maskImage = mask
        el.style.webkitMaskImage = mask
      } else {
        el.style.maskImage = ''
        el.style.webkitMaskImage = ''
      }
    }
    map.on('zoom', updateGlobeMask)
    updateGlobeMask()

    return () => {
      resizeObserver.disconnect()
      for (const { marker } of markersRef.current.values()) marker.remove()
      markersRef.current.clear()
      map.remove()
      mapRef.current = null
      loadedRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    rebuildClusterIndex()
    syncMarkers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [places])

  useEffect(() => {
    syncMarkers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPlaceId])

  useEffect(() => {
    const map = mapRef.current
    if (map) map.getCanvas().style.cursor = pickMode ? 'crosshair' : ''
  }, [pickMode])

  useEffect(() => {
    if (flyToTarget && mapRef.current) {
      mapRef.current.flyTo({ center: [flyToTarget.lng, flyToTarget.lat], zoom: 10, duration: 1200 })
    }
  }, [flyToTarget])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !loadedRef.current) return
    // diff:false forces a full style reload instead of MapLibre's default
    // diffing, which behaves unreliably when swapping between a vector style
    // and a structurally unrelated raster style (dropped layers/projection).
    map.setStyle(styleFor(baseStyle), { diff: false })
    map.once('style.load', () => {
      if (baseStyle === 'dark') applyPalette(map)
      map.setProjection({ type: projection === 'globe' ? 'globe' : 'mercator' })
      // Pins are plain HTML markers, not map layers, so they're unaffected
      // by the style swap itself — just re-check them for the new viewport.
      syncMarkers()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseStyle])

  function setProjection(p: 'globe' | 'flat') {
    setProjectionState(p)
    mapRef.current?.setProjection({ type: p === 'globe' ? 'globe' : 'mercator' })
    if (p === 'flat' && (mapRef.current?.getZoom() ?? 0) < FLAT_PROJECTION_ZOOM) {
      mapRef.current?.easeTo({ zoom: FLAT_PROJECTION_ZOOM })
    }
    if (p === 'globe' && (mapRef.current?.getZoom() ?? 0) >= FLAT_PROJECTION_ZOOM) {
      mapRef.current?.easeTo({ zoom: FLAT_PROJECTION_ZOOM - 1 })
    }
  }

  const chromeBox = 'border border-white/20 bg-[#182233]/80'
  const backgroundColor = baseStyle === 'dark' ? SEA : '#cfe8f3'

  return (
    <>
      {/* Sits behind the map container and must stay unmasked — the globe
          vignette mask below is applied to containerRef (which MapLibre also
          owns), so putting the background color on that same element would
          make it vanish too, everywhere the mask makes the map transparent. */}
      <div style={{ position: 'absolute', inset: 0, backgroundColor }} />
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />

      {/* Projection toggle + base style toggle */}
      <div className="pointer-events-none absolute left-3 top-3 flex flex-col gap-2 sm:left-5 sm:top-5">
        <div className={`pointer-events-auto flex ${chromeBox}`}>
          {(['globe', 'flat'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setProjection(p)}
              className={`px-[13px] py-[7px] text-[11px] tracking-[.06em] ${
                projection === p ? 'bg-ground font-extrabold text-ink' : 'text-white/60'
              }`}
            >
              {p === 'globe' ? 'Globe' : 'Flat'}
            </button>
          ))}
        </div>
        <div className={`pointer-events-auto flex ${chromeBox}`}>
          {(['dark', 'satellite'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setBaseStyle(s)}
              className={`px-[13px] py-[7px] text-[11px] tracking-[.06em] capitalize ${
                baseStyle === s ? 'bg-ground font-extrabold text-ink' : 'text-white/60'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Zoom controls */}
      <div className={`pointer-events-auto absolute right-3 top-3 flex flex-col sm:right-5 sm:top-5 ${chromeBox}`}>
        <button
          onClick={() => mapRef.current?.zoomIn()}
          className="flex h-[34px] w-[34px] items-center justify-center text-[15px] font-extrabold text-white/90"
        >
          +
        </button>
        <button
          onClick={() => mapRef.current?.zoomOut()}
          className="flex h-[34px] w-[34px] items-center justify-center border-t border-white/20 text-[15px] font-extrabold text-white/90"
        >
          −
        </button>
      </div>

      {/* Legend */}
      <div className={`pointer-events-none absolute bottom-3 left-3 hidden sm:flex sm:bottom-5 sm:left-5 ${chromeBox}`}>
        {[
          ['VISITS', counts.visits],
          ['TOWNS', counts.towns],
          ['COUNTRIES', counts.countries],
        ].map(([label, value], i) => (
          <div key={label} className={`px-3.5 py-2 ${i > 0 ? 'border-l border-white/20' : ''}`}>
            <div className="font-mono text-[10px] tracking-[.08em] text-white/90">{label}</div>
            <div className="mt-0.5 text-[17px] font-extrabold text-white">{value}</div>
          </div>
        ))}
      </div>
    </>
  )
}
