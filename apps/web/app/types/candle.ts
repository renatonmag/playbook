/** The wire shape of `GET /candles`, mirrored from the API's `CandleOut`. */

/** Bar intervals the API accepts, lowercase — the `pattern_engine.Timeframe` vocabulary. */
export const TIMEFRAMES = ['5m', '15m', '1h', '1d'] as const

export type Timeframe = (typeof TIMEFRAMES)[number]

export function isTimeframe(value: unknown): value is Timeframe {
  return TIMEFRAMES.includes(value as Timeframe)
}

/**
 * How many seconds one Candle of each Timeframe covers.
 *
 * The one place the vocabulary's strings become arithmetic. A rule spanning several Candles has
 * to ask whether two of them are *adjacent*, and adjacency in a list is not adjacency in time:
 * `/shapes` omits Candles with no amplitude, and no response says where the session ended.
 * Comparing `time` differences against this is the only way to tell a genuine neighbour from a
 * bar on the far side of a weekend.
 *
 * `1d` is 86400 as a calendar day, which is what the Timeframe means; it is not a claim about
 * daylight saving.
 */
export const SECONDS: Record<Timeframe, number> = {
  '5m': 300,
  '15m': 900,
  '1h': 3600,
  '1d': 86400,
}

/**
 * One bar, already in the shape `series.setData(...)` wants: `time` is Unix seconds
 * (the library's `UTCTimestamp`) and prices are plain numbers. The API shapes it this way
 * on purpose, so nothing here converts anything.
 */
export interface Candle {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}
