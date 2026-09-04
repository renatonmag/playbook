import type { SeriesMarker, Time, UTCTimestamp } from 'lightweight-charts'
import type { BarMark } from '~/types/pattern'
import { REVERSAL_HUES } from '~/utils/leg-reversals'

/**
 * The dot colours, by filter — `REVERSAL_HUES` plus the reading only this Series has.
 *
 * Extends rather than edits that record, which stays keyed on `LegBar['type']` because
 * `LegReversalsOverlay` and `LegReversalsVerify` colour marks a leg can actually carry. Typed on
 * `BarMark['type']` so adding a fifth reading to the Pattern fails the build here.
 */
export const BAR_HUES: Record<BarMark['type'], string> = {
  ...REVERSAL_HUES,
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
 * The same test `confirmed` in `utils/leg-reversals` makes, read off the mark instead of off its
 * leg — and therefore written the other way round, which is worth staring at before editing
 * either. There, a `bullish` direction is a leg that *topped out*, so its marks are bear-turn
 * candidates confirmed by a break of the low. Here `bullish` is the turn itself, so it is
 * confirmed by a break of the **high**. Same picture on the chart, opposite-looking code.
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
 * The dots the `bars` overlay draws, one per mark, hued by which filter made it.
 *
 * `directions` is the sidebar's bull/bear filter and `nextByTime`, when non-null, the confirmation
 * filter — both here rather than in the overlay for the reason `reversalMarkers` gives.
 *
 * The side a dot sits on is read off the mark's own direction, which lands it in the same place
 * `reversalMarkers` puts it: a bear-turn candidate marks a top and sits above the bar. An
 * `inside-bar` has no side to be on and is drawn below, arbitrarily and consistently — the hue is
 * what identifies it, and putting a directionless mark on the direction-free side would just be a
 * third convention to remember.
 *
 * A `small-overlap` follows the same rule off the same field, which puts a bear one *above* its
 * bar even though nothing about it is a top. Read the placement as "which side of the price this
 * mark's direction points at", not as "a candidate turn": one rule for the side, and the hue says
 * which claim is being made.
 *
 * Deduped by `time`, `type` and side for the reason `reversalMarkers` is, even though this Pattern
 * visits each bar once and cannot collide: the chart wants times strictly ascending, the sort is
 * needed regardless, and a map that cannot collide costs nothing to keep.
 */
export function barMarkers(
  points: BarMark[],
  directions: Turn[],
  nextByTime: ReadonlyMap<number, { high: number, low: number }> | null,
): SeriesMarker<Time>[] {
  const seen = new Map<string, SeriesMarker<Time>>()

  for (const mark of points) {
    // A directionless mark is not filtered by a direction filter. Turning both checkboxes off
    // still leaves the inside bars, which is the honest reading of what the checkboxes ask.
    if (mark.direction !== null && !directions.includes(mark.direction)) continue
    if (nextByTime && !confirmed(mark, nextByTime.get(mark.time))) continue

    const position = mark.direction === 'bearish' ? 'aboveBar' as const : 'belowBar' as const

    seen.set(`${mark.time}:${mark.type}:${position}`, {
      time: mark.time as UTCTimestamp,
      position,
      shape: 'circle' as const,
      // Half the library's default dot, matching `reversalMarkers` — the two Series are meant to
      // be read against each other, and a size difference would read as a claim.
      size: 0.5,
      color: BAR_HUES[mark.type],
    })
  }

  return [...seen.values()].sort((a, b) => (a.time as number) - (b.time as number))
}
