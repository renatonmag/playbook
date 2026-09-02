import type { UTCTimestamp } from 'lightweight-charts'
import type { TrendLine } from '~/types/pattern'
import type { TrendSegment } from '~/utils/trend-segments'

/**
 * Which side a trend line runs along — the Point's own field, in `Pivot`'s vocabulary.
 *
 * Not `bullish`/`bearish`, and deliberately not folded into the bull/bear filter every directional
 * Pattern shares: those name a *move*, this names an *extreme*. A ceiling drawn along the tops is
 * not a bearish line — price rising into it is the interesting case — and one row of checkboxes
 * answering two different questions would say so.
 */
export type TrendSide = TrendLine['direction']

/** What each side is, in words, for the sidebar's filter and its list of pinned lines. */
export const TREND_LABELS: Record<TrendSide, string> = {
  high: 'topo',
  low: 'fundo',
}

/**
 * What a drawn trend line is called, for the whole app: its two bars and the side it runs along.
 *
 * Both ends, unlike `gapBoxId`, which needs only its anchor. A pivot is the start of *several*
 * lines here — the fan is the whole point — so an anchor alone names a handful of them at once.
 * The side is not redundant either: `simple-leg` marks normally alternate but two can merge onto
 * one bar, so a single pair of bars can in principle carry both a ceiling and a floor.
 *
 * The times are the Points' own, which is what makes an id survive a pipeline re-run: the same two
 * pivots mint the same id even when the window they were found in has moved. A pin therefore
 * follows its line rather than being frozen to a price, and a line that leaves the window takes
 * its pin off the list with it — the honest reading, since there is no such line any more.
 *
 * No producer prefix, for `gapBoxId`'s reason: the pipeline declares one `trend-lines` Series.
 * Give it one the moment a second is declared, as `extremeSegmentId` had to.
 */
export function trendSegmentId(from: number, to: number, side: TrendSide): string {
  return `${from}:${to}:${side}`
}

/**
 * A drawn trend line, plus the facts a picture states in position and a list has to state in words.
 * The primitive ignores all three; the sidebar is why they are here.
 */
export interface DrawnTrend extends TrendSegment {
  side: TrendSide
  /** The two prices the line passes through, for the list. The primitive reads them off `from`/`to`. */
  fromPrice: number
  toPrice: number
  /** Either endpoint is the running leg's mark, so this line moves with every bar. */
  provisional: boolean
}

/**
 * One segment per line, for the lines the sidebar's side filter keeps, with the ones in `pinned`
 * run out along their own slope to the current bar.
 *
 * Here rather than in the overlay for the reason `gapBoxes` and `extremeSegments` are: the sidebar
 * lists the same lines in words — a pinned line's side, its two prices and its two bars — and
 * reading those off a second traversal of the Points would be two places deciding what a line is.
 *
 * `color` is the Series' palette colour, handed in rather than looked up. This is the one shaping
 * function on the page that takes one, and the argument is `GAP_HUES`' own run the other way: a
 * gap's *state* gets a hue because it is invisible in the drawing, while a trend line's side is the
 * most visible thing about it — a ceiling sits above the candles and a floor below them. Colouring
 * that would spend two hues from an already crowded palette to repeat what the picture says, and
 * would cost the sidebar swatch its meaning as a legend for the checkbox.
 *
 * Not deduplicated and unsorted, for the reasons `gapBoxes` gives: two Points cannot collide on a
 * pair of endpoints, and a primitive draws in whatever order it is handed.
 */
export function trendSegments(
  points: TrendLine[],
  sides: TrendSide[],
  color: string,
  pinned: ReadonlySet<string> = new Set(),
): DrawnTrend[] {
  const segments: DrawnTrend[] = []

  for (const point of points) {
    if (!sides.includes(point.direction)) continue

    const id = trendSegmentId(point.time, point.to.time, point.direction)
    segments.push({
      id,
      side: point.direction,
      // The near pivot and the far one, each a real bar of the window. The primitive draws
      // straight between the two and, when pinned, carries that slope onward.
      from: { time: point.time as UTCTimestamp, price: point.price },
      to: { time: point.to.time as UTCTimestamp, price: point.to.price },
      fromPrice: point.price,
      toPrice: point.to.price,
      provisional: point.provisional,
      color,
      // What selecting a line does to the drawing, decided here because this is the module that
      // knows what a pin is: the line keeps its slope, its weight and its colour, and only its
      // length changes — it runs on to the current candle.
      extend: pinned.has(id),
    })
  }

  return segments
}
