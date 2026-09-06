import type { UTCTimestamp } from 'lightweight-charts'
import type { Candle } from '~/types/candle'
import type { TrendLine } from '~/types/pattern'
import type { TrendSegment } from '~/utils/trend-segments'

/**
 * Which side a trend line runs along — the Point's own field, in `Pivot`'s vocabulary.
 *
 * Not `bullish`/`bearish`, and deliberately not folded into the bull/bear filter every directional
 * Pattern shares: those name a *move*, this names an *extreme*. A ceiling drawn along the tops is
 * not a bearish line — price rising into it is the interesting case — and one row of checkboxes
 * answering two different questions would say so.
 */
export type TrendSide = TrendLine['direction']

/** What each side is, in words, for the sidebar's filter and its list of pinned lines. */
export const TREND_LABELS: Record<TrendSide, string> = {
  high: 'topo',
  low: 'fundo',
}

/**
 * How much of a line is left when it is not the one being asked about: the alpha byte appended to
 * the Series' colour, ~15%.
 *
 * A colour rather than a filter, because the primitive reads `strokeStyle` per segment on every
 * frame and needs no change to accept one — the same 8-digit-hex idiom the sidebar's gap swatch
 * already uses. It assumes the `color` handed to `trendSegments` is a 6-digit `#rrggbb`, which is
 * true of every entry in the page's palette and of the overlay's default.
 */
const DIM_ALPHA = '26'

/**
 * What a drawn trend line is called, for the whole app: its two bars and the side it runs along.
 *
 * Both ends, unlike `gapBoxId`, which needs only its anchor. A leg extreme is the start of
 * *several* lines here — the fan is the whole point — so an anchor alone names a handful of them at
 * once. The side is not redundant either: two legs running opposite ways can reach their extreme on
 * the same bar, so a single pair of bars can in principle carry both a ceiling and a floor.
 *
 * The times are the Points' own, which is what makes an id survive a pipeline re-run: the same two
 * leg extremes mint the same id even when the window they were found in has moved. A pin therefore
 * follows its line rather than being frozen to a price, and a line that leaves the window takes
 * its pin off the list with it — the honest reading, since there is no such line any more.
 *
 * No producer prefix, for `gapBoxId`'s reason: the pipeline declares one `trend-lines` Series.
 * Give it one the moment a second is declared, as `extremeSegmentId` had to.
 */
export function trendSegmentId(from: number, to: number, side: TrendSide): string {
  return `${from}:${to}:${side}`
}

/**
 * A drawn trend line, plus the facts a picture states in position and a list has to state in words.
 * The primitive ignores all three; the sidebar is why they are here.
 */
export interface DrawnTrend extends TrendSegment {
  side: TrendSide
  /** The two prices the line passes through, for the list. The primitive reads them off `from`/`to`. */
  fromPrice: number
  toPrice: number
  /** Either endpoint measures the running leg, so this line moves with every bar. */
  provisional: boolean
  /**
   * The line this one was moved from, when it is a moved line — `trendSegmentId`'s id for the
   * Pattern the engine actually proposed. Absent on every line the engine drew itself.
   *
   * The sidebar reads it as "this row is a line you adjusted", and the page reads it to keep one
   * move per origin. See `movedSegments`.
   */
  origin?: string
  /** Which of the far bar's four prices the moved end sits on. Absent for the same reason. */
  field?: PriceField
}

/**
 * One segment per line, for the lines the sidebar's side filter keeps, with the ones in `pinned`
 * run out along their own slope to the current bar.
 *
 * Here rather than in the overlay for the reason `gapBoxes` and `extremeSegments` are: the sidebar
 * lists the same lines in words — a pinned line's side, its two prices and its two bars — and
 * reading those off a second traversal of the Points would be two places deciding what a line is.
 *
 * `color` is the Series' palette colour, handed in rather than looked up. This is the one shaping
 * function on the page that takes one, and the argument is `GAP_HUES`' own run the other way: a
 * gap's *state* gets a hue because it is invisible in the drawing, while a trend line's side is the
 * most visible thing about it — a ceiling sits above the candles and a floor below them. Colouring
 * that would spend two hues from an already crowded palette to repeat what the picture says, and
 * would cost the sidebar swatch its meaning as a legend for the checkbox.
 *
 * `focus` is a bar: the lines that *arrive* there keep the Series' colour and stay clickable, and
 * every other line fades to `DIM_ALPHA` and stops being a target. The far end and not either end,
 * because the question the switch answers is which lines converge on a pivot — a line that merely
 * starts there is part of a different fan, running the other way. Decided here for `extend`'s
 * reason: this is the module that already knows what selecting a line does to the drawing.
 *
 * `hovered` is the line under the cursor, and it is drawn as though it were selected. The
 * projection is the reason to select a line in the first place — where this ceiling would sit now
 * is the question a trend line exists to answer — and reading it used to cost a pin and an undo,
 * twenty times over in a fan that size. So the hover says it and the click keeps it. It borrows
 * `extend` rather than getting a look of its own on purpose: a preview that drew differently from
 * the thing it previews would not be a preview.
 *
 * One answer to both questions — which lines to read, and which lines a click may name — and
 * deliberately so. This Series is dense enough that a dimmed line lies across a lit one every few
 * pixels, so a backdrop that still took clicks would hand back the wrong line most of the time and
 * leave the highlight worse than no highlight at all. The cost is that a line which is pinned but
 * not lit can no longer be unpinned from the chart; it is still listed in the sidebar with its
 * `✕`, which is where a line you currently cannot pick out belongs.
 *
 * It dims rather than filters, which is the whole point. This Series is a fan of some hundreds of
 * strokes, and a handful of lines converging on a bar is only legible against the ones they were
 * picked out of — drop the rest and the picture stops saying anything about the pivot. So this is
 * emphasis, not a fourth filter: the side checkboxes and `Ligar` still decide what exists.
 *
 * A `focus` no line reaches dims the whole fan, deliberately: "nothing ends on this bar" is an
 * answer, and silently keeping the previous highlight would be a different bar's answer shown for
 * this one. Note also that `focus` is a bar of the *displayed* timeframe while `to.time` is one of
 * the Pattern's; when those differ nothing matches, which is the honest reading and is already what
 * the sidebar's "fora do timeframe exibido" warning is about.
 *
 * Not deduplicated and unsorted, for the reasons `gapBoxes` gives: two Points cannot collide on a
 * pair of endpoints, and a primitive draws in whatever order it is handed.
 */
