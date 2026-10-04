import type { UTCTimestamp } from 'lightweight-charts'
import type { Timeframe } from '~/types/candle'
import type { Spot, Tag, TagCallout } from '~/utils/tag'

/**
 * The tags laid across `/monitor`'s chart — the grey bars, the strategy tags filed under each, and
 * the callouts pinned out of them — remembered between visits.
 *
 * Stored where the rulers are not, and the difference is what each one is. A ruler is a question
 * asked of the chart in front of you, and yesterday's measurements over today's candles would answer
 * nothing. A tag is a judgement — this stretch was a breakout — filed under a strategy, and the
 * reason to make one at all is to find it there again.
 *
 * **One list per Instrument and Timeframe.** A tag's ends are bars of one series and its price is
 * read off that series' scale; drawn over another, it would mark bars nobody chose. So a switch
 * swaps the list rather than wiping it, and switching back brings the old one back. A tag whose bars
 * have scrolled out of the loaded window is kept, only not drawn — `TagOverlay` has no box for it.
 *
 * `localStorage`, `useStoredIndicators`' arrangement: empty on the server and on the first client
 * frame, adopted in `onMounted`, written back on every change. One browser, one reader; the labels
 * are ids into `docs/tags/strategies.json`, and an id deleted there is simply not drawn.
 */

/** Namespaced, because `localStorage` is one flat space shared by every page on the origin. */
const KEY = 'playbook:monitor:tags'

function seriesKey(symbol: string, timeframe: Timeframe): string {
  return `${symbol}|${timeframe}`
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function parseSpot(value: unknown): Spot | null {
  if (typeof value !== 'object' || value === null) return null
  const { time, price } = value as Partial<Spot>
  return isNumber(time) && isNumber(price) ? { time: time as UTCTimestamp, price } : null
}

/** A callout, or `null` — one with a broken end has nowhere to be drawn. */
function parseCallout(value: unknown, labels: readonly string[]): TagCallout | null {
  if (typeof value !== 'object' || value === null) return null
  const stored = value as Partial<Record<keyof TagCallout, unknown>>

  const point = parseSpot(stored.point)
  const at = parseSpot(stored.at)
  if (typeof stored.id !== 'string' || typeof stored.label !== 'string' || !point || !at) return null
  // A callout is a way of showing one of the tag's labels — see `TagCallout` — and never outlives it.
  if (!labels.includes(stored.label)) return null

  return { id: stored.id, label: stored.label, point, at }
}

/**
 * One stored tag, or `null` if it cannot be drawn. `parseIndicator`'s rule: the parts that make it
 * a tag — id, ends, price — drop the entry when missing; what was filed under it falls back to none.
 */
function parseTag(value: unknown): Tag | null {
  if (typeof value !== 'object' || value === null) return null
  const stored = value as Partial<Record<keyof Tag, unknown>>

  if (typeof stored.id !== 'string' || !isNumber(stored.from) || !isNumber(stored.to) || !isNumber(stored.price)) {
    return null
  }

  const labels = Array.isArray(stored.labels)
    ? stored.labels.filter((label): label is string => typeof label === 'string')
    : []
  const callouts = Array.isArray(stored.callouts)
    ? stored.callouts.map(entry => parseCallout(entry, labels)).filter((entry): entry is TagCallout => entry !== null)
    : []

  return {
    id: stored.id,
    from: stored.from as UTCTimestamp,
    to: stored.to as UTCTimestamp,
    price: stored.price,
    labels,
    callouts,
  }
}

function parseAll(value: unknown): Record<string, Tag[]> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}

  const all: Record<string, Tag[]> = {}
  for (const [key, list] of Object.entries(value)) {
    if (!Array.isArray(list)) continue
    const tags = list.map(parseTag).filter((tag): tag is Tag => tag !== null)
    if (tags.length > 0) all[key] = tags
  }
  return all
}

export function useStoredTags(symbol: Ref<string>, timeframe: Ref<Timeframe>) {
  /** The tags of the series on screen. The page edits this list and nothing else. */
  const tags = ref<Tag[]>([])

  /** Every series' list, as stored. Read once on mount; the current series' entry follows `tags`. */
  let all: Record<string, Tag[]> = {}

  onMounted(() => {
    const stored = localStorage.getItem(KEY)
    if (stored === null) return

    try {
      all = parseAll(JSON.parse(stored))
    }
    catch {
      // `useStoredIndicators`' reasoning: nobody typed it, nobody can fix it, and no tags is a
      // correct answer.
      localStorage.removeItem(KEY)
      all = {}
    }
    tags.value = all[seriesKey(symbol.value, timeframe.value)] ?? []
  })

  // A switch swaps the list. The write below then files it under the new key, which holds it already.
  watch([symbol, timeframe], ([nextSymbol, nextTimeframe]) => {
    tags.value = all[seriesKey(nextSymbol, nextTimeframe)] ?? []
  })

  // Deep, because the page replaces tags by `map` but a future edit in place should not go unsaved.
  if (import.meta.client) {
    watch(tags, (list) => {
      const key = seriesKey(symbol.value, timeframe.value)
      if (list.length > 0) all[key] = list
      else delete all[key]
      localStorage.setItem(KEY, JSON.stringify(all))
    }, { deep: true })
  }

  return { tags }
}
