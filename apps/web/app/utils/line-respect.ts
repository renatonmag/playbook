import type { UTCTimestamp } from 'lightweight-charts'
import type { LineRespect } from '~/types/pattern'
import type { PillShape, PillSide, RespectPill } from '~/utils/respect-pills'

/**
 * Turning `line-respect` Points into the pills the chart draws.
 *
 * The Pattern-side half of `respect-pills.ts`, split the way `bar-gaps.ts` and `level-boxes.ts` are
 * split: the primitive knows about rectangles and pixels, this knows what a respect group is. What
 * crosses between them is `RespectPill`, and the three things this file works out that the
 * primitive cannot — which side of the screen a pill goes on, which price it keeps clear of, and
 * which lane it sits in.
 */

/**
 * The hue a pill is drawn in — green where the line held from above, a light red where it held
 * from below. The colour names the *respect*, not the side of the screen the pill ends up on; see
 * `PLACEMENT` for why those are opposites.
 *
 * The one palette on this page that is *not* chosen clear of the candles, and that is the point.
 * Everything else drawn here is a level, a band or a line, and has to be told apart from price;
 * a pill is a verdict *about* a run of candles, sitting in the empty air past their extreme with
 * nothing else at that height. Borrowing the candles' own green says "these bars held" in the
 * vocabulary the chart already speaks.
 *
 * Both are the light 400-weight shades rather than the candles' `#16a34a` and `#dc2626`, and both
 * carry `99` — 60% — of alpha. A pill is 10px of solid fill laid across a run of bars, and at full
 * strength it reads as a second object in the picture rather than as a note about the first; the
 * transparency also means a wick that reaches into one is still legible through it, which matters
 * because the pill sits exactly where the run's *other* extreme lives.
 *
 * For the record, what it has to stay clear of at that height is nothing: `EXTREME_HUES`'
 * violet/cyan/lime, `GAP_HUES`' sky and rose, `BAR_HUES`' four, `WICK_HUES`' rose and indigo and
 * the page's four palette colours are all drawn at a price.
 */
export const RESPECT_HUES: Record<LineRespect['side'], string> = {
  above: '#4ade8099',
  below: '#f8717199',
}

/**
 * The same two hues at full strength, for the sawtooth.
 *
 * Both halves of the transparency argument above are about a *fill*: ten pixels of solid colour
 * reading as a second object in the picture, and a wick needing to stay legible through it. A 2px
 * stroke has neither problem — it covers almost nothing and hides nothing — and at 60% it would
 * read as a faded pill rather than as a different mark, which is the one thing this shape exists
 * to be.
 */
export const RESPECT_STROKE_HUES: Record<LineRespect['side'], string> = {
  above: '#4ade80',
  below: '#f87171',
}

/** The hue table each mark draws in. */
const HUES: Record<PillShape, Record<LineRespect['side'], string>> = {
  pill: RESPECT_HUES,
  sawtooth: RESPECT_STROKE_HUES,
}

/**
 * Which side of the *screen* a respect is marked on: the far side of the run from the line.
 *
 * The inversion is the whole of it. A group that held the line from above has the line under it,
 * and the bars, and whatever else is drawn at that level — marking it there would put the verdict
 * on top of the thing the verdict is about, in the busiest part of the picture. Past the run's
 * other extreme there is nothing at all, and a mark out there still reads as belonging to the bars
 * it spans because it spans exactly them.
 *
 * So: respected from below is drawn *above* the candles in red, respected from above is drawn
 * *below* them in green. Two facts in two channels — the colour says which side held, the position
 * says which bars — and neither is a second spelling of the other.
 */
export const PLACEMENT: Record<LineRespect['side'], PillSide> = {
  above: 'below',
  below: 'above',
}

/**
 * What each side is, in words, for the sidebar's colour key.
 *
 * Names where the *bars* were, which is the opposite of where the pill is drawn: a run that held
 * the line from above is marked *below* it. The filter and the swatch are about the respect, so
 * they are named for the respect — see `PLACEMENT` for the side of the screen.
 */
export const RESPECT_LABELS: Record<LineRespect['side'], string> = {
  above: 'respeitada por cima',
  below: 'respeitada por baixo',
}

/**
 * How far clear of the run's extreme lane `0` sits, and how much further out each lane after it.
 *
 * The gap is a judgement and not a round number: far enough out that a pill never grazes the wick
 * it hangs off, close enough that it still reads as a mark *about* those bars rather than as
 * something floating in the margin. It has nothing to compete with out there — the pill is on the
 * far side of the run from the line — so the only thing the distance has to buy is separation.
 */
export const PILL_GAP = 25
export const PILL_PITCH = 11
export const PILL_HEIGHT = 7
export const PILL_RADIUS = 3

