/**
 * The Detection -> Validation -> Signal -> Alert pipeline.
 * Each stage is a distinct type on purpose: a Detection is a candidate, and only a
 * Validation that accepts it turns it into something the user is shown.
 */

import type { Candle, Series, Ticker, Timeframe } from "./market.ts";

/** A named, reusable rule for recognising a shape in a Series. A definition, not an occurrence. */
export interface Pattern {
  readonly id: PatternId;
  readonly name: string;
  /** Minimum number of Candles the rule needs to produce a verdict. */
  readonly minimumCandles: number;
  readonly detect: (series: Series) => readonly Detection[];
}

export type PatternId = string & { readonly __brand: "PatternId" };

/** One occurrence of a Pattern in a Series. Unvalidated — a candidate only. */
export interface Detection {
  readonly patternId: PatternId;
  readonly ticker: Ticker;
  readonly timeframe: Timeframe;
  /** The Candle the Pattern completed on. */
  readonly at: Candle;
  /** The Candles the Pattern matched over, for the LLM to reason about. */
  readonly window: readonly Candle[];
}

/** The LLM's verdict on a Detection. */
export interface Validation {
  readonly accepted: boolean;
  readonly reasoning: string;
  /** The model's stated confidence, 0-1. Advisory — not a probability of profit. */
  readonly confidence: number;
  readonly validatedAt: Date;
}

/** A Detection whose Validation accepted it. The only thing considered actionable. */
export interface Signal {
  readonly detection: Detection;
  readonly validation: Validation;
}

/** A user-configured standing rule. Persists until the user removes it. */
export interface Alarm {
  readonly id: string;
  readonly ticker: Ticker;
  readonly timeframe: Timeframe;
  readonly patternId: PatternId;
  readonly enabled: boolean;
}

/** What the user sees: a Signal that matched one of their Alarms. */
export interface Alert {
  readonly id: string;
  readonly alarmId: Alarm["id"];
  readonly signal: Signal;
  readonly raisedAt: Date;
  readonly readAt: Date | null;
}

/** True when the Signal is one this Alarm asked to be told about. */
export const alarmMatches = (alarm: Alarm, signal: Signal): boolean =>
  alarm.enabled &&
  alarm.ticker === signal.detection.ticker &&
  alarm.timeframe === signal.detection.timeframe &&
  alarm.patternId === signal.detection.patternId;
