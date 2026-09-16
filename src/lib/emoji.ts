import emojiData from 'unicode-emoji-json'

export interface EmojiEntry {
  emoji: string
  name: string
  slug: string
  group: string
}

// The complete system Unicode emoji set (~1900 entries), not a curated
// subset — a previous build shipped a hardcoded list and users hit missing
// emoji. Rendered via the native system font, no image assets.
const ALL_EMOJI: EmojiEntry[] = Object.entries(emojiData as Record<string, { name: string; slug: string; group: string }>).map(
  ([emoji, meta]) => ({ emoji, name: meta.name, slug: meta.slug, group: meta.group })
)

export function allEmoji(): EmojiEntry[] {
  return ALL_EMOJI
}

export function travelEmoji(): EmojiEntry[] {
  return ALL_EMOJI.filter((e) => e.group === 'Travel & Places')
}

export function searchEmoji(query: string): EmojiEntry[] {
  const q = query.trim().toLowerCase()
  if (!q) return ALL_EMOJI
  return ALL_EMOJI.filter((e) => e.name.includes(q) || e.slug.includes(q))
}

const RECENTS_KEY = 'postmark:recentStickers'
const DEFAULT_RECENTS = ['😂', '🍜', '🌴', '🛺', '🦎', '⭐', '🏝️', '🥥', '😱', '🚂', '☔', '🐒']

export function getRecentEmoji(): string[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY)
    if (!raw) return DEFAULT_RECENTS
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_RECENTS
  } catch {
    return DEFAULT_RECENTS
  }
}

export function pushRecentEmoji(emoji: string) {
  try {
    const current = getRecentEmoji().filter((e) => e !== emoji)
    localStorage.setItem(RECENTS_KEY, JSON.stringify([emoji, ...current].slice(0, 18)))
  } catch {
    // localStorage can throw in private-browsing contexts — recents are a
    // convenience, not something worth surfacing an error for.
  }
}
