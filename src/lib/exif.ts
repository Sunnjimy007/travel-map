import { parse } from 'exifr'

export interface PhotoExif {
  dateTime: Date | null
  latitude: number | null
  longitude: number | null
}

// Photos shared via WhatsApp or the Google Photos Picker routinely have EXIF
// stripped — this always resolves, never throws, and callers should treat a
// null value as "fall back to manual entry" rather than an error (PRD §11).
export async function readPhotoExif(file: File): Promise<PhotoExif> {
  try {
    // A top-level "pick" disables every block not named in it — including
    // GPS — regardless of "gps: true" alongside it (per exifr's own docs).
    // Scoping the pick to the exif block only keeps GPS parsing enabled.
    const data = await parse(file, { exif: { pick: ['DateTimeOriginal', 'CreateDate'] }, gps: true })
    if (!data) return { dateTime: null, latitude: null, longitude: null }
    const dateTime: Date | null = data.DateTimeOriginal ?? data.CreateDate ?? null
    const latitude = typeof data.latitude === 'number' ? data.latitude : null
    const longitude = typeof data.longitude === 'number' ? data.longitude : null
    return { dateTime, latitude, longitude }
  } catch {
    return { dateTime: null, latitude: null, longitude: null }
  }
}
