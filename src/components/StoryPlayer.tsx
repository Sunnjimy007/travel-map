import { useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { format } from 'date-fns'
import type { StoryWithStops, StoryStopWithVisit } from '../types'
import { PhotoThumb } from './PhotoThumb'

const DARK_STYLE = 'https://tiles.openfreemap.org/styles/dark'
const CORAL = '#F26B4E'

const KEEP_LAYERS = new Set([
  'background',
  'water',
  'boundary_state',
  'boundary_country_z0-4',
  'boundary_country_z5-',
])

function applyPalette(map: maplibregl.Map) {
  map.setPaintProperty('background', 'background-color', '#223338')
  map.setPaintProperty('water', 'fill-color', '#101A1E')
  map.setPaintProperty('boundary_state', 'line-color', '#2C4149')
  map.setPaintProperty('boundary_state', 'line-opacity', 0.6)
  map.setPaintProperty('boundary_country_z0-4', 'line-color', '#2C4149')
  map.setPaintProperty('boundary_country_z5-', 'line-color', '#2C4149')
  for (const layer of map.getStyle()?.layers ?? []) {
    if (!KEEP_LAYERS.has(layer.id)) {
      map.setLayoutProperty(layer.id, 'visibility', 'none')
    }
  }
}

function greatCircle(a: [number, number], b: [number, number], steps = 24): [number, number][] {
  const toRad = (d: number) => (d * Math.PI) / 180
  const toDeg = (r: number) => (r * 180) / Math.PI
  const [lon1, lat1] = [toRad(a[0]), toRad(a[1])]
  const [lon2, lat2] = [toRad(b[0]), toRad(b[1])]
  const d = 2 * Math.asin(
    Math.sqrt(Math.sin((lat2 - lat1) / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2)
  )
  if (d === 0) return [a, b]
  const points: [number, number][] = []
  for (let i = 0; i <= steps; i++) {
    const f = i / steps
    const A = Math.sin((1 - f) * d) / Math.sin(d)
    const B = Math.sin(f * d) / Math.sin(d)
    const x = A * Math.cos(lat1) * Math.cos(lon1) + B * Math.cos(lat2) * Math.cos(lon2)
    const y = A * Math.cos(lat1) * Math.sin(lon1) + B * Math.cos(lat2) * Math.sin(lon2)
    const z = A * Math.sin(lat1) + B * Math.sin(lat2)
    const lat = Math.atan2(z, Math.sqrt(x * x + y * y))
    const lon = Math.atan2(y, x)
    points.push([toDeg(lon), toDeg(lat)])
  }
  return points
}

function coordsOf(stops: StoryStopWithVisit[]): [number, number][] {
  return stops.map((s) => [s.visit.place.longitude, s.visit.place.latitude])
}

function segmentLine(coords: [number, number][], from: number, to: number): GeoJSON.Feature<GeoJSON.LineString> {
  const line = from >= 0 && to < coords.length && from !== to ? greatCircle(coords[from], coords[to]) : []
  return { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: line } }
}

function fullRouteLine(coords: [number, number][]): GeoJSON.Feature<GeoJSON.LineString> {
  const points: [number, number][] = []
  for (let i = 0; i < coords.length - 1; i++) {
    const seg = greatCircle(coords[i], coords[i + 1])
    points.push(...(i === 0 ? seg : seg.slice(1)))
  }
  return { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: points } }
}

const FLY_MS = 1600
const HOLD_MS = 5000

function answeredPhotos(stop: StoryStopWithVisit) {
  const answered = stop.storyPhotos.filter((sp) => sp.answer)
  return answered.length > 0 ? answered : stop.storyPhotos.slice(0, 1)
}

function totalDuration(stop: StoryStopWithVisit, reducedMotion: boolean): number {
  const count = Math.max(1, answeredPhotos(stop).length)
  return (reducedMotion ? 0 : FLY_MS) + HOLD_MS * count
}

interface StoryPlayerProps {
  story: StoryWithStops
  onClose: () => void
  onEdit?: () => void
  onShare?: () => Promise<string>
  readOnly?: boolean
}

