/** The wire shape of `GET /candles`, mirrored from the API's `CandleOut`. */

/** Bar intervals the API accepts, lowercase — the `pattern_engine.Timeframe` vocabulary. */
export const TIMEFRAMES = ['5m', '15m', '1h', '1d'] as const

export type Timeframe = (typeof TIMEFRAMES)[number]

export function isTimeframe(value: unknown): value is Timeframe {
  return TIMEFRAMES.includes(value as Timeframe)
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
