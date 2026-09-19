import type { SeriesMarker, Time, UTCTimestamp } from 'lightweight-charts'
import type { BarMark } from '~/types/pattern'

/** The readings this overlay draws. `smallest-bar` is read in the Log and nowhere else, yet. */
type DrawnMark = Exclude<BarMark['type'], 'smallest-bar'>

/**
 * The dot colours, by filter.
 *
 * Kept next to `barMarkers` because a marker's colour *is* which filter marked its bar, and the
 * mapping is one fact per key. Typed on the mark types so adding a reading to the Pattern fails
 * the build here rather than drawing an undefined colour — which is why `smallest-bar` is excluded
 * by name rather than left out: excluding it is the decision "this one is not drawn", written
 * where the build can hold it, and giving it an entry is the whole of what drawing it later takes.
 */
export const BAR_HUES: Record<DrawnMark, string> = {
  // Sky, amber and pink for the three turn candidates — three hues that stay apart on a chart of
  // green and red bodies, and far enough from each other that the filter a dot came from is
  // readable without a key.
  'two-bar': '#0ea5e9',
  'reversal-bar': '#f59e0b',
  'inside-bar': '#ec4899',
  // Grey, and deliberately the quiet one of the four: the other three mark a bar that might turn
  // the move, this one marks a bar that carried it on. Light enough to recede next to them and no
  // lighter — the dot is half-size and lands on a green or red body as often as beside one, so it
  // still has to hold against both.
  'small-overlap': '#9ca3af',
}

/** The bull/bear filter's alphabet — an `inside-bar`'s `null` is deliberately not in it. */
export type Turn = Exclude<BarMark['direction'], null>

/**
 * Whether a mark's next bar confirmed the turn the mark is a candidate for.
 *
 * Read off the mark's own direction, which is the turn it is a candidate for: a `bullish` mark is
 * confirmed by a break of the **high**. Worth stating outright, because a Series that reported the
 * *move* rather than the candidate would want exactly the opposite comparison, and the two read
 * alike on the chart while looking wrong in each other's code.
 *
 * A `small-overlap` reads the same way and means something slightly different: its direction is
 * the bar's own colour, so the test asks whether the move it carried went on rather than whether a
 * turn happened. That is the honest reading of "did the next bar break the way this one said".
 *
 * A `null` direction — an inside bar — is kept whatever the next bar did: containment is a claim
 * about the bar's range and not about a turn, so there is nothing here for a break to confirm or
 * deny. A missing next bar (the newest bar in the window, or the live edge before the following
 * one has opened) is *undecided* and also kept, following the `provisional` convention every other
 * overlay on this page uses.
 */
function confirmed(mark: BarMark, next: { high: number, low: number } | undefined): boolean {
  if (!next || mark.direction === null) return true
  return mark.direction === 'bullish' ? next.high > mark.high : next.low < mark.low
}

/**
 * Which side of the bar a mark's dot sits on.
 *
 * A mark with a direction is placed by it and by nothing else: a bear-turn candidate marks a top
 * and sits above the bar. A `small-overlap` follows the same rule off the same field, which puts a
 * bear one *above* its bar even though nothing about it is a top. Read that placement as "which
 * side of the price this mark's direction points at", not as "a candidate turn"; the hue says which
 * claim is being made.
 *
 * An inside bar has no direction of its own, so the bar **after** it decides: the dot goes to the
 * side that bar did not break, leaving the way out of the range clear rather than sitting in it. A
 * break of the low alone is the only case that lifts the dot above — a break of the high alone
 * leaves it below, and so do the two cases where nothing was resolved: no next bar at all (the
 * newest bar in the window, or the live edge before the following one has opened), and a next bar
 * that took out both ends. Below is the unresolved reading as well as the broke-the-high one, which
 * is worth knowing when reading a dot: below says "not taken downward yet", not "taken upward".
 *
 * Strict comparisons, the same word `confirmed` uses above: an equal low is not a break.
 */
function side(
  mark: BarMark,
  next: { high: number, low: number } | undefined,
): 'aboveBar' | 'belowBar' {
  if (mark.direction === 'bearish') return 'aboveBar'
  if (mark.direction !== null || !next) return 'belowBar'
  const brokeLow = next.low < mark.low
  const brokeHigh = next.high > mark.high
  return brokeLow && !brokeHigh ? 'aboveBar' : 'belowBar'
}

/**
 * The dots the `bars` overlay draws, one per mark, hued by which filter made it.
 *
 * `directions` is the sidebar's bull/bear filter, and `confirmedOnly` the confirmation filter —
 * both here rather than in the overlay for the reason `gapBoxes` and `extremeSegments` are: the
 * sidebar reasons about the same marks, and reading them off a second traversal would be two places
 * deciding what a mark is.
 *
 * `nextByTime` is not a filter. It is the bar after each mark, and it is read for two independent
 * things: whether a directional mark survives `confirmedOnly`, and which side an inside bar's dot
 * sits on. The second happens whether or not the filter is on, which is why the map arrives
 * unconditionally and a separate boolean carries the switch — see `side`.
 *
 * Deduped by `time`, `type` and side even though this Pattern visits each bar once and cannot
 * collide: the chart wants times strictly ascending, the sort is needed regardless, and a map that
 * cannot collide costs nothing to keep.
 */
export function barMarkers(
  points: BarMark[],
  directions: Turn[],
  nextByTime: ReadonlyMap<number, { high: number, low: number }> | null,
  confirmedOnly: boolean,
): SeriesMarker<Time>[] {
  const seen = new Map<string, SeriesMarker<Time>>()

  for (const mark of points) {
    // A reading with no hue is a reading this overlay does not draw — see `DrawnMark`. Skipped
    // rather than drawn in a default colour, because a dot nobody chose a colour for is a dot
    // whose meaning the chart cannot tell you.
    if (!(mark.type in BAR_HUES)) continue
    // A directionless mark is not filtered by a direction filter. Turning both checkboxes off
    // still leaves the inside bars, which is the honest reading of what the checkboxes ask.
    if (mark.direction !== null && !directions.includes(mark.direction)) continue

    const next = nextByTime?.get(mark.time)
    if (confirmedOnly && !confirmed(mark, next)) continue

    const position = side(mark, next)

    seen.set(`${mark.time}:${mark.type}:${position}`, {
      time: mark.time as UTCTimestamp,
      position,
      shape: 'circle' as const,
      // Half the library's default dot. It only reads as smaller once bars are wider than about
      // 24px: a circle's diameter is `ceiledOdd(max(shapeHeight * size, 12) * 0.8)`, so 11px is
      // the floor whatever the multiplier, and the monitor's fitted zoom already sits on it.
      size: 0.5,
      color: BAR_HUES[mark.type as DrawnMark],
    })
  }

  return [...seen.values()].sort((a, b) => (a.time as number) - (b.time as number))
}
