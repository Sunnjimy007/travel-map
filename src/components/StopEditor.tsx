import { useState } from 'react'
import { format } from 'date-fns'
import type { StoryWithStops, VisitPhoto, Sticker } from '../types'
import { readPhotoExif } from '../lib/exif'
import { GUIDED_PROMPTS, STICKER_EMOJI } from '../lib/storyContent'
import { MAX_PHOTOS_PER_VISIT } from '../lib/constants'
import { PhotoThumb } from './PhotoThumb'
import { Lightbox } from './Lightbox'
import { StickerLayer } from './StickerLayer'
import { generateStoryFact, isFactApiConfigured } from '../lib/storyFacts'

interface StopEditorProps {
  story: StoryWithStops
  stopIndex: number
  onNavigateStop: (index: number) => void
  onClose: () => void
  onUpdateStop: (stopId: string, updates: Partial<{
    fact_text: string
    fact_source: 'generated' | 'edited'
    story_note: string
    stickers: Sticker[]
  }>) => Promise<void>
  onUpdateVisit: (visitId: string, updates: { visited_date?: string; end_date?: string | null }) => Promise<void>
  onUpdatePlace: (placeId: string, updates: { town?: string; country?: string }) => Promise<void>
  onAddPhotos: (visitId: string, files: File[], startOrder: number) => Promise<void>
  onDeletePhoto: (photo: VisitPhoto) => Promise<void>
}

const STOP_PROMPTS_COUNT = 3