export function trendSegments(
  points: TrendLine[],
  sides: TrendSide[],
  color: string,
  pinned: ReadonlySet<string> = new Set(),
  focus: number | null = null,
  hovered: string | null = null,
): DrawnTrend[] {
  const segments: DrawnTrend[] = []

  for (const point of points) {
    if (!sides.includes(point.direction)) continue

    const id = trendSegmentId(point.time, point.to.time, point.direction)
    // One decision, read twice below, so the colour and the hit test cannot come to disagree about
    // which lines the chart is currently about.
    const lit = focus === null || point.to.time === focus

    segments.push({
      id,
      side: point.direction,
      // The near leg's extreme and the far one, each a real bar of the window. The primitive
      // draws straight between the two and, when pinned, carries that slope onward.
      from: { time: point.time as UTCTimestamp, price: point.price },
      to: { time: point.to.time as UTCTimestamp, price: point.to.price },
      fromPrice: point.price,
      toPrice: point.to.price,
      provisional: point.provisional,
      // Full strength when nothing is being asked about, and when this is one of the lines that
      // answers. `DIM_ALPHA` for the rest of the fan.
      color: lit ? color : color + DIM_ALPHA,
      // And the backdrop is a backdrop for the cursor too: only a lit line can be clicked.
      hittable: lit,
      // What selecting a line does to the drawing, decided here because this is the module that
      // knows what a pin is: the line keeps its slope, its weight and its colour, and only its
      // length changes — it runs on to the current candle.
      //
      // Two reasons, one picture: the pin is the answer kept, the hover is the same answer asked.
      // Kept separate from `pinned` rather than folded into it by the caller, because `pinned` is
      // also what survives the auto-hide timer and a line under the cursor is not one you kept.
      extend: pinned.has(id) || id === hovered,
    })
  }

  return segments
}

/**
 * Which of a Candle's four prices a moved line's far end sits on.
 *
 * The magnetism is the point: a trend line is a claim about where price turned, and a line ending
 * halfway up a wick is a claim about nothing. So the second point is not a free price — it is one
 * of the four readings the bar under the cursor actually took.
 *
 * All four rather than the two the line's own side would suggest, because a ceiling drawn along
 * closes is a different and equally common reading of the same tops: which anchor a line runs
 * along is exactly the judgement this feature exists to let somebody make.
 */
export type PriceField = 'open' | 'high' | 'low' | 'close'

/** What each anchor is called in the sidebar's list of selected lines. */
export const FIELD_LABELS: Record<PriceField, string> = {
  open: 'abertura',
  high: 'máxima',
  low: 'mínima',
  close: 'fechamento',
}

/** The four, in the order they are searched for the one nearest the cursor. */
export const PRICE_FIELDS: PriceField[] = ['open', 'high', 'low', 'close']

/**
 * What a *moved* line is called: its two bars and side, as ever, plus the anchor its far end sits
 * on.
 *
 * The `@field` suffix is not decoration. Without it a line moved onto the very bar the engine had
 * already chosen would mint the id of the line it replaced, and the two would be the same line to
 * every part of the app that names one — the pin, the hit test, the sidebar row. A moved line is a
 * different claim from the one the engine proposed even when it lands in the same place, and its
 * name has to say so.
 */
export function movedTrendId(from: number, to: number, side: TrendSide, field: PriceField): string {
  return `${trendSegmentId(from, to, side)}@${field}`
}

