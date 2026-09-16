import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import type { StoryWithStops, VisitPhoto, Sticker } from '../types'
import { GUIDED_PROMPTS } from '../lib/storyContent'
import { pushRecentEmoji } from '../lib/emoji'
import { PhotoThumb } from './PhotoThumb'
import { Lightbox } from './Lightbox'
import { StickerLayer } from './StickerLayer'
import { StickerTray } from './StickerTray'
import { generateStoryFact, isFactApiConfigured } from '../lib/storyFacts'

interface StopEditorProps {
  story: StoryWithStops
  stopIndex: number
  onNavigateStop: (index: number) => void
  onClose: () => void
  onUpdateStop: (stopId: string, updates: Partial<{
    fact_text: string
    fact_source: 'generated' | 'edited'
    stickers: Sticker[]
    note_photo_id: string | null
  }>) => Promise<void>
  onUpdateStopPhotoAnswer: (stopPhotoId: string, promptId: string | null, answer: string | null) => Promise<void>
  onUpdateVisit: (visitId: string, updates: { visited_date?: string; end_date?: string | null }) => Promise<void>
  onUpdatePlace: (placeId: string, updates: { town?: string; country?: string }) => Promise<void>
  onAddNotePhoto: (stopId: string, visitId: string, file: File) => Promise<void>
}

