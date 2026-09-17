import type { SeriesMarker, Time, UTCTimestamp } from 'lightweight-charts'
import type { Retracement } from '~/types/pattern'

/**
 * What a `retracement` Series draws: a percentage beside the pivot that closes each leg.
 *
 * Lives here rather than in the overlay for the reason `extremeSegments` does — the component owns
 * the chart plumbing and this owns what the drawing *means*, which includes the Portuguese. The
 * primitive it feeds (the shared marker plugin) knows about neither.
 */

/**
 * The fraction as a reader wants it: `62%`, whole percent, Brazilian.
 *
 * Whole percent because the number is a *reading* and not a measurement to be parsed — one decimal
 * would imply the underlying pivots are that precise, and they are not: the turn is the deepest
 * pivot the detector kept, not the deepest price traded. See the Pattern's docstring.
 */
const PERCENT = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 0 })

export function retracementLabel(ratio: number): string {
  return PERCENT.format(ratio)
}

/**
 * One marker per measured leg — or just the one on `hovered`, which is the default.
 *
 * **Points with no measurement produce nothing.** There is no number for them, and a marker saying
 * so would be one per leg on a chart that already carries two of these Series.
 *
 * `always` off is the sidebar's default, and the reason is density: the simple-leg Series marks a
 * leg roughly every three bars, so a percentage at every pivot over a five-day window is a wall of
 * numbers. `hovered` is a bar time, so the test is an equality and not a geometry — the question
 * being answered is "what is the retracement at this candle", which the crosshair already names.
 *
 * The number sits **past** the extreme it belongs to — above a top, below a bottom — so it never
 * covers the candles that produced it. Two Series putting a number on one bar stack rather than
 * overlap, which is the shared marker plugin's whole reason; see `createMarkerRegistry`.
 */
export function retracementMarkers(
  points: Retracement[],
  color: string,
  hovered: number | null,
  always: boolean,
): SeriesMarker<Time>[] {
  const markers: SeriesMarker<Time>[] = []

  for (const point of points) {
    if (point.measured === null) continue
    if (!always && point.time !== hovered) continue

    markers.push({
      time: point.time as UTCTimestamp,
      position: point.direction === 'high' ? 'aboveBar' as const : 'belowBar' as const,
      // A dot, not an arrow: the glyph is an anchor tying the text to its pivot, and an arrow
      // would claim a side the number is not about. The `bars` and `general-direction` overlays
      // own the two shapes that do mean something.
      shape: 'circle' as const,
      color,
      text: retracementLabel(point.measured.ratio),
    })
  }

  return markers
}