/**
 * A move, as the page stores it: the line it was made from, and where its far end went.
 *
 * Nothing else. The fixed near end, the side and the price are all resolved from the current
 * Points and the current bars — which is what makes a move survive a pipeline re-run for the same
 * reason a pin does, and what makes a move whose origin line or whose bar has left the window
 * simply not resolve rather than resolve to something stale.
 */
export interface TrendMove {
  /** `trendSegmentId`'s id for the line the engine proposed. */
  origin: string
  /** The bar the far end was dropped on. */
  toTime: number
  field: PriceField
}

/**
 * A move as one string, so `useStoredOverlays` can keep it in a `Set` beside the pins.
 *
 * The separators cannot collide with the id's own: `trendSegmentId` joins with `:` and mints only
 * digits and the two side words, so `>` and `@` appear nowhere inside an origin.
 */
export function moveKey(origin: string, toTime: number, field: PriceField): string {
  return `${origin}>${toTime}@${field}`
}

/**
 * A move key back into a move, or `null`.
 *
 * Total, in `parseRule`'s style, and for the same reason: these come back out of `localStorage`,
 * which is hand-editable and outlives every version of this file. A key this function cannot read
 * is a line that is simply not moved, which is a correct chart.
 */
export function parseMove(key: string): TrendMove | null {
  const [origin, rest] = key.split('>')
  if (!origin || !rest) return null

  const [time, field] = rest.split('@')
  const toTime = Number(time)
  if (!Number.isFinite(toTime)) return null

  if (!PRICE_FIELDS.includes(field as PriceField)) return null

  return { origin, toTime, field: field as PriceField }
}

/**
 * The lines somebody moved by hand, drawn from the same Points and bars the rest of the chart is.
 *
 * A sibling of `trendSegments` rather than a parameter on it, because the two answer different
 * questions: that one is "what did the engine find", this one is "what did you make of it". Folding
 * them together would have `trendSegments` take the candle history, which it has never needed —
 * every price it draws comes off a Point.
 *
 * The origin line is deliberately **not** removed from the fan. It is still a real Pattern the
 * engine found, and a moved line is an opinion laid over it rather than a correction of it; what a
 * move takes away is the origin's *pin*, which the page does. So the two can sit on the chart at
 * once, and the moved one is the one that carries a slope out to the live edge.
 *
 * A moved line is always `extend`ed and needs no `pinned` argument: the move is the pin. There is
 * nothing else a moved line could be for — you moved it to read where it now points.
 *
 * `focus` means exactly what it means in `trendSegments`, applied here too so a moved line dims
 * with the fan rather than floating above a highlight that no longer includes it. There is no
 * `hovered`: that argument previews the projection a pin would give a line, and this line already
 * has it.
 *
 * Four ways a move does not resolve, all of them silent and all of them the honest reading: the
 * origin line is no longer among the Points; its side is filtered off; the bar it was dropped on
 * has left the window; or that bar is not after the fixed end, which is not a trend line at all.
 */
export function movedSegments(
  points: TrendLine[],
  sides: TrendSide[],
  color: string,
  moves: readonly string[],
  bars: ReadonlyMap<number, Candle>,
  focus: number | null = null,
): DrawnTrend[] {
  if (moves.length === 0) return []

  // One pass over the Points for however many moves there are, rather than a scan per move: the
  // fan runs to some hundreds of lines and this is rebuilt on every mouse move.
  const origins = new Map<string, TrendLine>()
  for (const point of points) {
    origins.set(trendSegmentId(point.time, point.to.time, point.direction), point)
  }

  const segments: DrawnTrend[] = []

  for (const key of moves) {
    const move = parseMove(key)
    if (move === null) continue

    const point = origins.get(move.origin)
    if (!point) continue
    if (!sides.includes(point.direction)) continue

    const bar = bars.get(move.toTime)
    if (!bar) continue

    // A trend line runs from an earlier extreme to a later one. A far end dropped at or before the
    // near one is not a shorter line, it is not a line — and `boundsOf` would be dividing by zero.
    if (move.toTime <= point.time) continue

    const price = bar[move.field]
    const id = movedTrendId(point.time, move.toTime, point.direction, move.field)
    const lit = focus === null || move.toTime === focus

    segments.push({
      id,
      side: point.direction,
      // The half of the line that never moves: the Point's own near extreme.
      from: { time: point.time as UTCTimestamp, price: point.price },
      // And the half that did: a real bar, at one of the four prices it actually took.
      to: { time: move.toTime as UTCTimestamp, price },
      fromPrice: point.price,
      toPrice: price,
      // The origin's reading of it. The near end still measures the same leg, so a line moved off a
      // running leg is still moving with every candle.
      provisional: point.provisional,
      origin: move.origin,
      field: move.field,
      color: lit ? color : color + DIM_ALPHA,
      hittable: lit,
      // Always, unlike a fan line: the move is the pin, and a line you adjusted by hand is one you
      // adjusted in order to read where it now points.
      extend: true,
    })
  }

  return segments
}