export function StopEditor({
  story,
  stopIndex,
  onNavigateStop,
  onClose,
  onUpdateStop,
  onUpdateStopPhotoAnswer,
  onUpdateVisit,
  onUpdatePlace,
  onAddNotePhoto,
}: StopEditorProps) {
  const stop = story.stops[stopIndex]
  const nextStop = story.stops[stopIndex + 1]

  const [activePhotoIndex, setActivePhotoIndex] = useState(0)
  const [editingDate, setEditingDate] = useState(false)
  const [editingPlace, setEditingPlace] = useState(false)
  const [draftTown, setDraftTown] = useState('')
  const [draftCountry, setDraftCountry] = useState('')
  const [answerDraft, setAnswerDraft] = useState('')

  const [isEditingFact, setIsEditingFact] = useState(false)
  const [factDraft, setFactDraft] = useState('')
  const [factLoading, setFactLoading] = useState(false)
  const [factError, setFactError] = useState<string | null>(null)

  const [stickerTarget, setStickerTarget] = useState<'photo' | 'fact' | null>(null)
  const [lightbox, setLightbox] = useState<{ photos: VisitPhoto[]; index: number } | null>(null)

  useEffect(() => {
    setActivePhotoIndex(0)
  }, [stop?.id])

  const activeStoryPhoto = stop?.storyPhotos[activePhotoIndex]
  const [promptIndex, setPromptIndex] = useState(0)
  const activePrompt = GUIDED_PROMPTS[promptIndex]

  useEffect(() => {
    const stored = activeStoryPhoto?.prompt_id ? GUIDED_PROMPTS.indexOf(activeStoryPhoto.prompt_id) : -1
    // Default to a different suggestion per photo (cycled by filmstrip
    // position) so the picker doesn't start on the same question every
    // time — but it's just a starting point; the dropdown picks the rest.
    setPromptIndex(stored >= 0 ? stored : activePhotoIndex % GUIDED_PROMPTS.length)
    setAnswerDraft(activeStoryPhoto?.answer ?? '')
  }, [activeStoryPhoto?.id])

  if (!stop) return null
  const { visit } = stop
  const place = visit.place

  async function saveAnswerAndAdvance(skip: boolean) {
    if (!activeStoryPhoto) return
    const trimmed = answerDraft.trim()
    if (skip) {
      await onUpdateStopPhotoAnswer(activeStoryPhoto.id, null, null)
    } else if (trimmed) {
      await onUpdateStopPhotoAnswer(activeStoryPhoto.id, activePrompt, trimmed)
    }
    setActivePhotoIndex((i) => Math.min(i + 1, stop.storyPhotos.length - 1))
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

  function placeSticker(emoji: string) {
    if (!stickerTarget) return
    pushRecentEmoji(emoji)
    const sticker: Sticker = {
      emoji,
      target: stickerTarget,
      photoId: stickerTarget === 'photo' ? activeStoryPhoto?.id ?? null : null,
      x: 0.5,
      y: 0.5,
      rot: Math.round(Math.random() * 24 - 12),
      scale: 1,
    }
    onUpdateStop(stop.id, { stickers: [...(stop.stickers ?? []), sticker] })
    setStickerTarget(null)
  }

  function moveSticker(list: Sticker[], indexInList: number, x: number, y: number) {
    const all = stop.stickers ?? []
    const target = list[indexInList]
    const next = all.map((s) => (s === target ? { ...s, x, y } : s))
    onUpdateStop(stop.id, { stickers: next })
  }

  function removeSticker(list: Sticker[], indexInList: number) {
    const all = stop.stickers ?? []
    const target = list[indexInList]
    onUpdateStop(stop.id, { stickers: all.filter((s) => s !== target) })
  }

  const photoStickers = (stop.stickers ?? []).filter((s) => s.target === 'photo' && s.photoId === activeStoryPhoto?.id)
  const factStickers = (stop.stickers ?? []).filter((s) => s.target === 'fact')
  const notePhoto = stop.note_photo_id ? visit.photos.find((p) => p.id === stop.note_photo_id) : null

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
        {stop.storyPhotos.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-story-faint">
            No photos in this stop. Go back to the holiday picker to add some.
          </p>
        ) : (
          <>
            {/* Hero */}
            {activeStoryPhoto && (
              <div className="relative mb-2 flex-none overflow-hidden rounded-[14px] bg-story-photo" style={{ height: 200 }}>
                <PhotoThumb
                  storagePath={activeStoryPhoto.photo.storage_path}
                  className="h-full w-full cursor-pointer object-cover"
                  onClick={() =>
                    setLightbox({ photos: stop.storyPhotos.map((sp) => sp.photo), index: activePhotoIndex })
                  }
                />
                <StickerLayer
                  stickers={photoStickers}
                  onMove={(i, x, y) => moveSticker(photoStickers, i, x, y)}
                  onRemove={(i) => removeSticker(photoStickers, i)}
                />
              </div>
            )}

            {/* Filmstrip */}
            <div className="mb-3 flex flex-none gap-1.5 overflow-x-auto">
              {stop.storyPhotos.map((sp, i) => {
                const answered = !!sp.answer
                const active = i === activePhotoIndex
                return (
                  <button
                    key={sp.id}
                    onClick={() => setActivePhotoIndex(i)}
                    className={`relative h-[54px] w-[54px] flex-shrink-0 overflow-hidden rounded-[10px] bg-story-photo-alt ${
                      active ? 'border-2 border-story-coral' : answered ? '' : 'border border-dashed border-story-dashed opacity-55'
                    }`}
                  >
                    <PhotoThumb storagePath={sp.photo.storage_path} className="h-full w-full object-cover" />
                    {answered && !active && (
                      <span className="absolute bottom-1 right-1 grid h-4 w-4 place-items-center rounded-full border-2 border-story-cream bg-story-teal text-[9px] font-bold text-white">
                        ✓
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            <div className="mb-3 flex flex-none gap-2 flex-wrap">
              {editingDate ? (
                <input
                  autoFocus
                  type="date"
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
                  <span>{place.town}, {place.country}</span>
                  <button onClick={startEditPlace} className="font-bold text-story-coral-text">
                    edit
                  </button>
                </div>
              )}
            </div>

            {/* Guided prompt (per photo) */}
            {activeStoryPhoto && (
              <div className="mb-3 flex flex-col gap-2.5 rounded-[18px] border border-story-hairline bg-white p-3.5">
                <span className="text-[11px] font-bold uppercase tracking-[.14em] text-story-teal">
                  This photo's question
                </span>
                <select
                  value={promptIndex}
                  onChange={(e) => setPromptIndex(Number(e.target.value))}
                  className="rounded-xl border border-story-hairline bg-story-cream px-3 py-2.5 font-story-serif text-[19px] leading-[1.15] text-story-ink"
                >
                  {GUIDED_PROMPTS.map((p, i) => (
                    <option key={p} value={i}>
                      {p}
                    </option>
                  ))}
                </select>
                <textarea
                  value={answerDraft}
                  onChange={(e) => setAnswerDraft(e.target.value)}
                  rows={2}
                  placeholder="Type an answer…"
                  className="rounded-lg border border-story-hairline bg-story-cream px-2.5 py-2 text-[14px] text-story-body"
                />
                <div className="flex items-center gap-2 border-t border-story-hairline pt-2">
                  <button onClick={() => saveAnswerAndAdvance(true)} className="text-[13px] font-bold text-story-coral-text">
                    Skip
                  </button>
                  <span className="flex-1" />
                  <button
                    onClick={() => saveAnswerAndAdvance(false)}
                    className="rounded-[10px] bg-story-dark px-3.5 py-2 text-[13px] font-bold text-white"
                  >
                    Next photo →
                  </button>
                </div>
              </div>
            )}

            {/* Fact */}
            {isEditingFact ? (
              <div className="mb-3 flex flex-col gap-3 rounded-[18px] border border-story-teal-border bg-white p-4">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-[.14em] text-story-teal-deep">Editing fact</span>
                  <span className="text-[11px] text-story-faint">{factDraft.length} / 300</span>
                </div>
                <textarea
                  value={factDraft}
                  onChange={(e) => setFactDraft(e.target.value.slice(0, 300))}
                  rows={5}
                  className="rounded-xl border-2 border-story-teal p-3 text-[15px] leading-[1.55] text-story-ink"
                />
                <div className="flex gap-2">
                  <button onClick={saveFact} className="flex-1 rounded-xl bg-story-coral px-4 py-3.5 text-left text-[14px] font-bold text-white">
                    Save fact
                  </button>
                  <button onClick={() => setIsEditingFact(false)} className="rounded-xl border border-story-divider px-4 py-3.5 text-[14px] font-bold text-story-muted">
                    Cancel
                  </button>
                </div>
                <span className="text-[12px] text-story-faint">
                  Written for a 10–12 year old reader. Regenerate replaces it; editing keeps your words.
                </span>
              </div>
            ) : (
              <div className="relative mb-3 flex flex-col gap-2 rounded-[18px] border border-story-teal-border bg-story-teal-panel p-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-[.14em] text-story-teal-deep">Did you know?</span>
                  <button onClick={() => setStickerTarget('fact')} className="text-[11px] font-bold text-story-teal-deep">
                    + sticker
                  </button>
                </div>
                <p className="text-[14px] leading-[1.5] text-story-body">
                  {factLoading ? 'Thinking…' : stop.fact_text || 'No fact yet.'}
                </p>
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
                  <button onClick={startEditFact} className="rounded-[10px] border border-story-teal-border px-3 py-2 text-[13px] font-bold text-story-teal-deep">
                    Edit fact
                  </button>
                </div>
                <StickerLayer
                  stickers={factStickers}
                  onMove={(i, x, y) => moveSticker(factStickers, i, x, y)}
                  onRemove={(i) => removeSticker(factStickers, i)}
                />
              </div>
            )}

            {/* Handwritten note */}
            <div className="mb-3 flex items-center gap-3 rounded-[18px] border border-story-hairline bg-white p-2.5">
              {notePhoto ? (
                <div className="h-[54px] w-[46px] flex-shrink-0 overflow-hidden rounded-lg" style={{ transform: 'rotate(-3deg)' }}>
                  <PhotoThumb storagePath={notePhoto.storage_path} className="h-full w-full object-cover" />
                </div>
              ) : (
                <div className="grid h-[54px] w-[46px] flex-shrink-0 place-items-center rounded-lg bg-story-photo text-[9px] text-story-faint" style={{ transform: 'rotate(-3deg)' }}>
                  NOTE
                </div>
              )}
              <div className="flex flex-1 flex-col gap-0.5">
                <span className="text-[14px] font-bold">Handwritten note</span>
                <span className="text-[12px] text-story-faint">Shown as the photo itself</span>
              </div>
              <label className="cursor-pointer text-[13px] font-bold text-story-coral-text">
                {notePhoto ? 'Replace' : 'Add'}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    await onAddNotePhoto(stop.id, visit.id, file)
                  }}
                />
              </label>
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-story-hairline bg-story-cream px-5 pb-6 pt-3">
        <div className="mb-3 flex items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-[.14em] text-story-faint">Stickers</span>
          {photoStickers.slice(0, 3).map((s, i) => (
            <span key={i} className="text-[20px] leading-none">
              {s.emoji}
            </span>
          ))}
          <button onClick={() => setStickerTarget('photo')} className="ml-auto text-[12px] font-bold text-story-coral-text">
            Open tray
          </button>
        </div>
        <div className="flex gap-2.5">
          {stopIndex > 0 && (
            <button
              onClick={() => onNavigateStop(stopIndex - 1)}
              className="w-[52px] flex-shrink-0 rounded-[16px] border border-story-divider text-[16px] text-story-muted"
            >
              ‹
            </button>
          )}
          <button
            onClick={() => (nextStop ? onNavigateStop(stopIndex + 1) : onClose())}
            className="flex flex-1 items-center rounded-[16px] bg-story-coral px-5 py-4 text-left text-[16px] font-bold text-white"
          >
            <span>{nextStop ? 'Next stop' : 'Finish'}</span>
            <span className="ml-auto text-[14px] font-normal opacity-85">→</span>
          </button>
        </div>
      </div>

      {stickerTarget && (
        <StickerTray onPick={placeSticker} onClose={() => setStickerTarget(null)} />
      )}

      {lightbox && (
        <Lightbox photos={lightbox.photos} startIndex={lightbox.index} onClose={() => setLightbox(null)} />
      )}
    </div>
    </div>
  )
}
