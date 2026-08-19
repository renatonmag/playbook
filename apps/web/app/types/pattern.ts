/** The wire shape of `GET /patterns`, mirrored from the API's `PatternsOut`. */

import type { Timeframe } from '~/types/candle'

/** Who a Series is: the Pattern that made it, for which instrument, at which timeframe. */
export interface SeriesIdentity {
  producer: string
  instrument: string
  timeframe: Timeframe
}

/**
 * Every Point carries the OHLCV of the bar it occurred on — a Point *is* a candle plus a
 * payload. `time` is Unix seconds, same as `Candle`, so nothing here converts anything.
 */
export interface PatternPoint {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

/** One vertex of the zigzag, plus the bar where the leg ending in it began. */
export interface ZigZagPivot extends PatternPoint {
  price: number
  direction: 'high' | 'low'
  /** Often `null`: the algorithm records far fewer leg starts than it has legs. */
  since: PatternPoint | null
}

/**
 * One bar where a leg ended, and which of its extremes the vertex is.
 *
 * No `since`, unlike `ZigZagPivot`: the leg ending here began at the previous Point of the same
 * Series, so the line already joins it.
 */
export interface LegMark extends PatternPoint {
  price: number
  direction: 'high' | 'low'
}

/**
 * One leg, where it turned, and the bars that followed it.
 *
 * `bars[0]` is the opening Pivot and `end` indexes the closing one, both inclusive, so the
 * vertex-to-vertex segment is `bars.slice(0, end + 1)` and the tail this Pattern exists for is
 * `bars.slice(end + 1)`. `since` is where the leg *actually* turned — at or after `0`, and below
 * `end` whenever a turn was recorded — so `bars.slice(since, end + 1)` is the leg as it ran.
 *
 * Note `bars[bars.length - 1]` is a lookahead bar, not the turn — the closing Pivot is at `end`.
 */
export interface LegWindow extends PatternPoint {
  /** An array on the wire: the Python tuple serializes as a list. */
  bars: PatternPoint[]
  /**
   * Equal to `end` when the zigzag recorded no turn for this leg — a sentinel, not a claim that
   * the leg turned on its close. A recorded turn is always strictly below `end`.
   */
  since: number
  end: number
}

/**
 * One bar inside a leg that a reversal filter marked.
 *
 * Not a Point of any Series — these arrive nested in `LegReversals.found`, so `time` here is just
 * the bar's own, and it is the field the whole Pattern exists to produce: the timestamp to look up
 * on the real chart.
 */
export interface LegBar extends PatternPoint {
  /** Index into `bars` of the `LegWindow` at the same anchor. Meaningless without it. */
  at: number
  /**
   * Which filter marked it. `two-bar` means the bar belongs to a matching pair — with the bar
   * before it or the one after — listed once either way, so an alternating run reads as several
   * entries with contiguous `at` rather than one per pair.
   */
  type: 'two-bar' | 'reversal-bar'
}

/**
 * One leg's marked bars, anchored where its `LegWindow` is.
 *
 * Carries the anchor and the list and nothing else: `since`, `end` and the leg's direction are on
 * the `LegWindow` Point at the same `time`, and restating them would be two Series claiming one
 * fact. An empty `found` is a leg that matched nothing, which is not the same as a leg missing.
 */
export interface LegReversals extends PatternPoint {
  /** An array on the wire: the Python tuple serializes as a list. */
  found: LegBar[]
}

export interface SeriesEnvelope<TPoint extends PatternPoint = PatternPoint> {
  identity: SeriesIdentity
  points: TPoint[]
}

export interface PatternResponse {
  /** Keyed by producer, e.g. `zig-zag(depth=5,reads=5m,emits=5m)`. */
  series: Record<string, SeriesEnvelope>
  /** Producers that ran and raised. Empty is the healthy case. */
  failed: string[]
}

/**
 * The class part of a producer key — `zig-zag(depth=5,…)` becomes `zig-zag`.
 *
 * This is what picks the overlay component. The parameters stay out of it on purpose: two
 * zigzags at different depths are two Series drawn the same way.
 */
export function producerName(producer: string): string {
  return producer.split('(')[0] ?? producer
}
