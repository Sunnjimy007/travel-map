import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import type { PlaceWithVisits } from '../types'

interface NewStoryModalProps {
  places: PlaceWithVisits[]
  usedVisitIds: Set<string>
  presetVisitIds: string[] | null
  onSave: (title: string, visitIds: string[]) => Promise<void>
  onClose: () => void
}

interface Row {
  visitId: string
  town: string
  country: string
  date: string
}

export function NewStoryModal({ places, usedVisitIds, presetVisitIds, onSave, onClose }: NewStoryModalProps) {
  const rows = useMemo<Row[]>(() => {
    const all = places.flatMap((p) =>
      p.visits.map((v) => ({ visitId: v.id, town: p.town, country: p.country, date: v.visited_date }))
    )
    all.sort((a, b) => (a.date < b.date ? 1 : -1))
    return all
  }, [places])

  const [selected, setSelected] = useState<Set<string>>(new Set(presetVisitIds ?? []))
  const [title, setTitle] = useState(() => {
    if (!presetVisitIds) return ''
    const towns = [...new Set(rows.filter((r) => presetVisitIds.includes(r.visitId)).map((r) => r.town))]
    return towns.join(' & ')
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggle(visitId: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(visitId)) next.delete(visitId)
      else next.add(visitId)
      return next
    })
  }

  async function handleSave() {
    setError(null)
    if (!title.trim()) {
      setError('Give the story a title.')
      return
    }
    if (selected.size === 0) {
      setError('Pick at least one visit for the story.')
      return
    }
    setSaving(true)
    try {
      await onSave(title.trim(), [...selected])
      onClose()
    } catch (e: any) {
      setError(e.message ?? 'Failed to create story')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-story-ink/50 font-story-sans sm:items-center">
      <div className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-t-[24px] bg-story-cream sm:rounded-[24px]">
        <div className="flex items-center justify-between border-b border-story-hairline px-5 py-4">
          <h2 className="font-story-serif text-[22px] text-story-ink">New story</h2>
          <button onClick={onClose} className="text-story-muted">
            &times;
          </button>
        </div>

        <div className="px-5 pt-4">
          <label className="block text-[11px] font-bold uppercase tracking-[.1em] text-story-faint">
            Title
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Penang & Langkawi"
              className="mt-1.5 w-full rounded-xl border border-story-divider bg-white px-3.5 py-2.5 text-[15px] font-normal normal-case tracking-normal text-story-ink"
            />
          </label>
        </div>

        <div className="mt-3 flex-1 overflow-y-auto px-5 pb-2">
          <div className="mb-2 text-[11px] font-bold uppercase tracking-[.1em] text-story-faint">
            Pick visits ({selected.size} selected)
          </div>
          <div className="flex flex-col gap-1.5">
            {rows.map((r) => {
              const used = usedVisitIds.has(r.visitId)
              return (
                <label
                  key={r.visitId}
                  className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${
                    used ? 'border-story-hairline opacity-40' : 'border-story-hairline bg-white'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(r.visitId)}
                    disabled={used}
                    onChange={() => toggle(r.visitId)}
                    className="h-4 w-4 accent-story-teal"
                  />
                  <div className="flex-1">
                    <div className="text-[14px] font-bold text-story-ink">
                      {r.town}, {r.country}
                    </div>
                    <div className="text-[12px] text-story-faint">
                      {format(new Date(r.date), 'd MMM yyyy')}
                      {used ? ' · already in a story' : ''}
                    </div>
                  </div>
                </label>
              )
            })}
            {rows.length === 0 && <p className="py-6 text-center text-[13px] text-story-faint">No visits logged yet.</p>}
          </div>
        </div>

        {error && <p className="px-5 pb-2 text-[13px] text-story-coral-text">{error}</p>}

        <div className="border-t border-story-hairline p-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full rounded-2xl bg-story-coral px-5 py-3.5 text-[15px] font-bold text-white hover:bg-story-coral-pressed disabled:opacity-50"
          >
            {saving ? 'Creating…' : 'Create story'}
          </button>
        </div>
      </div>
    </div>
  )
}
