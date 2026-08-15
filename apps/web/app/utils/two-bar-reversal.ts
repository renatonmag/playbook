/**
 * `TwoBarReversal` — two consecutive Candles, each with a body dominating its own shadows, in
 * opposite colours, and of comparable size.
 *
 * Pure — no Vue, no fetch — for the same reason `rule.ts` is: this is the arithmetic the bench
 * rests on, and it has to be readable next to the numbers it produces. Like that file, it stays
 * in the client rather than behind a query parameter on `/shapes`: a route that took `k` would
 * put a detection rule on the server with nothing naming it.
 *
 * **This measures form, not location.** Nothing here asks where in the price action the bars sit,
 * so a pair in the middle of a range counts exactly as much as one at the top of a forty-bar
 * leg — and the first is what a sideways market is made of. At its defaults the rule marks about
 * 6% of the eligible pairs of `WIN@N`, which is the point: it is the cheap cut that takes a
 * history from 100% to something a person can look through, the same job the Forma rule does in
 * issue #11. It is not a signal, and a screen built on it should say so.
 *
 * Two dials, and they measure different things on purpose. `k` looks *inside* one Candle and is
 * scale-free; `similarity` compares the two Candles *to each other* and is not. Tightening one
 * barely moves what the other rejects, which is why both are worth having — unlike a floor on the
 * body, which `k` already implies and which was left out for that reason.
 */

import { SECONDS, type Timeframe } from '~/types/candle'
import type { Shape } from '~/types/shape'

/**
 * One occurrence: the run of Candles it covers, anchored at its last one.
 *
 * `time` and `since` follow the convention `CONTEXT.md` sets for an extended Pattern — `time` at
 * the Candle where the occurrence completes, `since` at the one where it begins. A plain pair has
 * two Candles; a run of alternating bars collapses into one occurrence covering all of them,
 * rather than into one entry per pair, which would show the same congestion several times over.
 */
export interface Occurrence {
  /** The first Candle of the run. */
  since: number
  /** The last Candle of the run — where the occurrence completes. */
  time: number
  /** Every Candle of the run, oldest first. Always at least two. */
  shapes: Shape[]
}

/** How the counts break down, for a screen that has to explain what it is showing. */
export interface Counts {
  /** Pairs that could have matched — adjacent in time and in the same session. */
  eligible: number
  /** Pairs that did match. */
  pairs: number
  /** Occurrences, after chained pairs are merged. Always `<= pairs`. */
  occurrences: number
  /** How many occurrences are 2 Candles long, 3, 4… keyed by length in Candles. */
  lengths: Map<number, number>
}

/** How far the body must beat the larger shadow. */
export const DEFAULT_K = 1

/**
 * How alike the two bodies must be in size, as `min / max`.
 *
 * On by default, unlike `k`'s neutral 1, because the pairs worth looking at turned out to be the
 * ones whose two pushes are comparable — a big shove one way answered by a token nudge back is not
 * a reversal, however clean each bar looks on its own.
 */
export const DEFAULT_SIMILARITY = 0.7

/**
 * Whether the body dominates the larger of the two shadows.
 *
 * `>=` rather than `>`, which is not free: in the `5m` history of `WIN@N` about 2% of Candles sit
 * exactly on the line, and each pair reads two of them.
 *
 * Note this bounds the body from below all by itself. With `u + l + b === 1`, the larger shadow
 * is at least `(1 - b) / 2`, so `b >= k * (1 - b) / 2` gives `b >= k / (k + 2)` — a third at
 * `k = 1`. `impliedBodyMin` is that number, shown on screen so nobody adds a floor that the dial
 * already guarantees.
 */
export function dominates(shape: Shape, k: number): boolean {
  return shape.body >= k * Math.max(shape.upper, shape.lower)
}

/** The floor on the body that a given `k` enforces on its own. */
export function impliedBodyMin(k: number): number {
  return k / (k + 2)
}

/**
 * The body in the Instrument's own points — the price actually travelled from open to close.
 *
 * The one place in this file where size enters. Everything else here is scale-free, and it has to
 * stay that way: `body` alone is a fraction of its *own* bar, so two bodies of 0.6 are equally
 * dominant and may be 500 points and 40 points. Comparing the fractions instead is not a stricter
 * version of this — it is a dial that does nothing, because `dominates` already pins every body
 * above `k / (k + 2)` and the fractions then bunch against 1.
 */
export function bodyPoints(shape: Shape): number {
  return shape.body * shape.amplitude
}

