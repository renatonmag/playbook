import type { UTCTimestamp } from 'lightweight-charts'
import type { LegExtremes, LegPoint } from '~/types/pattern'
import type { LevelSegment } from '~/utils/level-segments'

/**
 * The hue each of a leg's three levels is drawn in — violet, cyan, lime.
 *
 * Shared between the overlay that draws the segments and the key beside the sidebar's checkbox,
 * which is the whole reason it is here rather than a `const` in the component.
 * `LegReversalsOverlay` keeps its own table and `LegReversalsVerify` restates it by hand, held
 * together by a comment; that is survivable for two lists of dots read side by side and is not
 * survivable for a colour *key*, which is a claim about what the picture means.
 *
 * Chosen clear of everything else already on the monitor: the page's four palette colours, the
 * candles' green and red, and `LegReversalsOverlay`'s sky, amber and pink.
 */
export const EXTREME_HUES: Record<LegPoint['type'], string> = {
  reach: '#7c3aed',
  close: '#0891b2',
  hold: '#65a30d',
}

/**
 * What each level is, in words, for that key.
 *
 * Direction-neutral, like the `type` values themselves: on a bull leg these are the highest high,
 * the highest close and the highest low, and on a bear leg each is the mirror. A label naming the
 * OHLC field would be wrong on half the legs on screen.
 */
export const EXTREME_LABELS: Record<LegPoint['type'], string> = {
  reach: 'extremo',
  close: 'fechamento',
  hold: 'sustentado',
}

/**
 * A drawn level, plus the two facts about it that a picture states in colour and a list has to
 * state in words. The primitive ignores both; the sidebar is why they are here.
 */
export interface ExtremeSegment extends LevelSegment {
  type: LegPoint['type']
  direction: LegExtremes['direction']
}

/**
 * What a drawn level is called, for the whole app: the Series it came from, the leg it belongs to,
 * and which of the three it is.
 *
 * The anchor is the `LegExtremes` Point's own `time` — the leg — and not the level's bar. A leg's
 * three points can share one `at`, so the bar alone names nothing, and `at` moves with the window
 * while the anchor does not. That is what makes an id survive a pipeline re-run: the same leg
 * produces the same three ids even when the level's price moved.
 *
 * `namespace` is the producer key, and it is what keeps two `leg-extremes` Series apart. The
 * pipeline now runs this Pattern twice — over the zigzag's leg windows and over the advancing
 * legs — and a zigzag vertex that is also a simple-leg mark would otherwise give both Series a
 * segment with the same name. The overlay admits a click by asking whether the id is one of the
 * ones it drew, so two identical names mean one click pinning in both.
 */
export function extremeSegmentId(
  namespace: string,
  anchor: number,
  type: LegPoint['type'],
): string {
  return `${namespace}:${anchor}:${type}`
}

/**
 * One segment per point, for the legs `directions` keeps, with the ones in `pinned` run out to the
 * current bar.
 *
 * Here rather than in the overlay because the sidebar draws the same list in words — a pinned
 * segment's colour, role and price — and reading those off a second traversal of `found` would be
 * two places deciding what a level is.
 *
 * The filter is applied here rather than by the caller for the reason the markers overlay gives:
 * the sidebar can ask for "bull only" without knowing what a leg's direction means to the drawing.
 *
 * **Not deduplicated**, unlike the markers. Consecutive legs overlap, so the same bar genuinely
 * arrives twice under two anchors and the same segment is emitted twice — which is identical
 * opaque pixels drawn in the same place, and invisible. A marker at a repeated key was worth
 * collapsing because the library keeps a list of them; a canvas fill is idempotent.
 *
 * Unsorted, for the other half of that: the chart requires markers to ascend by time and has no
 * such demand of a primitive, which draws in whatever order it is handed.
 *
 * `namespace` is the Series these points came from — see `extremeSegmentId` for why an id has to
 * name it. First rather than last because it is the least optional thing here: a caller may leave
 * `pinned` out, and no caller may leave this out.
 */
export function extremeSegments(
  namespace: string,
  points: LegExtremes[],
  directions: LegExtremes['direction'][],
  pinned: ReadonlySet<string> = new Set(),
): ExtremeSegment[] {
  const segments: ExtremeSegment[] = []

  for (const point of points) {
    if (!directions.includes(point.direction)) continue

    for (const found of point.found) {
      const id = extremeSegmentId(namespace, point.time, found.type)
      segments.push({
        id,
        type: found.type,
        direction: point.direction,
        time: found.time as UTCTimestamp,
        // The value that won, already picked for the leg's direction by the Pattern — which is
        // what that field is carried for. Reading `high`/`low` off the bar here would mean
        // re-deriving from `direction` what the server already decided.
        price: found.price,
        color: EXTREME_HUES[found.type],
        // What a pin does to the drawing, decided here because this is the module that knows what
        // a pin is: the line keeps its weight and its colour, and only its length changes.
        extend: pinned.has(id),
      })
    }
  }

  return segments
}
