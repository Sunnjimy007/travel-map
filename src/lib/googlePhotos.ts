// Google Photos Picker integration — the only API Google still allows for
// pulling photos into a third-party app (the old "read my whole library"
// scopes were shut off in March 2025). The user picks photos in a Google-hosted
// dialog; we get back short-lived baseUrls (~60 min) and must download the
// bytes immediately and re-upload them into our own Supabase Storage bucket —
// there's no way to just save a reference to the Google-hosted image.

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string
            scope: string
            callback: (response: { access_token: string; expires_in: number; error?: string }) => void
            error_callback?: (error: { message?: string }) => void
          }) => { requestAccessToken: () => void }
        }
      }
    }
  }
}

const PICKER_SCOPE = 'https://www.googleapis.com/auth/photospicker.mediaitems.readonly'
const PICKER_BASE = 'https://photospicker.googleapis.com/v1'

export const isGooglePhotosConfigured = Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID)

let gisLoadPromise: Promise<void> | null = null

function loadGoogleIdentityServices(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve()
  if (gisLoadPromise) return gisLoadPromise
  gisLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load Google sign-in — check your connection.'))
    document.head.appendChild(script)
  })
  return gisLoadPromise
}

let cachedToken: { token: string; expiresAt: number } | null = null

async function getPhotosAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.token

  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
  if (!clientId) throw new Error("Google Photos isn't configured yet.")

  await loadGoogleIdentityServices()

  return new Promise((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: PICKER_SCOPE,
      callback: (response) => {
        if (response.error || !response.access_token) {
          reject(new Error(response.error ?? 'Google sign-in failed'))
          return
        }
        cachedToken = { token: response.access_token, expiresAt: Date.now() + (response.expires_in - 60) * 1000 }
        resolve(response.access_token)
      },
      error_callback: (err) => reject(new Error(err.message ?? 'Google sign-in was cancelled')),
    })
    client.requestAccessToken()
  })
}

function parseSeconds(duration: string | undefined, fallback: number): number {
  if (!duration) return fallback
  const n = parseFloat(duration.replace('s', ''))
  return Number.isFinite(n) ? n : fallback
}

interface PickerSession {
  id: string
  pickerUri: string
  pollingConfig?: { pollInterval?: string; timeoutIn?: string }
}

interface PickedMediaItem {
  id: string
  createTime?: string
  mediaFile: { baseUrl: string; mimeType: string; filename: string }
}

export interface PickedPhoto {
  file: File
  /** When the photo was taken, per Google's metadata — not when it was uploaded to Photos. */
  createTime: string | null
}

/**
 * Opens the Google Photos picker, waits for the user to finish selecting,
 * and returns the picked photos downloaded as browser File objects — ready
 * to feed into the same upload path as a local file picker. Google's Picker
 * API does not expose GPS/location data (by design, for privacy), only the
 * capture date — so only the date can be inferred from an imported photo.
 *
 * `popup` must be a window opened synchronously inside the click handler
 * that triggered this call (e.g. `window.open('', '_blank')`) — opening it
 * only after the async token/session calls below would no longer count as
 * a direct response to the user's click, and browsers silently block it.
 */
export async function pickPhotosFromGoogle(maxItems: number, popup: Window | null): Promise<PickedPhoto[]> {
  const token = await getPhotosAccessToken()

  const sessionRes = await fetch(`${PICKER_BASE}/sessions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  })
  if (!sessionRes.ok) throw new Error('Failed to start the Google Photos picker.')
  const session: PickerSession = await sessionRes.json()

  if (popup && !popup.closed) {
    popup.location.href = session.pickerUri
  } else {
    popup = window.open(session.pickerUri, '_blank', 'noopener,noreferrer')
  }
  if (!popup) {
    throw new Error('Popup blocked — allow popups for this site and try again.')
  }
  const pickerWindow = popup

  const pollIntervalMs = parseSeconds(session.pollingConfig?.pollInterval, 2) * 1000
  const timeoutMs = parseSeconds(session.pollingConfig?.timeoutIn, 300) * 1000
  const deadline = Date.now() + timeoutMs

  let mediaItemsSet = false
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, pollIntervalMs))
    const pollRes = await fetch(`${PICKER_BASE}/sessions/${session.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!pollRes.ok) throw new Error('Lost connection to the Google Photos picker.')
    const polled = await pollRes.json()
    if (polled.mediaItemsSet) {
      mediaItemsSet = true
      break
    }
    if (pickerWindow.closed) {
      // The tab closing doesn't necessarily mean nothing was picked; keep
      // polling until the session itself reports items set or times out.
    }
  }

  // The picker's job is done — close its tab so the user isn't left with a
  // stray one to clean up manually. `close()` only works on windows we
  // opened, which this always is (the fallback branch above uses window.open
  // too), so no need to guard for cross-origin restrictions here.
  if (!pickerWindow.closed) pickerWindow.close()

  if (!mediaItemsSet) {
    throw new Error('No photos were selected.')
  }

  const listRes = await fetch(`${PICKER_BASE}/mediaItems?sessionId=${session.id}&pageSize=${maxItems}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!listRes.ok) throw new Error('Failed to read the photos you selected.')
  const { mediaItems = [] } = (await listRes.json()) as { mediaItems?: PickedMediaItem[] }

  const files = await Promise.all(
    mediaItems.slice(0, maxItems).map(async (item): Promise<PickedPhoto> => {
      const dlRes = await fetch(`${item.mediaFile.baseUrl}=d`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!dlRes.ok) throw new Error(`Failed to download ${item.mediaFile.filename}`)
      const blob = await dlRes.blob()
      const file = new File([blob], item.mediaFile.filename || `${item.id}.jpg`, {
        type: item.mediaFile.mimeType || blob.type,
      })
      return { file, createTime: item.createTime ?? null }
    })
  )

  fetch(`${PICKER_BASE}/sessions/${session.id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => {})

  return files
}
