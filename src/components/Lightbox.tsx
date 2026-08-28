import { useEffect, useState } from 'react'
import { getPhotoUrl } from '../lib/photos'
import type { VisitPhoto } from '../types'

interface LightboxProps {
  photos: VisitPhoto[]
  startIndex: number
  onClose: () => void
}

export function Lightbox({ photos, startIndex, onClose }: LightboxProps) {
  const [index, setIndex] = useState(startIndex)
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setUrl(null)
    getPhotoUrl(photos[index].storage_path).then((u) => {
      if (!cancelled) setUrl(u)
    })
    return () => {
      cancelled = true
    }
  }, [index, photos])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(i + 1, photos.length - 1))
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(i - 1, 0))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [photos.length, onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
      onClick={onClose}
    >
      <button
        className="absolute right-4 top-4 text-2xl text-white/80 hover:text-white"
        onClick={onClose}
      >
        &times;
      </button>
      {photos.length > 1 && index > 0 && (
        <button
          className="absolute left-4 text-3xl text-white/70 hover:text-white"
          onClick={(e) => {
            e.stopPropagation()
            setIndex((i) => i - 1)
          }}
        >
          &#8249;
        </button>
      )}
      {url ? (
        <img
          src={url}
          alt=""
          className="max-h-[85vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <div className="text-white/60">Loading…</div>
      )}
      {photos.length > 1 && index < photos.length - 1 && (
        <button
          className="absolute right-4 text-3xl text-white/70 hover:text-white"
          onClick={(e) => {
            e.stopPropagation()
            setIndex((i) => i + 1)
          }}
        >
          &#8250;
        </button>
      )}
    </div>
  )
}
