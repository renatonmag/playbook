import type { UTCTimestamp } from 'lightweight-charts'

/**
 * An information tag the reader laid across the chart: a stretch of bars at one price, and an
 * identity. Nothing about how it is drawn — `TagMark` is the primitive's shape, and it carries the
 * selection, the hover and the draft flag, which are answers to "how does this look right now".
 *
 * **One price, not two ends**, and that is the whole of what makes a tag horizontal. The ruler's
 * ends each carry their own price because a ruler measures a move; a tag marks a stretch, and a
 * shape with a single price cannot be tilted by any drag, however it is written. Horizontality is
 * in the type rather than in a rule every gesture has to remember to keep.
 *
 * `from` and `to` are in the order they were placed, not sorted: a tag drawn right to left is the
 * same tag, and the drawing takes the min and the max.
 */
export interface Tag {
  id: string
  from: UTCTimestamp
  to: UTCTimestamp
  /** Where the bar's centre sits, read off the cursor — unsnapped, `RulerEnd.price`'s reason. */
  price: number
  /**
   * The strategy tags (`StrategyTag`, `docs/tags/strategies.json`) the reader filed this stretch
   * under, in the order picked. Ids, not names: a rename at `/tags` shows through here, and an id
   * whose strategy tag was since deleted is simply not drawn rather than kept as a stale name.
   */
  labels: string[]
}

/** Counted, not derived from geometry — `nextRulerId`'s reasoning applies word for word. */
let minted = 0

export function nextTagId(): string {
  minted += 1
  return `tag:${minted}`
}