/**
 * The sawtooth's three numbers, in CSS pixels.
 *
 * The swing is **shorter than the pill's box**, deliberately, which is the one place the two marks
 * stop sharing a number. A pill is a solid block and reads as one object at any height; a 2px
 * stroke swinging the same 7px reads as a fence — tall enough that the eye takes the peaks for
 * separate strokes instead of one line going up and down. Five is where it settles back into being
 * a texture. It shortens only the far edge of the box: `boundsOf` measures `gap` from the near one,
 * so the mark sits exactly as clear of the run's extreme as the pill does, and `PILL_PITCH` is
 * still the pitch for both, so the two Series share one lane grid.
 *
 * `6` for a full tooth: a run of two bars is then a whole tooth rather than half of one, and at
 * three pixels per half-step the round caps still leave daylight at the peaks instead of filling
 * the swing in — which would be the pill again, drawn worse.
 *
 * `2` is the thinnest stroke that survives the round to device pixels on a 1× screen while still
 * reading as a line rather than as a hairline.
 */
export const SAWTOOTH_HEIGHT = 5
export const SAWTOOTH_PERIOD = 6
export const SAWTOOTH_WIDTH = 2

/**
 * Which mark a respect Series is drawn with, read off its producer key.
 *
 * The pipeline runs `LineRespectPattern` twice — over the pinned levels and over the pinned sloped
 * lines — and `Pattern.producer` renders the source Pattern into the key, so the key is the only
 * thing on the wire that actually *says* which kind of line a group was held against. The Series'
 * `name` would answer too, but that is a label written for a person to read, and hanging a drawing
 * off it would make rewording it a rendering change.
 *
 * Anything else, including a `line-respect` Series from a source this app has not met, gets the
 * pill: the mark this overlay has always drawn is the one to fall back to.
 */
export function respectMark(producer: string): PillShape {
  return producer.includes('source=<trend-relations(') ? 'sawtooth' : 'pill'
}

/**
 * What a drawn group is called.
 *
 * The producer, the line and the anchor. Unlike `gapBoxId` this needs all three: several lines
 * answer over the same bars, so the anchor alone does not tell two groups apart, and the producer
 * is there for the reason `extremeSegmentId` carries one — two Series of this Pattern would
 * otherwise mint the same id for two different runs.
 */
export function respectPillId(namespace: string, point: LineRespect): string {
  return `${namespace}:${point.line}:${point.time}`
}

/**
 * The extreme a group's pill keeps clear of — the one on the side it is drawn on, which is the
 * opposite of the side that held: the lowest low of the run for a line held from above, the
 * highest high for one held from below.
 *
 * Over **every** bar of the run and not only the ones that touched, which is what `bars` being
 * contiguous is for: a pill placed off the touching bars alone would be cut through by a bar
 * between them that ran further.
 */
export function pillExtreme(point: LineRespect): number {
  const below = PLACEMENT[point.side] === 'below'
  const prices = point.bars.map(bar => (below ? bar.low : bar.high))
  return below ? Math.min(...prices) : Math.max(...prices)
}

/**
 * One pill per group, for the groups whose side passes the sidebar filter, stacked so that two
 * lines held over the same bars do not draw on top of each other.
 *
 * Here rather than in the overlay for the reason `gapBoxes` is: what the sidebar would list in
 * words and what the chart draws must come off one traversal, or they are two answers to one
 * question.
 *
 * **Lanes are assigned per side of the screen**, which is `PLACEMENT[point.side]` and not
 * `point.side`. The two stacks grow in opposite directions from different prices, so a pill drawn
 * above the candles and one drawn below them can never collide however their spans overlap, and
 * counting them together would push one of them out for no reason.
 *
 * `shape` is here only to pick the hue table — the span, the lane and the extreme are the same
 * questions for both marks, and the primitive is what knows the difference between them.
 *
 * Sorted by span before the sweep — first bar, then line id — so the lane a group lands in depends
 * on the groups and not on the order the response happened to list them in. Within one side a group
 * takes the lowest lane whose last occupant ended before it starts; the lane is therefore a
 * function of what overlaps it, and a run alone on the chart is always at `0`.
 */
export function respectPills(
  namespace: string,
  points: LineRespect[],
  sides: LineRespect['side'][],
  shape: PillShape = 'pill',
): RespectPill[] {
  const kept = points
    .filter(point => point.bars.length > 0 && sides.includes(point.side))
    .sort((a, b) => (a.bars[0]!.time - b.bars[0]!.time) || a.line.localeCompare(b.line))

  // The last bar occupied in each lane, per side of the screen. Sparse by construction: a lane
  // exists once something has been put in it.
  const occupied: Record<PillSide, number[]> = { above: [], below: [] }

  return kept.map((point) => {
    const from = point.bars[0]!.time
    const to = point.time
    const placement = PLACEMENT[point.side]
    const lanes = occupied[placement]

    let lane = lanes.findIndex(end => end < from)
    if (lane === -1) lane = lanes.length
    lanes[lane] = to

    return {
      id: respectPillId(namespace, point),
      from: from as UTCTimestamp,
      to: to as UTCTimestamp,
      price: pillExtreme(point),
      side: placement,
      lane,
      color: HUES[shape][point.side],
    }
  })
}