export function StopEditor({
  story,
  stopIndex,
  onNavigateStop,
  onClose,
  onUpdateStop,
  onUpdateVisit,
  onUpdatePlace,
  onAddPhotos,
  onDeletePhoto,
}: StopEditorProps) {
  const stop = story.stops[stopIndex]
  const nextStop = story.stops[stopIndex + 1]

  const [editingDate, setEditingDate] = useState(false)
  const [editingPlace, setEditingPlace] = useState(false)
  const [draftTown, setDraftTown] = useState('')
  const [draftCountry, setDraftCountry] = useState('')
  const [manualDateHint, setManualDateHint] = useState(false)

  const [promptIndex, setPromptIndex] = useState(0)
  const [answer, setAnswer] = useState('')

  const [isEditingFact, setIsEditingFact] = useState(false)
  const [factDraft, setFactDraft] = useState('')
  const [factLoading, setFactLoading] = useState(false)
  const [factError, setFactError] = useState<string | null>(null)

  const [isStickerTrayOpen, setIsStickerTrayOpen] = useState(false)
  const [lightbox, setLightbox] = useState<{ photos: VisitPhoto[]; index: number } | null>(null)

  if (!stop) return null
  const { visit } = stop
  const place = visit.place
  const prompts = GUIDED_PROMPTS.slice(0, STOP_PROMPTS_COUNT)

  async function handleFilesChosen(files: FileList | null) {
    if (!files) return
    const arr = Array.from(files).slice(0, MAX_PHOTOS_PER_VISIT - visit.photos.length)
    if (arr.length === 0) return
    // Photos shared via WhatsApp/the Picker routinely have EXIF stripped —
    // this is purely informational (surfaces the amber "set by hand" chip
    // for this session), it never blocks the upload.
    const exifResults = await Promise.all(arr.map(readPhotoExif))
    if (exifResults.every((r) => !r.dateTime)) setManualDateHint(true)
    await onAddPhotos(visit.id, arr, visit.photos.length)
  }

  function startEditDate() {
    setEditingDate(true)
  }

  async function saveDate(value: string) {
    await onUpdateVisit(visit.id, { visited_date: value })
    setEditingDate(false)
  }

  function startEditPlace() {
    setDraftTown(place.town)
    setDraftCountry(place.country)
    setEditingPlace(true)
  }

  async function savePlace() {
    await onUpdatePlace(place.id, { town: draftTown.trim(), country: draftCountry.trim() })
    setEditingPlace(false)
  }

  async function handleNextQuestion() {
    if (answer.trim()) {
      const combined = stop.story_note ? `${stop.story_note}\n\n${answer.trim()}` : answer.trim()
      await onUpdateStop(stop.id, { story_note: combined })
    }
    setAnswer('')
    setPromptIndex((i) => Math.min(i + 1, prompts.length))
  }

  function handleSkip() {
    setAnswer('')
    setPromptIndex((i) => Math.min(i + 1, prompts.length))
  }

  async function handleRegenerateFact() {
    setFactLoading(true)
    setFactError(null)
    try {
      const fact = await generateStoryFact(place.town, place.country)
      await onUpdateStop(stop.id, { fact_text: fact, fact_source: 'generated' })
    } catch (e: any) {
      setFactError(e.message ?? 'Failed to generate a fact.')
    } finally {
      setFactLoading(false)
    }
  }

  function startEditFact() {
    setFactDraft(stop.fact_text ?? '')
    setIsEditingFact(true)
  }

  async function saveFact() {
    await onUpdateStop(stop.id, { fact_text: factDraft.trim(), fact_source: 'edited' })
    setIsEditingFact(false)
  }

  async function placeSticker(emoji: string) {
    const primaryPhoto = visit.photos[0]
    if (!primaryPhoto) return
    const existing = stop.stickers ?? []
    const next: Sticker[] = [
      ...existing,
      { emoji, x: 0.5, y: 0.5, rot: Math.round(Math.random() * 24 - 12), scale: 1, photoId: primaryPhoto.id },
    ]
    await onUpdateStop(stop.id, { stickers: next })
  }

  async function moveSticker(index: number, x: number, y: number) {
    const existing = [...(stop.stickers ?? [])]
    if (!existing[index]) return
    existing[index] = { ...existing[index], x, y }
    await onUpdateStop(stop.id, { stickers: existing })
  }

  async function removeSticker(index: number) {
    const existing = [...(stop.stickers ?? [])]
    existing.splice(index, 1)
    await onUpdateStop(stop.id, { stickers: existing })
  }

  const primaryPhoto = visit.photos[0]
  const secondaryPhoto = visit.photos[1]
  const overflowCount = Math.max(0, visit.photos.length - 2)

  return (
    <div className="fixed inset-0 z-40 flex justify-center bg-story-board font-story-sans text-story-ink">
    <div className="flex w-full max-w-[480px] flex-col bg-story-cream">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-story-hairline px-5 py-3">
        <button onClick={onClose} className="text-[15px] font-medium text-story-muted">
          &times;
        </button>
        <div className="flex flex-col items-center gap-1">
          <span className="text-[14px] font-bold">{place.town}</span>
          <span className="text-[12px] text-story-faint">
            Stop {stopIndex + 1} of {story.stops.length}
          </span>
        </div>
        <button onClick={onClose} className="text-[14px] font-bold text-story-coral-text">
          Done
        </button>
      </div>

      {/* Progress */}
      <div className="flex gap-1 px-5 py-2.5">
        {story.stops.map((_, i) => (
          <button
            key={i}
            onClick={() => onNavigateStop(i)}
            className={`h-[3px] flex-1 rounded-full ${
              i < stopIndex ? 'bg-story-teal' : i === stopIndex ? 'bg-story-coral' : 'bg-story-divider'
            }`}
          />
        ))}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 pb-4">
        <div className="mb-3 flex gap-2">
          <div className="relative h-[104px] flex-[2] overflow-hidden rounded-[14px] bg-story-photo">
            {primaryPhoto ? (
              <>
                <PhotoThumb
                  storagePath={primaryPhoto.storage_path}
                  className="h-full w-full cursor-pointer object-cover"
                  onClick={() => setLightbox({ photos: visit.photos, index: 0 })}
                />
                <StickerLayer
                  stickers={(stop.stickers ?? []).filter((s) => s.photoId === primaryPhoto.id)}
                  onMove={moveSticker}
                  onRemove={removeSticker}
                />
                <button
                  onClick={() => onDeletePhoto(primaryPhoto)}
                  className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-story-ink/70 text-xs text-white"
                >
                  &times;
                </button>
              </>
            ) : (
              <label className="flex h-full w-full cursor-pointer items-center justify-center text-[10px] tracking-[.08em] text-story-faint">
                PHOTO
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => handleFilesChosen(e.target.files)}
                />
              </label>
            )}
          </div>
          <div className="flex flex-1 flex-col gap-2">
            <div className="relative flex-1 overflow-hidden rounded-xl bg-story-photo-alt">
              {secondaryPhoto ? (
                <>
                  <PhotoThumb
                    storagePath={secondaryPhoto.storage_path}
                    className="h-full w-full cursor-pointer object-cover"
                    onClick={() => setLightbox({ photos: visit.photos, index: 1 })}
                  />
                  <button
                    onClick={() => onDeletePhoto(secondaryPhoto)}
                    className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-story-ink/70 text-xs text-white"
                  >
                    &times;
                  </button>
                </>
              ) : (
                <label className="flex h-full w-full cursor-pointer items-center justify-center text-[10px] text-story-faint">
                  PHOTO
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => handleFilesChosen(e.target.files)}
                  />
                </label>
              )}
            </div>
            <label className="flex flex-1 cursor-pointer items-center justify-center rounded-xl border border-dashed border-story-dashed text-[12px] font-bold text-story-muted">
              {overflowCount > 0 ? `+ ${overflowCount}` : visit.photos.length < MAX_PHOTOS_PER_VISIT ? '+ Add' : ''}
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => handleFilesChosen(e.target.files)}
              />
            </label>
          </div>
        </div>

        <div className="mb-3 flex flex-wrap gap-2">
          {editingDate ? (
            <input
              type="date"
              autoFocus
              defaultValue={visit.visited_date}
              onBlur={(e) => saveDate(e.target.value)}
              className="rounded-full border border-story-teal bg-white px-3 py-2 text-[12px] font-medium text-story-ink"
            />
          ) : (
            <div className="flex items-center gap-1.5 rounded-full border border-story-hairline bg-white px-3 py-2 text-[12px] font-medium">
              <span>{format(new Date(visit.visited_date), 'd MMM, h:mma').toLowerCase()}</span>
              <button onClick={startEditDate} className="font-bold text-story-coral-text">
                edit
              </button>
            </div>
          )}

          {editingPlace ? (
            <div className="flex items-center gap-1.5 rounded-full border border-story-teal bg-white px-2 py-1.5">
              <input
                autoFocus
                value={draftTown}
                onChange={(e) => setDraftTown(e.target.value)}
                className="w-24 text-[12px] font-medium text-story-ink"
              />
              <input
                value={draftCountry}
                onChange={(e) => setDraftCountry(e.target.value)}
                className="w-20 text-[12px] font-medium text-story-ink"
              />
              <button onClick={savePlace} className="font-bold text-story-coral-text">
                save
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 rounded-full border border-story-hairline bg-white px-3 py-2 text-[12px] font-medium">
              <span>
                {place.town}, {place.country}
              </span>
              <button onClick={startEditPlace} className="font-bold text-story-coral-text">
                edit
              </button>
            </div>
          )}
        </div>

        {manualDateHint && (
          <div className="mb-3 inline-flex items-center gap-1.5 self-start rounded-full border border-story-amber-border bg-story-amber-fill px-3 py-1.5 text-[12px] font-medium text-story-amber-text">
            No photo date — set by hand
          </div>
        )}

        {/* Guided prompt */}
        <div className="mb-3 flex flex-col gap-2.5 rounded-[18px] border border-story-hairline bg-white p-3.5">
          {promptIndex < prompts.length && (
            <>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-[.14em] text-story-teal">
                  Question {promptIndex + 1} of {prompts.length}
                </span>
                <div className="flex gap-1.5">
                  {prompts.map((_, i) => (
                    <span
                      key={i}
                      className={`h-1.5 w-1.5 rounded-full ${i <= promptIndex ? 'bg-story-teal' : 'bg-story-divider'}`}
                    />
                  ))}
                </div>
              </div>
              <h3 className="font-story-serif text-[22px] leading-[1.15] text-story-ink">{prompts[promptIndex]}</h3>
              <textarea
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                rows={2}
                placeholder="Type an answer…"
                className="rounded-lg border border-story-hairline bg-story-cream px-2.5 py-2 text-[14px] text-story-body"
              />
              <div className="flex items-center gap-2 border-t border-story-hairline pt-2">
                <button onClick={handleSkip} className="text-[13px] font-bold text-story-coral-text">
                  Skip
                </button>
                <span className="flex-1" />
                <button
                  onClick={handleNextQuestion}
                  className="rounded-[10px] bg-story-dark px-3.5 py-2 text-[13px] font-bold text-white"
                >
                  {promptIndex === prompts.length - 1 ? 'Done' : 'Next question →'}
                </button>
              </div>
            </>
          )}
          {promptIndex >= prompts.length && (
            <span className="text-[11px] font-bold uppercase tracking-[.14em] text-story-teal">
              All questions answered
            </span>
          )}
          {stop.story_note && (
            <p className="whitespace-pre-wrap border-t border-story-hairline pt-2 text-[13px] text-story-muted">
              {stop.story_note}
            </p>
          )}
        </div>

        {/* Fact card */}
        {isEditingFact ? (
          <div className="mb-3 flex flex-col gap-2.5 rounded-[18px] border border-story-teal-border bg-white p-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-[.14em] text-story-teal-deep">Editing fact</span>
              <span className="text-[11px] text-story-faint">{factDraft.length} / 300</span>
            </div>
            <textarea
              value={factDraft}
              onChange={(e) => setFactDraft(e.target.value.slice(0, 300))}
              rows={4}
              className="min-h-[100px] rounded-xl border-2 border-story-teal p-3 text-[15px] leading-[1.55] text-story-ink"
            />
            <div className="flex gap-2">
              <button
                onClick={saveFact}
                className="flex-1 rounded-xl bg-story-coral px-4 py-3.5 text-left text-[14px] font-bold text-white"
              >
                Save fact
              </button>
              <button
                onClick={() => setIsEditingFact(false)}
                className="rounded-xl border border-story-divider px-4 py-3.5 text-[14px] font-bold text-story-muted"
              >
                Cancel
              </button>
            </div>
            <span className="text-[12px] text-story-faint">
              Written for a 10–12 year old reader. Regenerate replaces it; editing keeps your words.
            </span>
          </div>
        ) : (
          <div className="mb-3 flex flex-col gap-2.5 rounded-[18px] border border-story-teal-border bg-story-teal-panel p-3.5">
            <span className="text-[11px] font-bold uppercase tracking-[.14em] text-story-teal-deep">Did you know?</span>
            {factLoading ? (
              <div className="h-5 w-3/4 animate-pulse rounded bg-story-teal-border/60" />
            ) : stop.fact_text ? (
              <p className="text-[14px] leading-[1.5] text-story-ink">{stop.fact_text}</p>
            ) : !isFactApiConfigured ? (
              <p className="text-[13px] leading-[1.5] text-story-teal-deep/80">
                Fact generation isn't set up yet — write your own with Edit fact.
              </p>
            ) : (
              <p className="text-[13px] leading-[1.5] text-story-teal-deep/80">No fact yet for this stop.</p>
            )}
            {factError && <p className="text-[12px] text-story-coral-text">{factError}</p>}
            <div className="flex gap-2">
              {isFactApiConfigured && (
                <button
                  onClick={handleRegenerateFact}
                  disabled={factLoading}
                  className="rounded-[10px] border border-story-teal-border bg-white px-3 py-2 text-[13px] font-bold text-story-teal-deep disabled:opacity-50"
                >
                  ↻ Regenerate
                </button>
              )}
              <button
                onClick={startEditFact}
                className="rounded-[10px] border border-story-teal-border bg-transparent px-3 py-2 text-[13px] font-bold text-story-teal-deep"
              >
                Edit fact
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex flex-col gap-3 border-t border-story-hairline bg-story-cream px-5 pb-6 pt-3">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-[.14em] text-story-faint">Stickers</span>
          {(stop.stickers ?? []).slice(0, 3).map((s, i) => (
            <span key={i} className="text-[20px] leading-none">
              {s.emoji}
            </span>
          ))}
          <button onClick={() => setIsStickerTrayOpen(true)} className="ml-auto text-[12px] font-bold text-story-coral-text">
            Open tray
          </button>
        </div>
        <div className="flex gap-2.5">
          {stopIndex > 0 && (
            <button
              onClick={() => onNavigateStop(stopIndex - 1)}
              className="w-[52px] flex-shrink-0 rounded-[14px] border border-story-divider text-[16px] text-story-muted"
            >
              ‹
            </button>
          )}
          {nextStop ? (
            <button
              onClick={() => onNavigateStop(stopIndex + 1)}
              className="flex-1 rounded-[14px] bg-story-dark py-[15px] text-[15px] font-bold text-white"
            >
              Next stop: {nextStop.visit.place.town}
            </button>
          ) : (
            <button onClick={onClose} className="flex-1 rounded-[14px] bg-story-dark py-[15px] text-[15px] font-bold text-white">
              Finish
            </button>
          )}
        </div>
      </div>

      {isStickerTrayOpen && (
        <StickerTray onPick={placeSticker} onClose={() => setIsStickerTrayOpen(false)} />
      )}

      {lightbox && (
        <Lightbox photos={lightbox.photos} startIndex={lightbox.index} onClose={() => setLightbox(null)} />
      )}
    </div>
    </div>
  )
}

function StickerTray({ onPick, onClose }: { onPick: (emoji: string) => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-story-ink/35">
      <div className="flex w-full max-w-[480px] flex-col gap-4 rounded-t-[24px] bg-white px-5 pb-7 pt-4.5">
        <div className="flex items-center justify-between">
          <h3 className="text-[17px] font-bold text-story-ink">Stickers</h3>
          <button onClick={onClose} className="text-[13px] font-bold text-story-coral-text">
            Done
          </button>
        </div>
        <div className="grid grid-cols-6 gap-2.5 text-[28px] leading-[1.1]">
          {STICKER_EMOJI.map((emoji) => (
            <button key={emoji} onClick={() => onPick(emoji)}>
              {emoji}
            </button>
          ))}
        </div>
        <span className="text-[12px] text-story-faint">
          Tap to drop on the photo, then drag to place. Stickers save with the stop.
        </span>
      </div>
    </div>
  )
}