/**
 * Whether the two bodies are close enough in size — `min / max >= similarity`.
 *
 * `0` accepts anything; `1` demands they be identical. This is the only criterion here that
 * compares the two Candles *to each other*: `dominates` asks each bar about its own shadows and
 * cannot see across the pair.
 *
 * The zero guard is not reachable through the colour test — `shape_of` leaves `bear` false for a
 * bodyless Candle, so two of them share a colour and never form a pair — but this function should
 * not lean on an invariant that lives in another file, and `k = 0` is a value the field accepts.
 */
export function alike(a: Shape, b: Shape, similarity: number): boolean {
  const first = bodyPoints(a)
  const second = bodyPoints(b)
  const larger = Math.max(first, second)
  if (larger <= 0) return true
  return Math.min(first, second) / larger >= similarity
}

/**
 * The UTC calendar day a Candle opened on.
 *
 * **UTC, deliberately, not the browser's day.** The stored timestamps land on UTC hours 09–18,
 * so a browser at UTC+9 would read them as 18:00–03:00 and split sessions down the middle — and
 * the counts on this bench would then depend on where the person reading it is sitting. Date
 * *labels* stay local, as they are on `/rules`; for this data the two agree, because no session
 * crosses midnight in either frame.
 */
function utcDay(time: number): number {
  return Math.floor(time / 86_400)
}

/**
 * Whether `b` is the Candle that immediately follows `a`.
 *
 * Two separate claims, both required. Adjacency in the array is not adjacency in time: `/shapes`
 * omits Candles with no amplitude, and nothing in the response marks where a session ended. On
 * `1h` this matters a great deal — one in ten array-adjacent pairs is really an overnight or a
 * weekend jump, and a "reversal" spanning a weekend did not see the gap that opened it.
 *
 * The same-day test is redundant against today's data, where every non-contiguous step is already
 * a session boundary. It is here for the data that does not exist yet: an after-market session
 * crossing midnight, or a flat Candle dropped from the middle of a session.
 */
export function adjacent(a: Shape, b: Shape, timeframe: Timeframe): boolean {
  return b.time - a.time === SECONDS[timeframe] && utcDay(a.time) === utcDay(b.time)
}

/** Whether these two Candles are a reversal pair. Assumes they are already known to be adjacent. */
function reverses(a: Shape, b: Shape, k: number, similarity: number): boolean {
  return a.bear !== b.bear && dominates(a, k) && dominates(b, k) && alike(a, b, similarity)
}

/**
 * Every occurrence in a history, oldest first.
 *
 * Chained pairs are merged. If `(1,2)` matches and `(2,3)` matches, then bars 1, 2 and 3 all have
 * dominant bodies and alternate in colour — one alternating run, not two reversals. Emitting both
 * would list the same congestion twice, and the longest of them run to eight Candles.
 *
 * `similarity` is applied per pair rather than across the whole run, which is what lets it *split*
 * a run at the link where the two bodies stop matching instead of discarding the run whole. That
 * is most of its value: raising it from 0 to 0.8 takes the runs of 3 or more bars in the `5m`
 * history from 536 down to 60, because congestion is exactly where body sizes wander.
 */
export function occurrences(
  shapes: Shape[],
  k: number,
  similarity: number,
  timeframe: Timeframe,
): Occurrence[] {
  const found: Occurrence[] = []
  let run: Shape[] = []

  const close = () => {
    if (run.length >= 2) found.push({ since: run[0]!.time, time: run.at(-1)!.time, shapes: run })
    run = []
  }

  for (let i = 0; i < shapes.length - 1; i++) {
    const a = shapes[i]!
    const b = shapes[i + 1]!

    if (adjacent(a, b, timeframe) && reverses(a, b, k, similarity)) {
      // The run is non-empty only when the previous pair matched too, and then its tail is `a` —
      // every other path has closed it. So pushing `b` alone extends the chain, and `a` is only
      // needed to open a new one.
      if (run.length === 0) run.push(a)
      run.push(b)
    }
    else {
      close()
    }
  }
  close()

  return found
}

/**
 * What the rule marks and what it had to choose from.
 *
 * `eligible` is the honest denominator: pairs the rule could have marked, which is fewer than
 * `shapes.length - 1` by every session boundary in the history.
 */
export function counts(
  shapes: Shape[],
  k: number,
  similarity: number,
  timeframe: Timeframe,
): Counts {
  let eligible = 0
  let pairs = 0

  for (let i = 0; i < shapes.length - 1; i++) {
    const a = shapes[i]!
    const b = shapes[i + 1]!
    if (!adjacent(a, b, timeframe)) continue
    eligible++
    if (reverses(a, b, k, similarity)) pairs++
  }

  const lengths = new Map<number, number>()
  const found = occurrences(shapes, k, similarity, timeframe)
  for (const one of found) lengths.set(one.shapes.length, (lengths.get(one.shapes.length) ?? 0) + 1)

  return { eligible, pairs, occurrences: found.length, lengths }
}
