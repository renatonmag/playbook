import type { UTCTimestamp } from 'lightweight-charts'
import type { Candle } from '~/types/candle'
import type { LevelSegment } from '~/utils/level-segments'

/**
 * Where a bar's wicks begin and end, as levels that run from that bar to the current candle.
 *
 * Not a Pattern: nothing here comes off the pipeline, and there is no producer key. It reads the
 * candles the chart is already drawing, which is why it is the first thing on the monitor a person
 * points at with the cursor rather than turns on and waits for.
 *
 * The question it answers is "this bar rejected a price — is that price still being respected?",
 * and it is asked of one bar at a time, which is what makes hover the right control for it and a
 * click the right way to keep one.
 */

/** Which of a bar's two wicks a level belongs to. */
export type WickSide = 'high' | 'low'

/**
 * Which end of that wick it is.
 *
 * `start` is where the wick leaves the body, `end` is where it stopped — the extreme. Named by the
 * wick's own direction of travel rather than by an OHLC field, for the reason `EXTREME_LABELS` is
 * direction-neutral: on a bull bar the upper wick starts at the close and on a bear bar at the open,
 * and a label naming either would be wrong on half the candles on screen.
 */
export type WickEnd = 'start' | 'end'

export const WICK_LABELS: Record<WickSide, string> = {
  high: 'superior',
  low: 'inferior',
}

export const WICK_END_LABELS: Record<WickEnd, string> = {
  start: 'início',
  end: 'ponta',
}

/**
 * The hue each side is drawn in — rose and indigo.
 *
 * Shared between the overlay and the sidebar's checkbox key, the reason `EXTREME_HUES` sits beside
 * its Pattern's segments rather than inside its component.
 *
 * Chosen clear of everything already on this chart: the page's four palette colours (`#2563eb`,
 * `#c026d3`, `#ea580c`, `#0d9488`), `EXTREME_HUES`' violet, cyan and lime, `BAR_HUES`' sky,
 * amber, pink and grey, and the candles' own green and red.
 *
 * By side rather than by end: which wick a line belongs to is the thing you read at a glance, and
 * the pair's two members are told apart by being the two ends of one wick, which the picture already
 * says by putting them a wick apart.
 */
export const WICK_HUES: Record<WickSide, string> = {
  high: '#be123c',
  low: '#4338ca',
}

/**
 * What a drawn wick level is called: the bar, the wick, and which end of it.
 *
 * The bar's own `time`, so an id survives a window refetch and a live `update` — the same price may
 * be recomputed, but the bar it belongs to does not move. Nothing else is needed to name one: a bar
 * has at most four of these and no two share a side and an end.
 *
 * The `wick:` prefix is not decoration. Every primitive on the chart reports into one
 * `hoveredInfo.objectId` field, and `gapBoxId` mints a bare bar time — without the prefix a click
 * on a gap and a click on a wick level of the same bar would be the same string.
 */
export function wickLevelId(time: number, side: WickSide, end: WickEnd): string {
  return `wick:${time}:${side}:${end}`
}

/**
 * A drawn level, plus the two facts a picture states in colour and position and a list has to state
 * in words. The primitive ignores both; the sidebar is why they are here — the same arrangement
 * `ExtremeSegment` makes.
 */
export interface WickLevel extends LevelSegment {
  side: WickSide
  end: WickEnd
}

/** The bar a wick level id names, or `null` if the string is not one of ours. */
function timeOf(id: string): number | null {
  const parts = id.split(':')
  if (parts.length !== 4 || parts[0] !== 'wick') return null

  const time = Number(parts[1])
  return Number.isFinite(time) ? time : null
}

/**
 * One bar's levels, for the wicks `sides` keeps.
 *
 * Both ends of a wick or neither: they are what the wick *is*, and a single line at a high says
 * nothing about where the rejection began.
 *
 * A wick of zero length emits nothing. `high === max(open, close)` means there is no upper wick, and
 * two coincident lines would claim there is — while also putting a pin target on a bar that has
 * nothing to pin.
 */
function levelsOf(bar: Candle, sides: WickSide[]): WickLevel[] {
  const levels: WickLevel[] = []
  const bodyTop = Math.max(bar.open, bar.close)
  const bodyBottom = Math.min(bar.open, bar.close)

  // Direction-agnostic, which is what makes this one rule rather than two: on a bull bar the upper
  // wick runs close→high and on a bear bar open→high, and `bodyTop` is that distinction already
  // made.
  const wicks: { side: WickSide, start: number, end: number }[] = [
    { side: 'high', start: bodyTop, end: bar.high },
    { side: 'low', start: bodyBottom, end: bar.low },
  ]

  for (const wick of wicks) {
    if (!sides.includes(wick.side)) continue
    if (wick.start === wick.end) continue

    for (const end of ['start', 'end'] as const) {
      levels.push({
        id: wickLevelId(bar.time, wick.side, end),
        side: wick.side,
        end,
        time: bar.time as UTCTimestamp,
        price: wick[end],
        color: WICK_HUES[wick.side],
        // Always, unlike every other caller of this primitive. The stub length `LevelSegments`
        // offers answers "where was this found"; the question here is whether the price is still
        // being respected *now*, and that can only be read against the bars since.
        extend: true,
      })
    }
  }

  return levels
}

/**
 * Every wick level to draw: the hovered bar's, plus those of the bars whose levels are pinned.
 *
 * Here rather than in the overlay because the sidebar lists the pinned ones in words — a level's
 * colour, its wick, its end and its price — and reading those off a second traversal would be two
 * places deciding what a wick level is.
 *
 * The pinned ids are read back for their bar, which this module may do because they are its own
 * strings — see `wickLevelId`. Then filtered to exactly the ids asked for: a bar with a pinned high
 * has three other levels that were never pinned, and drawing those would make a pin mean "keep this
 * bar" rather than "keep this line".
 *
 * The hovered bar is drawn whole, and a bar that is both hovered and pinned is drawn once: the ids
 * are identical, and two fills in the same place are the same pixels, but the caller's `drawnIds`
 * would be a set of four where the list said eight.
 *
 * `sides` applies to both halves. A pinned level whose wick is unchecked comes off the chart with
 * the rest — the filter is a thing the sidebar was asked to hide, and a click is not permission to
 * overrule it. That is the trade `pinnedSegments` states for `leg-extremes`.
 */
export function wickLevels(
  bars: ReadonlyMap<number, Candle>,
  hovered: number | null,
  pinned: ReadonlySet<string> = new Set(),
  sides: WickSide[] = ['high', 'low'],
): WickLevel[] {
  const levels: WickLevel[] = []
  const seen = new Set<string>()

  const hoveredBar = hovered === null ? undefined : bars.get(hovered)
  if (hoveredBar) {
    for (const level of levelsOf(hoveredBar, sides)) {
      levels.push(level)
      seen.add(level.id)
    }
  }

  for (const id of pinned) {
    if (seen.has(id)) continue

    const time = timeOf(id)
    if (time === null) continue

    // A pin whose bar has scrolled out of the loaded window simply does not resolve — the honest
    // reading, and the one `pinnedSegments` gives for a leg that left.
    const bar = bars.get(time)
    if (!bar) continue

    for (const level of levelsOf(bar, sides)) {
      if (level.id !== id) continue
      levels.push(level)
      seen.add(level.id)
    }
  }

  return levels
}
