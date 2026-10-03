/**
 * The glows somebody copied off `unbroken-wick` and dragged onto wicks of their own choosing.
 *
 * Stored, where the rulers are not, and the line between them is `pinned`'s: a ruler is a question
 * asked of the chart in front of you, and a copied glow is a level somebody decided to keep watching.
 * Coming back to it tomorrow is the point of having made it.
 *
 * **No price is kept.** A copy is a bar and a side, and its price is read off that bar every time it
 * is drawn — so it can only ever sit on a wick, and a bar the feed corrected moves its glow with it
 * rather than leaving the glow at a price no candle reached. The cost is that a copy whose bar is not
 * in the loaded window has nowhere to stand and is not drawn; it is not lost, and comes back when its
 * bar does.
 *
 * Keyed by symbol and timeframe, because a bar time on one Instrument names nothing on another, and a
 * five-minute bar's time is a different bar on the hourly chart.
 *
 * `localStorage` rather than the URL, `useStoredRule`'s reason: it is something you build up while
 * working, not something you send.
 */

/** Namespaced, because `localStorage` is one flat space shared by every page on the origin. */
const KEY = 'playbook:monitor:wick-copies'

export interface WickCopy {
  id: string
  symbol: string
  timeframe: string
  /** The bar the copy stands on, as the chart's UTC seconds. */
  time: number
  /** Which wick of that bar: green glows sit on highs, red ones on lows. */
  side: 'high' | 'low'
}

/** One stored entry, or `null` when it is not one. Hand-edited and older storage are both ordinary. */
function parse(value: unknown): WickCopy | null {
  if (value === null || typeof value !== 'object') return null
  const entry = value as Record<string, unknown>
  if (typeof entry.id !== 'string' || typeof entry.symbol !== 'string') return null
  if (typeof entry.timeframe !== 'string') return null
  if (typeof entry.time !== 'number' || !Number.isFinite(entry.time)) return null
  if (entry.side !== 'high' && entry.side !== 'low') return null
  return { id: entry.id, symbol: entry.symbol, timeframe: entry.timeframe, time: entry.time, side: entry.side }
}

export function useStoredWickCopies() {
  const copies = ref<WickCopy[]>([])

  onMounted(() => {
    // One bad entry costs that entry, not the list.
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]')
      if (Array.isArray(parsed)) {
        copies.value = parsed.map(parse).filter((entry): entry is WickCopy => entry !== null)
      }
    }
    catch {
      // Not even JSON. An empty list is already in place.
    }
  })

  function save() {
    if (import.meta.client) localStorage.setItem(KEY, JSON.stringify(copies.value))
  }

  /** A new copy, returned so the caller can select it. */
  function add(copy: Omit<WickCopy, 'id'>): WickCopy {
    const made = { ...copy, id: crypto.randomUUID() }
    copies.value = [...copies.value, made]
    save()
    return made
  }

  /** Puts a copy on another bar. Its side never changes — a green glow drags along highs. */
  function move(id: string, time: number) {
    copies.value = copies.value.map(copy => (copy.id === id ? { ...copy, time } : copy))
    save()
  }

  function remove(id: string) {
    copies.value = copies.value.filter(copy => copy.id !== id)
    save()
  }

  return { copies, add, move, remove }
}
