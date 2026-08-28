import { useState } from 'react'
import { isGooglePhotosConfigured, pickPhotosFromGoogle, type PickedPhoto } from '../lib/googlePhotos'

interface GooglePhotosButtonProps {
  remainingSlots: number
  onPicked: (photos: PickedPhoto[]) => void
  variant?: 'link' | 'primary'
}

export function GooglePhotosButton({ remainingSlots, onPicked, variant = 'link' }: GooglePhotosButtonProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isGooglePhotosConfigured || remainingSlots <= 0) return null

  function handleClick() {
    // Open the popup synchronously, inside the click handler itself — doing
    // this after any `await` loses the browser's "was this a direct response
    // to a user click" association and the popup gets silently blocked.
    const popup = window.open('about:blank', '_blank')
    setBusy(true)
    setError(null)
    pickPhotosFromGoogle(remainingSlots, popup)
      .then(onPicked)
      .catch((e: any) => setError(e.message ?? 'Failed to import from Google Photos.'))
      .finally(() => setBusy(false))
  }

  const className =
    variant === 'primary'
      ? 'w-full border-2 border-ink bg-ground py-3 text-[13px] font-extrabold text-ink hover:bg-surface disabled:opacity-50'
      : 'text-[12px] text-sage underline hover:text-sage-pressed disabled:opacity-50'

  return (
    <div className="flex flex-col gap-1">
      <button type="button" onClick={handleClick} disabled={busy} className={className}>
        {busy ? 'Waiting for Google Photos…' : 'Import from Google Photos'}
      </button>
      {error && <span className="text-[11px] text-coral-pressed">{error}</span>}
    </div>
  )
}
