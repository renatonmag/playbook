/** The wire shape of `GET /shapes`, mirrored from the API's `ShapeOut`. */

/**
 * One Candle's proportions, as fractions of its amplitude. `upper + lower + body === 1`.
 *
 * Direction-neutral on purpose, exactly like `pattern_engine.Shape`: which shadow is the
 * "favourable" one depends on the reversal being looked for, and that is the rule's question,
 * not the measurement's. `facing` answers it.
 */
export interface Shape {
  time: number
  upper: number
  lower: number
  body: number
  bear: boolean
  /**
   * `high - low`, in the Instrument's own points — outside the sum, and the only field carrying
   * a magnitude.
   *
   * Nothing about the *form* may read it: two Candles with these proportions and different
   * amplitudes are the same Shape, which is the whole of issue #10. It exists so a screen
   * drawing several bars side by side can give them a common scale, because proportions alone
   * make a 500-point bar and a 40-point one identical.
   */
  amplitude: number
}

/**
 * A Shape stripped of everything that is not form — no anchor, no size.
 *
 * This is what a rule actually reads, and what a bar drawn from proportions actually needs. It
 * is named because two things need it: a synthetic bar, which the market never produced and so
 * has neither a `time` nor an `amplitude`, and `ShapeCandle`, which draws from proportions
 * alone. Every real `Shape` is assignable to it.
 */
export type Form = Pick<Shape, 'upper' | 'lower' | 'body' | 'bear'>

/** Which reversal a rule looks for. The bullish bar is the vertical mirror of the bearish one. */
export const DIRECTIONS = ['baixa', 'alta'] as const

export type Direction = (typeof DIRECTIONS)[number]

/**
 * `[wf, wc]` — the favourable shadow and the counter one, for this direction.
 *
 * A bearish reversal bar rejects higher prices, so its favourable shadow is the upper one. This
 * single swap is what lets one rule serve both directions, and it must stay identical to
 * `Shape.facing` in the engine — the bench would otherwise judge a rule the Pattern never runs.
 */
export function facing(shape: Form, direction: Direction): [number, number] {
  return direction === 'baixa' ? [shape.upper, shape.lower] : [shape.lower, shape.upper]
}
