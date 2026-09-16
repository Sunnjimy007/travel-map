import { useMemo, useState } from 'react'
import { allEmoji, travelEmoji, searchEmoji, getRecentEmoji } from '../lib/emoji'

interface StickerTrayProps {
  onPick: (emoji: string) => void
  onClose: () => void
}

type Tab = 'all' | 'travel' | 'words'

export function StickerTray({ onPick, onClose }: StickerTrayProps) {
  const [tab, setTab] = useState<Tab>('all')
  const [query, setQuery] = useState('')
  const recents = useMemo(() => getRecentEmoji(), [])

  const grid = useMemo(() => {
    if (query.trim()) return searchEmoji(query)
    if (tab === 'travel') return travelEmoji()
    if (tab === 'words') return [] // reserved for a future sticker pack
    return allEmoji()
  }, [tab, query])

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-story-ink/35">
      <div className="flex w-full max-w-[480px] flex-col gap-4 rounded-t-[24px] bg-white px-5 pb-7 pt-4.5" style={{ maxHeight: '85vh' }}>
        <div className="flex items-center justify-between">
          <h3 className="text-[17px] font-bold text-story-ink">Stickers</h3>
          <button onClick={onClose} className="text-[13px] font-bold text-story-coral-text">
            Done
          </button>
        </div>

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search all emoji"
          className="rounded-full bg-story-photo-tint px-3.5 py-2.5 text-[13px] text-story-ink placeholder:text-story-faint"
        />

        <div className="flex gap-1 rounded-xl bg-story-dark p-1">
          {(['all', 'travel', 'words'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 rounded-lg py-2 text-center text-[12px] font-bold capitalize ${
                tab === t ? 'bg-story-teal text-white' : 'text-story-disabled'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {!query.trim() && tab === 'all' && (
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-[.14em] text-story-faint">Recently used</span>
            <span className="text-[11px] text-story-faint">Scroll for every emoji</span>
          </div>
        )}

        {!query.trim() && tab === 'all' && (
          <div className="grid grid-cols-6 gap-2.5 text-[28px] leading-[1.1]">
            {recents.map((emoji, i) => (
              <button key={`recent-${i}`} onClick={() => onPick(emoji)}>
                {emoji}
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {tab === 'words' && !query.trim() ? (
            <p className="py-6 text-center text-[13px] text-story-faint">Word stickers are coming in a future update.</p>
          ) : (
            <div className="grid grid-cols-6 gap-2.5 text-[28px] leading-[1.1]">
              {grid.map((e) => (
                <button key={e.slug} onClick={() => onPick(e.emoji)} title={e.name}>
                  {e.emoji}
                </button>
              ))}
            </div>
          )}
        </div>

        <span className="text-[12px] text-story-faint">
          Tap to drop on the photo or on the fact card, then drag to place. The grid is the full system emoji set —
          recents first, searchable, nothing withheld.
        </span>
      </div>
    </div>
  )
}
