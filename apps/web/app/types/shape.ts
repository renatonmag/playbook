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
}

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
export function facing(shape: Shape, direction: Direction): [number, number] {
  return direction === 'baixa' ? [shape.upper, shape.lower] : [shape.lower, shape.upper]
}
