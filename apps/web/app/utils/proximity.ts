/**
 * The ladder that says how near a bar has to get to a line before the near miss counts.
 *
 * `line-relations` reports that a bar *reached* a pinned line, and reaching it means a wick
 * containing the price with no tolerance at all. A bar that ran to within a few points and turned
 * there said something the Series had no way to say. What was missing is not a tolerance but a
 * scale: fifty points is a near miss inside a thousand-point leg and an unrelated bar inside a
 * two-hundred-point one.
 *
 * So a rule is a ladder. Each rung claims the legs from its own size upward and says what fraction
 * of such a leg counts as near — `{ points: 1000, trigger: 0.05 }` reads "for moves of a thousand
 * points and up, near is five percent", and a thousand-point leg then reaches fifty.
 *
 * **Unlike the Forma rule, none of this is evaluated here.** `rule.ts` carries `marks` because the
 * bench judges Shapes the browser already holds; there is no browser-side twin of this one and
 * there should not be. The leg a bar sits in is a zigzag leg, sliced in the engine out of the whole
 * window of bars, and re-deriving that split here to decide what "near" means would be a second
 * answer to a question the server already answers — the exact cost `shape.py` and `rule.ts`
 * document as paid reluctantly, volunteered for a second time. So this module is the *shape* of
 * the rule and its trip to the wire, and nothing else.
 *
 * It travels in the `POST` body rather than on the query string, which is the one way it differs
 * from `toPatternQuery`'s eight numbers, and it is a fact about a list rather than about the rule:
 * a URL has a length and a ladder somebody keeps adding rungs to does not. See
 * `playbook_api.lines_body`, which refuses the four things this module does not.
 */

/** One rung: the legs it claims, and what near means for them. */
export interface ProximityLevel {
  /** The smallest leg, in points, this rung speaks for. */
  points: number
  /**
   * The fraction of a leg's size that counts as near — `0.05` is five percent, the units the
   * engine reads and `FormaRule`'s thresholds are already in. The editor shows a percentage and
   * converts where it renders one, so there is one reading of this number everywhere else.
   */
  trigger: number
}

/** The whole ladder. A plain array: the server names the rule, so there is no name to keep here. */
export type ProximityRule = ProximityLevel[]

/**
 * A rung to start from when somebody adds one.
 *
 * Deliberately not a ladder that would do anything: a new row lands with the sizes this market's
 * legs actually run in, and a `trigger` a person will overwrite before it ever reaches the wire.
 */
export function emptyLevel(): ProximityLevel {
  return { points: 1000, trigger: 0.05 }
}

/**
 * The ladder as the body wants it: ascending, with the rungs a person has not finished typing
 * dropped.
 *
 * Total, the way `parseRule` is total, and for a sharper version of its reason. The editor lets a
 * field be emptied mid-edit, so a row can hold a `NaN` or a zero between two keystrokes; a run
 * started by an unrelated pin in that moment would carry it. Every refusal here has a twin in
 * `to_proximity` that answers 400 — this is what stops a half-typed row from being the thing that
 * gets refused, and it is the only place the two lists can differ.
 *
 * Sorting here as well as on the server is not duplication for its own sake: the server sorts
 * because the engine walks the rungs in order, and this sorts because the body it sends should be
 * the ladder the screen shows, read top to bottom.
 */
export function toProximityBody(levels: ProximityRule): ProximityLevel[] {
  return levels
    .filter(
      level =>
        Number.isFinite(level.points)
        && Number.isFinite(level.trigger)
        && level.points > 0
        && level.trigger > 0
        && level.trigger <= 1,
    )
    .sort((one, other) => one.points - other.points)
}

/**
 * What makes one ladder a different question from another, for a cache key.
 *
 * Read off the *body* and not off the rows, so the two rules that send the same request share a
 * key — a half-typed row that `toProximityBody` drops is not a new question, and the rung order on
 * screen is not one either.
 */
export function proximityKey(levels: ProximityRule): string {
  return toProximityBody(levels)
    .map(level => `${level.points}:${level.trigger}`)
    .join(',')
}

/**
 * Whatever was in storage, as a ladder.
 *
 * Total for the reason `parseRule` is: this is hand-editable storage in practice, and a ladder
 * written by an older version of this page is the ordinary case rather than the exotic one.
 * Anything unreadable becomes no ladder at all, which is a real setting — the fourth kind off —
 * and not a failure the page has to report.
 */
export function parseProximity(raw: unknown): ProximityRule {
  if (!Array.isArray(raw)) return []

  return raw.flatMap((entry): ProximityLevel[] => {
    if (typeof entry !== 'object' || entry === null) return []

    const { points, trigger } = entry as Record<string, unknown>
    if (typeof points !== 'number' || typeof trigger !== 'number') return []
    if (!Number.isFinite(points) || !Number.isFinite(trigger)) return []

    return [{ points, trigger }]
  })
}
