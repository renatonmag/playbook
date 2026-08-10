/**
 * Market vocabulary — the raw price data the rest of the system reasons over.
 * See CONTEXT.md for the definitions these types encode.
 */

/** A tradable thing on B3, identified by its ticker. */
export type Ticker = string & { readonly __brand: "Ticker" };

export const asTicker = (raw: string): Ticker => raw.trim().toUpperCase() as Ticker;

export interface Instrument {
  readonly ticker: Ticker;
  readonly name: string;
}

/** The bar interval a Candle covers. */
export type Timeframe = "5m" | "15m" | "1h" | "1d";

/** Minutes per Timeframe — the ordering used when comparing resolutions. */
export const TIMEFRAME_MINUTES: Record<Timeframe, number> = {
  "5m": 5,
  "15m": 15,
  "1h": 60,
  "1d": 1440,
};

/** One OHLCV bar. `openedAt` is the instant the bar opened, in UTC. */
export interface Candle {
  readonly openedAt: Date;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
}

/**
 * An ordered run of Candles for one Instrument at one Timeframe, oldest first.
 * This is what detection reads; it never sees an Instrument without its Candles.
 */
export interface Series {
  readonly ticker: Ticker;
  readonly timeframe: Timeframe;
  readonly candles: readonly Candle[];
}
