import { supabase, PHOTOS_BUCKET } from './supabase'

const urlCache = new Map<string, { url: string; expiresAt: number }>()

export async function getPhotoUrl(storagePath: string): Promise<string> {
  const cached = urlCache.get(storagePath)
  if (cached && cached.expiresAt > Date.now()) return cached.url

  const { data, error } = await supabase.storage
    .from(PHOTOS_BUCKET)
    .createSignedUrl(storagePath, 3600)
  if (error || !data) throw error ?? new Error('Failed to sign photo URL')

  urlCache.set(storagePath, { url: data.signedUrl, expiresAt: Date.now() + 55 * 60 * 1000 })
  return data.signedUrl
}

export async function uploadVisitPhoto(
  userId: string,
  visitId: string,
  file: File
): Promise<string> {
  const ext = file.name.split('.').pop() ?? 'jpg'
  const path = `${userId}/${visitId}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from(PHOTOS_BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  })
  if (error) throw error
  return path
}

export async function deleteVisitPhotoFile(storagePath: string): Promise<void> {
  await supabase.storage.from(PHOTOS_BUCKET).remove([storagePath])
  urlCache.delete(storagePath)
}
