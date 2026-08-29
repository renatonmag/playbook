import type { UTCTimestamp } from 'lightweight-charts'
import type { BarGap } from '~/types/pattern'
import type { PriceBox } from '~/utils/level-boxes'

/**
 * Whether price has since traded back through the whole band.
 *
 * A two-value reading of `BarGap.closed_by`, which is a bar or nothing. Named as a state because
 * that is what the sidebar filters on and what the colour says; the bar itself is still there for
 * anything that wants to know *when*.
 */
export type GapState = 'open' | 'closed'

/**
 * The state of one gap — the single place `closed_by` is tested for absence.
 *
 * A function over a field nothing else reads, so that "what open means" is written once. The
 * server already decided it; this only names the two outcomes.
 */
export function gapState(point: BarGap): GapState {
  return point.closed_by === null ? 'open' : 'closed'
}

/**
 * The hue a gap box is drawn in — light blue while it stands, red once price has been back through.
 *
 * Keyed on the **state and not the direction**, unlike every other per-point palette on this page.
 * The direction is already legible from the picture — a band the candles rose through sits below
 * them, one they fell through sits above — and it is a filter in the sidebar rather than something
 * the drawing has to distinguish. Whether a gap is still there is neither: it is invisible in the
 * band's position, and it is the thing that decides whether the box is a level ahead of price or a
 * record of one that is gone.
 *
 * Both are clear of everything else on the monitor: the page's four palette colours, the candles'
 * green and red, `EXTREME_HUES`' violet/cyan/lime, and `LegReversalsOverlay`'s sky, amber and pink.
 * The red is a rose rather than the candles' own `#dc2626`, so a washed-out band behind a down
 * candle does not read as part of the candle.
 */
export const GAP_HUES: Record<GapState, string> = {
  open: '#38bdf8',
  closed: '#e11d48',
}

/** What each state is, in words, for the sidebar's colour key and its list of pinned gaps. */
export const GAP_STATE_LABELS: Record<GapState, string> = {
  open: 'aberto',
  closed: 'fechado',
}

/**
 * What each direction is, in words, for the sidebar's list of pinned gaps.
 *
 * Names the gap and not the bars: a `bullish` gap is one price rose through, whatever the three
 * candles that made it are individually coloured.
 */
export const GAP_LABELS: Record<BarGap['direction'], string> = {
  bullish: 'gap de alta',
  bearish: 'gap de baixa',
}

/**
 * A drawn gap, plus the facts a picture states in position and a list has to state in words. The
 * primitive ignores all three; the sidebar is why they are here.
 */
export interface GapBox extends PriceBox {
  direction: BarGap['direction']
  state: GapState
  /**
   * When the closing bar opened, or `null` for an open gap.
   *
   * The one fact about a gap that the drawing cannot show: the box stops after four bars and the
   * bar that closed it is usually well to the right of that. Carried as the bar's `time` rather
   * than the whole Candle because the list prints a clock reading and nothing else needs the OHLC.
   */
  closedAt: number | null
}

/**
 * What a drawn gap is called, for the whole app: the bar its triple opens on.
 *
 * One gap per anchor bar — a triple either gaps or it does not, and there is no second kind — and
 * one `bar-gap` Series in the pipeline, so unlike `extremeSegmentId` this needs neither a role nor
 * a producer to tell one id from another. The anchor is the Point's own `time`, which is what makes
 * an id survive a pipeline re-run: the same triple mints the same id even when the window it was
 * found in has moved. Give it the producer the moment a second such Series is declared.
 */
export function gapBoxId(anchor: number): string {
  return `${anchor}`
}

/**
 * One box per gap, for the gaps that pass **both** sidebar filters, with the ones in `pinned` run
 * out to the current bar.
 *
 * Here rather than in the overlay for the reason `extremeSegments` is: the sidebar lists the same
 * gaps in words — a pinned gap's direction, its state, its two edges and its bar — and reading
 * those off a second traversal of the Points would be two places deciding what a gap is.
 *
 * The two filters are independent and both are applied here, so a caller asks for "bull, still
 * open" without knowing what either means to the drawing.
 *
 * Not deduplicated and unsorted, again for `extremeSegments`' reasons: overlapping triples are two
 * genuine Points that cannot collide on an anchor anyway, and a primitive draws in whatever order
 * it is handed.
 */
export function gapBoxes(
  points: BarGap[],
  directions: BarGap['direction'][],
  states: GapState[],
  pinned: ReadonlySet<string> = new Set(),
): GapBox[] {
  const boxes: GapBox[] = []

  for (const point of points) {
    if (!directions.includes(point.direction)) continue

    const state = gapState(point)
    if (!states.includes(state)) continue

    const id = gapBoxId(point.time)
    boxes.push({
      id,
      direction: point.direction,
      state,
      closedAt: point.closed_by?.time ?? null,
      // The anchor is the *first* bar of the triple, and the box starts there — see `SPAN` in
      // `BarGapOverlay`, which is what makes it cover the three forming bars plus one ahead.
      time: point.time as UTCTimestamp,
      // The band the Pattern measured, already ordered low-to-high whichever way the gap runs, so
      // nothing here branches on `direction` to find out which edge is which.
      top: point.top,
      bottom: point.bottom,
      // Red once it is gone, light blue while it stands — see `GAP_HUES` for why the state gets
      // the colour and the direction does not.
      color: GAP_HUES[state],
      // What a pin does to the drawing, decided here because this is the module that knows what a
      // pin is: the band keeps its height and its colour, and only its length changes.
      extend: pinned.has(id),
    })
  }

  return boxes
}
