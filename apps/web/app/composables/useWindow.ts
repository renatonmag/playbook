import type { MaybeRefOrGetter } from 'vue'
import type { Timeframe } from '~/types/candle'

/** An explicit `[from, to]`, ISO-8601 with offset — the shape both read routes take. */
export interface Window {
  from: string
  to: string
}

/**
 * How far back each timeframe looks, in days.
 *
 * These are not cosmetic. The routes cap a response at 1000 bars and answer 400 rather than
 * truncating, so a window has to stay under that ceiling. B3 trades ~7h a day, so a 5m session
 * is ~84 bars: five days leaves headroom, thirty would not.
 */
const LOOKBACK_DAYS: Record<Timeframe, number> = {
  '5m': 5,
  '15m': 15,
  '1h': 60,
  '1d': 3 * 365,
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * A window a monitor view makes its requests from.
 *
 * This used to be *the* window, one per view and shared by both round trips, because `/candles`
 * and `/patterns` computing their own `now` could draw the chart and the zigzag from different
 * bars — and a disagreement of one bar at the live edge reads as an algorithm defect rather than
 * as a race. That is no longer how the invariant is held. `/monitor` now opens two windows: the
 * chart's, fixed at what it loaded and extended thereafter by the socket, and the pipeline's,
 * which advances. They agree because the socket delivers to the chart every bar the advancing
 * window reaches, so the two still end on the same bar without ever having shared a `new Date()`.
 *
 * `at` pins where the window ends — an ISO instant chosen by the timepicker, or `null` for the
 * live edge. Only the end is chosen: `from` stays derived from `LOOKBACK_DAYS`, so a hand-picked
 * window cannot ask for more bars than the routes will answer.
 *
 * `epoch` is what makes a live window move. Without it this computed's only dependencies are
 * `timeframe` and `at`, so on a live view it evaluates `new Date()` once and caches it for the
 * life of the page — the reason the Patterns sat still while the candles streamed. Reading a
 * counter that bumps on each new bar puts the clock back in the dependency graph, at a cadence
 * something else decides. See `useBarClock`.
 */
export function useWindow(
  timeframe: MaybeRefOrGetter<Timeframe>,
  at?: MaybeRefOrGetter<string | null>,
  epoch?: MaybeRefOrGetter<number>,
) {
  return computed<Window>(() => {
    const pinned = toValue(at)
    // Read for the dependency alone, and only meaningful when unpinned: a pinned window is the
    // same instant however many bars have opened since.
    toValue(epoch)
    const to = pinned ? new Date(pinned) : new Date()
    const from = new Date(to.getTime() - LOOKBACK_DAYS[toValue(timeframe)] * DAY_MS)

    // `toISOString()` ends in `Z`; the routes reject naive datetimes with a 400.
    return { from: from.toISOString(), to: to.toISOString() }
  })
}
