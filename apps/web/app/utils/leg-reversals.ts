import type { SeriesMarker, Time, UTCTimestamp } from 'lightweight-charts'
import type { LegBar, LegReversals } from '~/types/pattern'

/**
 * The hues, matching what `LegReversalsVerify` uses for the same types — sky, amber and pink.
 *
 * Kept next to `reversalMarkers` because the marker's colour *is* which filter marked its bar, and
 * the mapping is one fact per key. Re-exported so the overlay does not restate it.
 */
export const REVERSAL_HUES: Record<LegBar['type'], string> = {
  'two-bar': '#0ea5e9',
  'reversal-bar': '#f59e0b',
  'inside-bar': '#ec4899',
}

/**
 * Whether a mark's next bar confirmed the turn the mark is a candidate for.
 *
 * Direction is the leg's **own** move, so:
 * - a `bullish` leg tops out, the marks are bear-turn candidates → confirmed when the next bar's
 *   low dips below the marked bar's low;
 * - a `bearish` leg bottoms out, the marks are bull-turn candidates → confirmed when the next
 *   bar's high rises above the marked bar's high.
 *
 * A missing next bar (last bar in the loaded window, live edge before the following bar has
 * opened) is *undecided* and the caller keeps the mark, following the `provisional` convention
 * every other overlay on this page uses.
 */
function confirmed(bar: LegBar, next: { high: number, low: number } | undefined, legDirection: LegReversals['direction']): boolean {
  if (!next) return true
  return legDirection === 'bullish' ? next.low < bar.low : next.high > bar.high
}

/**
 * The reversal-bar dots the overlay draws, keyed by leg direction so the side the dot sits on and
 * the confirmation rule that judges it come from one place.
 *
 * `directions` is the sidebar's bull/bear filter; `nextByTime`, when non-null, is the confirmation
 * filter. Both are here rather than in the overlay for the reason `gapBoxes` and `extremeSegments`
 * are: the sidebar reasons about the same marks, and reading them off a second traversal would be
 * two places deciding what a reversal is.
 *
 * Deduped by `time`, `type` **and** side because consecutive legs overlap and can mark the same
 * bar from both ends — see the module comment on `asMarkers` in the overlay's history for the
 * full argument. The chart wants times strictly ascending, hence the sort.
 */
export function reversalMarkers(
  points: LegReversals[],
  directions: LegReversals['direction'][],
  nextByTime: ReadonlyMap<number, { high: number, low: number }> | null,
): SeriesMarker<Time>[] {
  const seen = new Map<string, SeriesMarker<Time>>()

  for (const point of points) {
    if (!directions.includes(point.direction)) continue

    const position = point.direction === 'bullish' ? 'aboveBar' as const : 'belowBar' as const

    for (const bar of point.found) {
      if (nextByTime && !confirmed(bar, nextByTime.get(bar.time), point.direction)) continue

      seen.set(`${bar.time}:${bar.type}:${position}`, {
        time: bar.time as UTCTimestamp,
        position,
        shape: 'circle' as const,
        color: REVERSAL_HUES[bar.type],
      })
    }
  }

  return [...seen.values()].sort((a, b) => (a.time as number) - (b.time as number))
}
