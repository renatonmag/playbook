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
 * The one window a monitor view is built from, shared by every request it makes.
 *
 * Single because `/candles` and `/patterns` are separate round trips: if each computed its own
 * `now`, the chart and the zigzag could be drawn from different bars, and a disagreement of one
 * bar at the live edge would look like an algorithm defect. Replacing this with a timepicker
 * closes even that gap, since `to` stops being "now".
 */
export function useWindow(timeframe: MaybeRefOrGetter<Timeframe>) {
  return computed<Window>(() => {
    const to = new Date()
    const from = new Date(to.getTime() - LOOKBACK_DAYS[toValue(timeframe)] * DAY_MS)

    // `toISOString()` ends in `Z`; the routes reject naive datetimes with a 400.
    return { from: from.toISOString(), to: to.toISOString() }
  })
}
