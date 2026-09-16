import { useEffect, useState } from 'react'
import { getPhotoUrl } from '../lib/photos'

interface PhotoThumbProps {
  storagePath: string
  className?: string
  onClick?: () => void
  alt?: string
  onDimensions?: (dims: { width: number; height: number }) => void
}

export function PhotoThumb({ storagePath, className, onClick, alt, onDimensions }: PhotoThumbProps) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getPhotoUrl(storagePath)
      .then((u) => !cancelled && setUrl(u))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [storagePath])

  if (!url) {
    return <div className={`animate-pulse bg-neutral-200 ${className ?? ''}`} />
  }

  return (
    <img
      src={url}
      alt={alt ?? ''}
      className={className}
      onClick={onClick}
      loading="lazy"
      onLoad={(e) => {
        const img = e.currentTarget
        onDimensions?.({ width: img.naturalWidth, height: img.naturalHeight })
      }}
    />
  )
}