export function StoryPlayer({ story, onClose, onEdit, onShare, readOnly = false }: StoryPlayerProps) {
  const stops = story.stops
  const coords = coordsOf(stops)
  const containerRef = useRef<HTMLDivElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const markersRef = useRef<maplibregl.Marker[]>([])
  const loadedRef = useRef(false)
  const reducedMotion = useRef(
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ).current

  const [currentIndex, setCurrentIndex] = useState(0)
  const currentIndexRef = useRef(0)
  const [isPlaying, setIsPlaying] = useState(true)
  const [hasEnded, setHasEnded] = useState(false)
  const [progress, setProgress] = useState(0)
  const [cardEntering, setCardEntering] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [shareUrl, setShareUrl] = useState<string | null>(
    story.share_token ? `${window.location.origin}/s/${story.share_token}` : null
  )
  const [shareCopied, setShareCopied] = useState(false)

  const stopStartRef = useRef(Date.now())
  const remainingRef = useRef(0)
  const timeoutRef = useRef<number | null>(null)
  const intervalRef = useRef<number | null>(null)

  const stop = stops[currentIndex]

  function clearTimers() {
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current)
    if (intervalRef.current) window.clearInterval(intervalRef.current)
    timeoutRef.current = null
    intervalRef.current = null
  }

  function pinLabel(town: string, color: string): HTMLDivElement {
    const label = document.createElement('div')
    label.textContent = town
    label.style.position = 'absolute'
    label.style.left = '100%'
    label.style.top = '50%'
    label.style.transform = 'translateY(-50%)'
    label.style.marginLeft = '6px'
    label.style.whiteSpace = 'nowrap'
    label.style.font = '700 11px DM Sans, sans-serif'
    label.style.letterSpacing = '.02em'
    label.style.color = color
    label.style.textShadow = '0 1px 3px rgba(0,0,0,.6)'
    return label
  }

  function syncMarkers(activeIndex: number, ended: boolean) {
    const map = mapRef.current
    if (!map || !loadedRef.current) return
    for (const m of markersRef.current) m.remove()
    markersRef.current = []
    stops.forEach((s, i) => {
      const el = document.createElement('div')
      el.style.position = 'relative'
      el.style.display = 'inline-block'
      const dot = document.createElement('div')
      dot.style.borderRadius = '50%'
      if (ended) {
        dot.style.width = dot.style.height = '10px'
        dot.style.background = CORAL
      } else if (i === activeIndex) {
        dot.style.width = dot.style.height = '14px'
        dot.style.background = CORAL
        dot.style.boxShadow = `0 0 0 4px ${CORAL}40`
        const ring = document.createElement('div')
        ring.style.position = 'absolute'
        ring.style.inset = '0'
        ring.style.border = `2px solid ${CORAL}`
        ring.style.borderRadius = '50%'
        ring.style.animation = 'story-pulse-ring 2.2s ease-out infinite'
        el.appendChild(ring)
        el.appendChild(pinLabel(s.visit.place.town, 'rgba(255,255,255,.9)'))
      } else if (i === activeIndex + 1) {
        dot.style.width = dot.style.height = '11px'
        dot.style.background = '#FFFFFF'
        dot.style.boxShadow = `0 0 0 3px ${CORAL}48`
        el.appendChild(pinLabel(s.visit.place.town, 'rgba(255,255,255,.6)'))
      } else if (i < activeIndex) {
        dot.style.width = dot.style.height = '9px'
        dot.style.background = 'rgba(255,255,255,.28)'
      } else {
        dot.style.width = dot.style.height = '9px'
        dot.style.background = 'rgba(255,255,255,.28)'
      }
      el.appendChild(dot)
      const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([s.visit.place.longitude, s.visit.place.latitude])
        .addTo(map)
      markersRef.current.push(marker)
    })
  }

  function syncRoute(activeIndex: number) {
    const map = mapRef.current
    const src = map?.getSource('story-route') as maplibregl.GeoJSONSource | undefined
    if (!src) return
    src.setData(segmentLine(coords, activeIndex, activeIndex + 1))
  }

  function flyToStop(index: number) {
    const map = mapRef.current
    const s = stops[index]
    if (!map || !s) return
    const target = { center: [s.visit.place.longitude, s.visit.place.latitude] as [number, number], zoom: 9 }
    if (reducedMotion) map.jumpTo(target)
    else map.flyTo({ ...target, duration: FLY_MS, essential: true })
  }

  function jumpToStop(index: number) {
    const map = mapRef.current
    const s = stops[index]
    if (!map || !s) return
    map.jumpTo({ center: [s.visit.place.longitude, s.visit.place.latitude], zoom: 9 })
  }

  function fitAll() {
    const map = mapRef.current
    if (!map || stops.length === 0) return
    const bounds = new maplibregl.LngLatBounds()
    for (const s of stops) bounds.extend([s.visit.place.longitude, s.visit.place.latitude])
    map.fitBounds(bounds, { padding: 60, duration: reducedMotion ? 0 : 1400, maxZoom: 8 })
  }

  function startStop(index: number, resuming: boolean) {
    const s = stops[index]
    if (!s) return
    mapRef.current?.resize()
    const total = totalDuration(s, reducedMotion)
    if (!resuming) {
      flyToStop(index)
      setCardEntering(true)
      window.setTimeout(() => setCardEntering(false), 260)
    } else {
      jumpToStop(index)
    }
    syncRoute(index)
    syncMarkers(index, false)
    const remaining = resuming ? remainingRef.current : total
    stopStartRef.current = Date.now() - (total - remaining)
    clearTimers()
    intervalRef.current = window.setInterval(() => {
      const elapsed = Date.now() - stopStartRef.current
      setProgress(total === 0 ? 1 : Math.min(1, elapsed / total))
    }, 100)
    timeoutRef.current = window.setTimeout(() => goNext(), Math.max(0, remaining))
  }

  function goNext() {
    const next = currentIndexRef.current + 1
    if (next >= stops.length) {
      end()
      return
    }
    currentIndexRef.current = next
    setCurrentIndex(next)
    setProgress(0)
    startStop(next, false)
  }

  function jumpToIndex(i: number) {
    const clamped = Math.max(0, Math.min(stops.length - 1, i))
    clearTimers()
    currentIndexRef.current = clamped
    setCurrentIndex(clamped)
    setProgress(0)
    setHasEnded(false)
    if (isPlaying) {
      startStop(clamped, false)
    } else {
      jumpToStop(clamped)
      syncRoute(clamped)
      remainingRef.current = totalDuration(stops[clamped], reducedMotion)
      syncMarkers(clamped, false)
    }
  }

  function pause() {
    if (!isPlaying || hasEnded) return
    const s = stops[currentIndexRef.current]
    if (s) {
      const total = totalDuration(s, reducedMotion)
      const elapsed = Date.now() - stopStartRef.current
      remainingRef.current = Math.max(0, total - elapsed)
    }
    clearTimers()
    mapRef.current?.stop()
    setIsPlaying(false)
  }

  function resume() {
    if (isPlaying) return
    if (hasEnded) {
      watchAgain()
      return
    }
    setIsPlaying(true)
    startStop(currentIndexRef.current, true)
  }

  function end() {
    clearTimers()
    setHasEnded(true)
    setIsPlaying(false)
    setProgress(1)
    syncMarkers(currentIndexRef.current, true)
    const map = mapRef.current
    const src = map?.getSource('story-route') as maplibregl.GeoJSONSource | undefined
    src?.setData(fullRouteLine(coords))
    if (map?.getLayer('story-route-line')) {
      map.setPaintProperty('story-route-line', 'line-dasharray', [1, 0])
      map.setPaintProperty('story-route-line', 'line-opacity', 0.5)
    }
    // The map region grows from a 56% split to full-height once hasEnded
    // flips — that layout change lands after this function returns, so
    // resize (and the bounds fit that depends on the new size) has to
    // happen afterward, not now.
    requestAnimationFrame(() => {
      map?.resize()
      fitAll()
    })
    window.setTimeout(() => {
      map?.resize()
      fitAll()
    }, 350)
  }

  function watchAgain() {
    clearTimers()
    currentIndexRef.current = 0
    setCurrentIndex(0)
    setProgress(0)
    setHasEnded(false)
    setIsPlaying(true)
    const map = mapRef.current
    if (map?.getLayer('story-route-line')) {
      map.setPaintProperty('story-route-line', 'line-dasharray', [2, 2])
      map.setPaintProperty('story-route-line', 'line-opacity', 0.75)
    }
    // Same as end() in reverse — the map region shrinks back to 56% here.
    requestAnimationFrame(() => map?.resize())
    window.setTimeout(() => map?.resize(), 350)
    startStop(0, false)
  }

  async function handleShare() {
    if (sharing || !onShare) return
    setSharing(true)
    try {
      let token = story.share_token
      if (!token) token = await onShare()
      const url = `${window.location.origin}/s/${token}`
      setShareUrl(url)
      if (navigator.share) {
        await navigator.share({ title: story.title, url }).catch(() => {})
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(url)
        setShareCopied(true)
        window.setTimeout(() => setShareCopied(false), 2000)
      }
    } finally {
      setSharing(false)
    }
  }

  function toggleFullscreen() {
    const el = wrapperRef.current
    if (!el) return
    if (!document.fullscreenElement) {
      el.requestFullscreen?.().then(() => setIsFullscreen(true)).catch(() => {})
    } else {
      document.exitFullscreen?.().then(() => setIsFullscreen(false)).catch(() => {})
    }
  }

  useEffect(() => {
    if (!containerRef.current || stops.length === 0) return
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: DARK_STYLE,
      center: [stops[0].visit.place.longitude, stops[0].visit.place.latitude],
      zoom: 3,
      attributionControl: false,
      interactive: false,
    })
    mapRef.current = map

    map.on('error', (e) => {
      // eslint-disable-next-line no-console
      console.error('[StoryPlayer] map error:', e.error?.message ?? e)
    })

    map.on('load', () => {
      // eslint-disable-next-line no-console
      console.log('[StoryPlayer] load fired, stops:', stops.length)
      try {
        map.resize()
        requestAnimationFrame(() => map.resize())
        window.setTimeout(() => map.resize(), 300)
        applyPalette(map)
        map.setProjection({ type: 'globe' })
        loadedRef.current = true
        map.addSource('story-route', { type: 'geojson', data: segmentLine(coords, 0, 1) })
        map.addLayer({
          id: 'story-route-line',
          type: 'line',
          source: 'story-route',
          paint: { 'line-color': CORAL, 'line-width': 2, 'line-dasharray': [2, 2], 'line-opacity': 0.75 },
        })
        syncMarkers(0, false)
        startStop(0, false)
        // eslint-disable-next-line no-console
        console.log('[StoryPlayer] load handler completed, markers:', markersRef.current.length)
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[StoryPlayer] exception in load handler:', err)
      }
    })

    const resizeObserver = new ResizeObserver(() => map.resize())
    resizeObserver.observe(containerRef.current)

    return () => {
      clearTimers()
      resizeObserver.disconnect()
      for (const m of markersRef.current) m.remove()
      markersRef.current = []
      map.remove()
      mapRef.current = null
      loadedRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!stop) return null

  const place = stop.visit.place
  const playable = answeredPhotos(stop)
  const totalMs = totalDuration(stop, reducedMotion)
  const elapsedMs = progress * totalMs
  const photoIdx = Math.min(
    playable.length - 1,
    Math.max(0, Math.floor((elapsedMs - (reducedMotion ? 0 : FLY_MS)) / HOLD_MS))
  )
  const currentStoryPhoto = playable[photoIdx]
  const notePhoto = stop.note_photo_id ? stop.visit.photos.find((p) => p.id === stop.note_photo_id) : null
  const dateLabel = stop.visit.visited_date ? format(new Date(stop.visit.visited_date), 'd MMM') : ''
  const totalPhotos = stops.reduce((sum, s) => sum + s.storyPhotos.length, 0)
  const days =
    story.start_date && story.end_date
      ? Math.max(1, Math.round((+new Date(story.end_date) - +new Date(story.start_date)) / 86400000) + 1)
      : stops.length
  const photoStickers = (stop.stickers ?? []).filter((s) => s.target === 'photo' && s.photoId === currentStoryPhoto?.id)

  return (
    <div ref={wrapperRef} className="fixed inset-0 z-50 flex justify-center overflow-hidden bg-story-map-1 font-story-sans">
      <div className="relative flex w-full max-w-[480px] flex-1 flex-col overflow-hidden">
      {/* Map region — a fixed share of the screen while playing/paused so a
          tall photo card can never cover a pin; expands to fill the whole
          screen once the story ends (map.resize() runs in end()/watchAgain()
          to match). */}
      <div className="relative w-full flex-shrink-0 overflow-hidden" style={{ height: hasEnded ? '100%' : '48%' }}>
        <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />

        {!hasEnded && (
          <>
            {!isPlaying && (
              <div
                className="absolute inset-0"
                style={{
                  background: 'linear-gradient(to bottom, rgba(16,26,30,.55), rgba(16,26,30,.2) 45%, rgba(16,26,30,.85))',
                }}
                onClick={resume}
              />
            )}

            <div className="absolute inset-x-0 top-0 flex items-center gap-3 px-4 pt-[max(14px,env(safe-area-inset-top))]">
              <button onClick={onClose} className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-white/14 text-white">
                ✕
              </button>
              {isPlaying ? (
                <div className="flex flex-1 gap-1">
                  {stops.map((s, i) => (
                    <div key={s.id} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/28">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: i < currentIndex ? '100%' : i === currentIndex ? `${progress * 100}%` : '0%',
                          background: '#FFFFFF',
                        }}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex-1 text-center text-[11px] font-bold uppercase tracking-[.16em] text-white/70">Paused</div>
              )}
              {isPlaying ? (
                <button onClick={pause} className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-white/14 text-white">
                  ❙❙
                </button>
              ) : (
                <button onClick={toggleFullscreen} className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-white/14 text-white">
                  {isFullscreen ? '⤡' : '⤢'}
                </button>
              )}
            </div>

            {isPlaying && (
              <div className="absolute left-5 top-[106px] text-white">
                <div className="text-[11px] uppercase tracking-[.16em] text-white/60">
                  Stop {currentIndex + 1}{dateLabel ? ` · ${dateLabel}` : ''}
                </div>
                <div className="mt-1 font-story-serif text-[30px] leading-[1.05]">{place.town}</div>
              </div>
            )}

            {!isPlaying && (
              <button
                onClick={resume}
                className="absolute left-1/2 top-1/2 flex h-[64px] w-[64px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-story-coral text-[20px] text-white shadow-[0_12px_30px_-10px_rgba(0,0,0,.5)]"
              >
                ▶
              </button>
            )}
          </>
        )}
      </div>

      {/* Card region — sits below the map, never overlaps it. */}
      {!hasEnded && (
        <div className="relative min-h-0 flex-1 overflow-y-auto bg-story-cream">
          {isPlaying && currentStoryPhoto && (
            <div key={stop.id} className={`p-3.5 ${cardEntering ? 'story-card-enter' : ''}`}>
              <div className="relative mb-3 h-[190px] w-full overflow-hidden rounded-2xl bg-story-photo">
                <PhotoThumb storagePath={currentStoryPhoto.photo.storage_path} className="h-full w-full object-cover" />
                {photoStickers.map((s, i) => (
                  <div
                    key={i}
                    className="absolute text-[24px] leading-none"
                    style={{ left: `${s.x * 100}%`, top: `${s.y * 100}%`, transform: `translate(-50%, -50%) rotate(${s.rot}deg) scale(${s.scale})` }}
                  >
                    {s.emoji}
                  </div>
                ))}
              </div>
              {currentStoryPhoto.prompt_id && (
                <span className="font-story-serif text-[19px] leading-[1.15] text-story-muted">{currentStoryPhoto.prompt_id}</span>
              )}
              {currentStoryPhoto.answer && (
                <p className="mt-1 text-[16px] leading-[1.4] text-story-ink">&ldquo;{currentStoryPhoto.answer}&rdquo;</p>
              )}
              {stop.fact_text && (
                <div className="mt-3 flex items-start gap-2 border-t border-story-hairline pt-3">
                  <span className="flex-shrink-0 rounded-[5px] bg-story-teal-tint px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[.12em] text-story-teal-deep">
                    Fact
                  </span>
                  <p className="text-[13px] leading-[1.5] text-story-body">{stop.fact_text}</p>
                </div>
              )}
            </div>
          )}

          {!isPlaying && (
            <div className="flex flex-col gap-3 p-3.5">
              <div className="flex items-center justify-center gap-4">
                {notePhoto && (
                  <div className="h-[92px] w-[78px] flex-shrink-0 overflow-hidden rounded-[10px] bg-story-paper p-1 shadow-[0_10px_20px_-12px_rgba(0,0,0,.4)]" style={{ transform: 'rotate(-2deg)' }}>
                    <PhotoThumb storagePath={notePhoto.storage_path} className="h-full w-full rounded-[6px] object-cover" />
                  </div>
                )}
                <div className="flex flex-col gap-0.5">
                  <span className="font-story-serif text-[20px] leading-[1.1] text-story-ink">{place.town}</span>
                  {currentStoryPhoto?.answer && (
                    <p className="line-clamp-2 text-[13px] leading-[1.4] text-story-muted">&ldquo;{currentStoryPhoto.answer}&rdquo;</p>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-center gap-3 text-[13px] font-medium text-story-ink">
                <button onClick={() => jumpToIndex(currentIndex - 1)} disabled={currentIndex === 0} className="text-[16px] text-story-faint disabled:opacity-30">
                  ‹
                </button>
                <span>Stop {currentIndex + 1} of {stops.length} · {place.town}</span>
                <button onClick={() => jumpToIndex(currentIndex + 1)} disabled={currentIndex === stops.length - 1} className="text-[16px] text-story-faint disabled:opacity-30">
                  ›
                </button>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {stops.map((s, i) => (
                  <button
                    key={s.id}
                    onClick={() => jumpToIndex(i)}
                    className="flex-shrink-0 overflow-hidden rounded-[10px] text-left"
                    style={{ width: 74, height: 62, border: i === currentIndex ? `2px solid ${CORAL}` : '2px solid transparent' }}
                  >
                    {s.storyPhotos[0] ? (
                      <PhotoThumb storagePath={s.storyPhotos[0].photo.storage_path} className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full bg-story-photo" />
                    )}
                    <div
                      className="mt-[-18px] truncate bg-black/40 px-1 text-[10px] leading-[1.4] text-white"
                      style={{ opacity: i === currentIndex ? 1 : 0.7 }}
                    >
                      {s.visit.place.town}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {hasEnded && (
        <>
          <div className="absolute left-6 top-24 text-white">
            <div className="text-[11px] uppercase tracking-[.16em] text-white/70">
              {stops.length} stops · {days} days · {totalPhotos} photos
            </div>
            <div className="mt-1 max-w-[280px] font-story-serif text-[42px] leading-[1.05]">That&rsquo;s the whole holiday.</div>
          </div>

          <div className="absolute inset-x-4 bottom-[26px] flex flex-col gap-3 rounded-[22px] bg-story-cream p-[18px]">
            {!readOnly && (
              <button onClick={handleShare} disabled={sharing} className="rounded-2xl bg-story-coral px-5 py-4 text-left text-[16px] font-bold text-white disabled:opacity-70">
                {sharing ? 'Sharing…' : shareCopied ? 'Link copied!' : shareUrl ? 'Copy share link' : 'Share with family'}
              </button>
            )}
            <div className="flex gap-2">
              <button onClick={watchAgain} className="flex-1 rounded-xl bg-story-dark py-2.5 text-[14px] font-bold text-white">
                ↻ Watch again
              </button>
              {!readOnly && onEdit && (
                <button onClick={onEdit} className="flex-1 rounded-xl border border-story-divider py-2.5 text-[14px] font-bold text-story-body">
                  Edit stops
                </button>
              )}
            </div>
            <p className="text-[12px] text-story-faint">
              {readOnly
                ? 'Read-only link. Nothing here can be edited or added to.'
                : 'Sharing mints a read-only link. Grandparents can watch; nothing can be changed.'}
            </p>
          </div>

          <button onClick={onClose} className="absolute right-4 top-[max(14px,env(safe-area-inset-top))] flex h-9 w-9 items-center justify-center rounded-full bg-white/14 text-white">
            ✕
          </button>
        </>
      )}
      </div>
    </div>
  )
}
