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
 *
 * The last Point is normally `provisional` — the leg it closes has not turned yet.
 */
export interface LegMark extends PatternPoint {
  price: number
  direction: 'high' | 'low'
  /**
   * True for the last Point only, while a leg is still running: that bar is the newest one in
   * the window, not a turn. It moves as bars close, and can change side when the turn lands.
   */
  provisional: boolean
}

/**
 * Where one leg actually reached — a detector's pivot repriced at the extreme its leg made.
 *
 * **Not the vertex.** A `LegMark` or a `ZigZagPivot` says which leg ended and on which side; this
 * says where that leg *got to*, which is a different bar whenever the detector marked the turn
 * late. `simple-leg` reads one side of the bar at a time, so a leg can top out several bars before
 * the bar that ends it; the zigzag elects a vertex only among bars that made a rolling-window
 * extreme. Anything measuring a distance between pivots measures short unless it reads this.
 *
 * One Point per source pivot, in the source's order, so the two Series can be held side by side.
 * The anchors still never go backwards, but two Points can share a bar — one candle can be both
 * the top of the leg into it and the bottom of the leg out of it.
 *
 * No overlay is registered for it: the Series ships so a chain can read it, and `monitor.vue`
 * drops a producer it has no entry for.
 */
export interface LegReach extends PatternPoint {
  /** The extreme the leg reached: its highest `high` for a top, its lowest `low` for a bottom. */
  price: number
  /** Which extreme this is — the side of the pivot whose leg it measures. */
  direction: 'high' | 'low'
  /**
   * True for the last Point only. It measures the source's newest pivot, which is unsettled on
   * either detector, so this leg's extreme moves with every bar. Read positionally rather than
   * copied from the source, because a `ZigZagPivot` has no such flag at all — so a settled final
   * mark is flagged too.
   */
  provisional: boolean
}

/**
 * One turn of the general direction — the market's lean, read off the simple legs' pivots.
 *
 * The Series holds only the turns: the direction at any bar is that of the last Point at or
 * before it. `kind: 'seed'` appears at most once, as the first Point — the assumption made from
 * the first agreeing pair of **inflexions**, which is where a leg ends, so the first `simple-leg`
 * mark of the window does not count as one: it opens the first leg rather than closing one. Every
 * later Point is a `'flip'`, earned by two breakouts against the trend before it. `price` is the
 * deciding mark's own.
 */
export interface GeneralDirection extends PatternPoint {
  price: number
  /** The trend from this bar on — not the trend that just ended. */
  direction: 'bullish' | 'bearish'
  kind: 'seed' | 'flip'
}

/**
 * The bar on which three consecutive same-side bars completed — the bar-local counterpart to
 * `GeneralDirection`, and deliberately nothing like it under the hood.
 *
 * One Point per run, on the **third** bar, and never a second one however long the run goes on:
 * a run of thirty reads exactly like an exact triple here. `close === open` is neither side and
 * breaks the run rather than extending it. No `price`, unlike the Series above: this one is
 * anchored on a bar and not on a mark, and there is no price three bodies close at.
 */
export interface ConsecutiveDirection extends PatternPoint {
  /** Which way the three bars ran. Never absent — a bar with no side cannot complete a run. */
  direction: 'bullish' | 'bearish'
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
 * One leg's bars, anchored on the first of them — what a detector's vertices carve the window into.
 *
 * `bars[0]` and `bars[bars.length - 1]` are the two vertices the leg runs between, inclusive, so
 * consecutive legs share their boundary bar. Two exceptions, both from the slicer folding the
 * window's edges in: the **first** leg also carries every bar before the first vertex, and the
 * **last** every bar after the last one. Neither of those two ends is a vertex.
 */
export interface Leg extends PatternPoint {
  /** An array on the wire: the Python tuple serializes as a list. */
  bars: PatternPoint[]
}

/**
 * One finding about one bar — a Point of the `bars` Series.
 *
 * A mark *is* a Point here: nothing nests it, so `time` is the anchor and it is the field the
 * whole Pattern exists to produce — the timestamp to look up on the real chart. Several marks can
 * share a `time`, since the four filters are a union and the Forma rule can match a bar for both
 * turns, so `time`, `type` and `direction` together name one. Never key a mark on `time` alone.
 */
export interface BarMark extends PatternPoint {
  /**
   * Which filter marked it.
   *
   * `two-bar` means the bar belongs to a matching pair — with the bar before it or the one after
   * — listed once either way, so an alternating run reads as several entries on contiguous bars
   * rather than one per pair. `inside-bar` means the previous bar already covered this one's
   * range, both extremes included. `small-overlap` means the bar closed clear of the range of the
   * bar before it: a bull bar above the previous high, a bear bar below the previous low.
   * `smallest-bar` means the bar covered no more ground than any of the `n` before it, `n` being
   * the one dial the monitor sets per run beside the rule — a compression reading rather than a
   * turn candidate. `outside-bar` is `inside-bar` read the other way: this bar covered the
   * previous one's range, both extremes strictly broken.
   *
   * The six are not exclusive: `inside-bar` reads only the extremes, so it lands on bars the
   * others also marked, and the Series then holds one Point per reading. The one pair that cannot
   * co-occur is `inside-bar` and `outside-bar` — the containment test is inclusive of equal
   * extremes and the covering test is strict, so a bar tying on one end is inside, not outside.
   */
  type: 'two-bar' | 'reversal-bar' | 'inside-bar' | 'small-overlap' | 'smallest-bar' | 'outside-bar'
  /**
   * The turn this mark is a candidate for — a `bearish` mark is a candidate top.
   *
   * Read it outright rather than inverting anything: the mark says which turn it is a candidate
   * for, not which way the move around it ran. `null` on an `inside-bar` and on a `smallest-bar`,
   * which read only the extremes and make no directional claim at all.
   *
   * `small-overlap` and `outside-bar` are the exceptions to the sentence above: on both the
   * direction is the bar's own lean, so a `bullish` one is a bull bar rather than a candidate
   * bottom. Read alongside the others they sit on the opposite side of the bar from a candidate
   * for the same turn.
   *
   * An `outside-bar` is emitted whatever its body does — the relation is about extremes — so its
   * lean falls back to which side of the bar's own midpoint the close sits on when there is no
   * body to read. `null` there means "no lean", not "no directional claim": it is the one bar
   * that closed flat exactly at its own middle.
   */
  direction: 'bullish' | 'bearish' | null
}

/**
 * One of a leg's three defining bars — how far it reached, where it closed best, what it held.
 *
 * Not a Point of any Series — these arrive nested in `LegExtremes.found`, so `time` here is just
 * the bar's own, and it is the field the whole Pattern exists to produce: the timestamp to look up
 * on the real chart.
 */
export interface LegPoint extends PatternPoint {
  /** Index into `bars` of the `LegWindow` at the same anchor. Meaningless without it. */
  at: number
  /**
   * Which of the three levels this bar is, named for the role rather than the OHLC field, because
   * the field flips with the leg's direction and the role does not.
   *
   * On a bull leg: `reach` is the highest high, `close` the highest close, `hold` the highest low
   * — the highest level price never traded back below. On a bear leg each is the mirror: lowest
   * low, lowest close, lowest high.
   *
   * The three are not exclusive as *bars*: a one-bar move, or a bar that both spiked and closed at
   * the extreme, puts all three on one `at`. Key a point on `at` and `type` together — never on
   * `at` or `time` alone.
   */
  type: 'reach' | 'close' | 'hold'
  /** The value that won — `high`, `close` or `low`, already picked for the leg's direction. */
  price: number
}

/**
 * One leg's three defining points and which way it ran, anchored where its `LegWindow` is.
 *
 * `found` always holds exactly three entries, in the fixed order `reach`, `close`, `hold` — role
 * order, not `at` order: read the third entry as "the level it held", never as "the last one".
 *
 * Ties keep the earliest bar: the first bar to reach a level owns it, and a later bar equalling it
 * does not take it over. And note `reach` can land in the tail, past `end` of the `LegWindow` at
 * the same anchor — the whole window is scanned, so a leg exceeded a bar or two *after* its vertex
 * says so. Read `at > end` as "the level was exceeded after the turn"; the vertex is `bars[end]`.
 */
export interface LegExtremes extends PatternPoint {
  /** An array on the wire: the Python tuple serializes as a list. Always three entries. */
  found: LegPoint[]
  /**
   * The leg's **own** move: `bullish` when it closed on a high, `bearish` on a low.
   *
   * The same direction the three points were measured for — this Series answers how far the move
   * got, so there is no inversion to keep straight, unlike a mark that is a candidate for a turn.
   */
  direction: 'bullish' | 'bearish'
}

/**
 * One zigzag leg and the simple legs that ran inside it, anchored where its `LegWindow` is.
 *
 * The join between the two detectors. A simple leg is in this group when it **starts** inside the
 * zigzag leg — after its opening vertex, and at or before its closing one:
 *
 * ```
 * leg.bars[0].time  <  inside[i].time  <=  leg.bars[leg.end].time
 * ```
 *
 * Left-exclusive because a leg starting on the opening vertex started on the bar that *closes* the
 * previous zigzag leg, and belongs there. Right-inclusive at `end` and not at the end of `bars`,
 * because the `ahead` tail belongs to the leg that follows — grouping by it would put one simple
 * leg in two groups. Together those make the groups a partition of the simple legs, minus the ones
 * outside every zigzag leg, which are dropped: read this Series as "per zigzag leg", never as
 * "every simple leg".
 */
export interface NestedLegs extends PatternPoint {
  /**
   * The zigzag leg itself, whole. Carried rather than left to a join on the anchor — unlike
   * `LegExtremes`, which refuses to restate `since`/`end` — because this Point is *about* a
   * relationship between two Series and naming one side of it would not be readable alone.
   */
  leg: LegWindow
  /**
   * The simple legs that start inside `leg`, in order. An array on the wire.
   *
   * Empty is ordinary and is a fact: the simple detector marked no turn inside that leg. And the
   * last entry can run *past* `leg.bars[leg.end]` — the slicer gives its final leg the whole
   * remainder of the window, and the grouping is by where a leg starts.
   */
  inside: Leg[]
}

/**
 * One simple leg that survived the `advancing-legs` filter, anchored on its first bar.
 *
 * `nested-legs` groups every simple leg into the zigzag leg it started in; this is that grouping
 * with the pushes that got nowhere taken out, flattened into one list. Inside a bullish zigzag leg
 * a simple leg survives when it is a **pullback** (bearish — always kept) or an **advance**
 * (bullish, and it made a new high). Bearish zigzag legs are the mirror. A push that made no new
 * extreme is the only thing ever dropped.
 *
 * Four things to know before reading a row:
 *
 * - **A new extreme is read off the leg's last bar**, not its highest one, so a leg that spiked
 *   above the running high mid-way and gave it back did not make a new high. `LegExtremes` is what
 *   answers the other question.
 * - **`direction` is the leg's own move and `group` is the zigzag leg's.** Comparing them is what
 *   says which role the leg played: `direction === group` is an advance, `direction !== group` a
 *   kept pullback. Neither field alone can say it, which is why both are here.
 * - **The first advance of a group is kept unconditionally** — there is no earlier push in the
 *   group to clear, and the group's opening vertex is the wrong barrier (on a bullish leg it is a
 *   low).
 * - **The comparison is strict**, so an advance that exactly equals the running extreme is dropped.
 *
 * Legs outside every zigzag leg were already dropped upstream by `nested-legs`, so read this Series
 * as "per zigzag leg", never as "every simple leg".
 */
export interface AdvancingLeg extends PatternPoint {
  /** An array on the wire: the Python tuple serializes as a list. The `Leg`'s bars, untouched. */
  bars: PatternPoint[]
  /** The leg's **own** move, from the `simple-leg` mark it opens on. */
  direction: 'bullish' | 'bearish'
  /** The move of the zigzag leg it survived inside, from that leg's closing vertex. */
  group: 'bullish' | 'bearish'
}

/**
 * One zigzag leg read at its close: what it broke, how busy it was, and how much it gave back.
 *
 * Anchored on the bar the leg **reached** its closing extreme on — the `Retracement` anchor, not
 * `NestedLegs`' opening vertex — with `price` that extreme. So a row lines up with the
 * `retracement` Series by `time` and with `nested-legs` or `leg-window` by nothing: those anchor
 * where the leg opened.
 *
 * Every price behind these numbers comes from `leg-reach`, the zigzag's pivots repriced at the
 * extremes their legs really reached, and never from the detector's own vertices. A leg that ran
 * past where it was marked would otherwise look like it broke less than it did.
 *
 * A level counts as broken only when it passes three tests, and the two price ones are
 * independent — neither implies the other, and dropping either is what makes a count climb into
 * the dozens:
 *
 * - **The leg crossed it.** The level lies strictly between the leg's **own open and its close**,
 *   so the leg actually ran through it. A leg that opened already beyond an old top did not break
 *   it. Both bounds strict: a level at the close was *retested*, one at the open is where the leg
 *   began. On the upper bound that is the opposite of what `retracement` does with the same two
 *   prices, on purpose — there the question is whether price has exceeded a level, here it is
 *   whether this leg broke it.
 * - **It was still standing.** No same-side swing between that level and this leg had already
 *   taken it out. A level broken three legs ago is gone, and the line from it to this leg runs
 *   through whatever broke it.
 * - **It is on the close's side.** A low cannot break a top.
 *
 * Two costs to read a row against:
 *
 * - **Standing is read off the swings, not off every bar**, so a level can have been pierced by a
 *   wick that no pivot recorded.
 * - **The lookback is the loaded window and nothing else** — a level whose bar fell off the back
 *   of it is not there to be broken.
 */
export interface LegBreak extends PatternPoint {
  /** The extreme the leg closed on, and the side the breaks are counted on. */
  direction: 'high' | 'low'
  /** How many standing same-side levels this leg ran through. `taken.length`. */
  broke: number
  /**
   * The levels it broke, oldest first. An array on the wire. Bare pivots — a bar and a price, and
   * no claim about the Series they came from. The Log reads them as the times they sit on.
   */
  taken: Array<PatternPoint & { price: number }>
  /** How many simple legs ran inside this zigzag leg. Zero is a fact, not a gap. */
  legs: number
  /**
   * The fraction of the prior move this leg gave back, in [0, 1], or `null` where the retracement
   * could not be measured. Read off the `retracement` Series, which owns that arithmetic.
   */
  ratio: number | null
  /** The last row only: its leg closes on a vertex the zigzag's cleanup can still relocate. */
  provisional: boolean
}

/**
 * The untraded band three bars left behind, anchored on the **first** bar of the triple.
 *
 * A gap up is `bar_1.high < bar_3.low`, a gap down its mirror; the comparison is strict, so two
 * ranges that merely touch leave no band. The middle bar is never read — it is the bar that made
 * the gap, and constraining it would be a second opinion about what a gap is.
 *
 * `bottom` is always the lower edge and `top` the higher, whichever way the gap runs, so nothing
 * here branches on `direction` to find out which number is which.
 *
 * Note the inherited OHLCV is the **first bar's** and says nothing about the gap — the gap is the
 * two price fields. Overlapping triples are all reported, so consecutive Points can sit one bar
 * apart.
 */
export interface BarGap extends PatternPoint {
  bottom: number
  top: number
  /** `bullish` for a gap up, `bearish` for a gap down — which way price was going when it left. */
  direction: 'bullish' | 'bearish'
  /**
   * The first bar after the triple to trade through the **whole** band, or `null` while the gap
   * stands: `low <= bottom` on a bull gap, `high >= top` on a bear one.
   *
   * A full traversal, not a touch — `bottom` is the *far* edge of a bull gap, so a bar that dips
   * halfway in leaves it open. Note the asymmetry with the rule that *creates* a gap, which is
   * strict: two ranges that touch leave no band, but price arriving exactly at an existing band's
   * far edge has crossed it.
   *
   * `null` means "not closed **in this window**" and never "will never close": the server scans to
   * the last bar it loaded, so the same gap can read open on a short window and closed on a longer
   * one.
   */
  closed_by: PatternPoint | null
}

/**
 * One end of a trend line: the bar where a `simple-leg` leg actually reached its extreme.
 *
 * Not the mark. A `LegMark` says which leg ended and on which side; the turn rule that finds it
 * reads one side at a time, so a leg can top out several bars before the bar that ends it. This is
 * the bar it topped out on — the highest `high` of the leg for a top, the lowest `low` for a
 * bottom — which is the point a line is actually drawn through.
 */
export interface TrendLineEnd extends PatternPoint {
  /** The leg's extreme: the price the line passes through here. */
  price: number
  /** Which extreme this is: `'high'` for a top, `'low'` for a bottom. */
  direction: 'high' | 'low'
  /** This end measures `simple-leg`'s running leg, so it moves with every bar. */
  provisional: boolean
}

/**
 * One trend line: a straight line from one `simple-leg` leg's extreme to a later leg's extreme on
 * the **same side**, kept only because no candle between the two reaches through it.
 *
 * Anchored on the near end, whose `price` is the first point the line passes through; `to` is the
 * far one, carried whole, and its `price` is the second. Both are real bars of the window — the
 * line is drawn between them and claims nothing about what happens after `to`.
 *
 * `direction` is the **side** in `Pivot`'s vocabulary, not a move: `'high'` is a ceiling drawn
 * along the tops, `'low'` a floor along the bottoms. That is why this Pattern gets a filter of its
 * own rather than the bull/bear one — see `SIDES` in `pages/monitor.vue`.
 *
 * The Series is a fan and is by far the largest the pipeline emits: every leg extreme is joined to
 * every later one it can see, so many Points share an anchor and consecutive Points can sit on the same
 * bar. Nothing here is ranked or thinned; the sidebar is what filters it.
 */
export interface TrendLine extends PatternPoint {
  /** The near leg's own extreme — the price the line starts at. */
  price: number
  /** Which side both endpoints are: `'high'` is a ceiling, `'low'` a floor. */
  direction: 'high' | 'low'
  /** The far end, whole. Its `price` is the line's second point. */
  to: TrendLineEnd
  /**
   * Either endpoint measures `simple-leg`'s running leg, so this line moves with every bar and can
   * vanish when that leg finally closes elsewhere. Carried, not acted on: which lines to trust is
   * the reader's call, the same trade `LegMark.provisional` makes.
   */
  provisional: boolean
}

/**
 * One thing a pinned line did on one bar: the line was touched, missed narrowly, broken through, or
 * the breakout before it was undone.
 *
 * The Series is sparse — most bars say nothing about most lines — and it is bar-major, so its
 * anchors never go backwards. One bar and one line make at most one crossing, and a crossing that
 * undoes a recent one arrives as a `seam` **instead of** a `breakout`, never as both: to see every
 * crossing, read the two kinds together. A bar repeats when several lines answer on it, and on one
 * bar for one line: a bar that opens exactly on the line touches it with the base of a wick and
 * crosses it with its close, so it carries a `touch` and a crossing both.
 *
 * A `close` is the near miss, and it is the one kind that depends on a rule this page sends: the
 * bar stopped short of the line by less than the reach the proximity ladder granted its leg — see
 * `utils/proximity.ts`. It is exclusive with the other three by construction rather than by rule,
 * since a line near enough to be *missed* is outside the bar's range entirely, so no wick can hold
 * it and no close can be on the far side of it. It is also the one kind that is not final: the leg
 * behind the reach is measured whole, so a longer window can move it.
 *
 * `price` is the **line's** price, not the bar's: the OHLCV every Point carries is already the
 * bar's, and repeating one of its numbers here would say nothing.
 */
export interface LineRelation extends PatternPoint {
  /** The browser's own segment id, handed over on the `POST` and returned unparsed. */
  line: string
  /** The line's price — the level the bar met, not anything about the bar. */
  price: number
  kind: 'touch' | 'close' | 'breakout' | 'seam'
  /** Which wick reached the line. Only on `touch`. */
  wick: 'high' | 'low' | null
  /**
   * The side price **came from**: where the bar opened, or — on a crossing by a bar that opened
   * exactly on the line — the side it did not close on. Never `null` on a `breakout` or a `seam`.
   */
  side: 'above' | 'below' | null
  /** The bar that broke out first, whole. Only on `seam`. */
  since: PatternPoint | null
  /** How far the line sat from the bar's nearer extreme, in points. Only on `close`. */
  gap: number | null
  /**
   * The span of the zigzag leg that set the reach, in points. Only on `close`, and carried so a
   * reader can check the claim — `gap` against `leg` times the rung's trigger — without leaving
   * the row.
   */
  leg: number | null
}

/**
 * One stretch over which one pinned line held: the bars, and the side they held it from.
 *
 * The reading of `LineRelation` rather than a second look at the market. A stretch runs until a
 * breakout nothing takes back — touches, seams and the breakouts a seam undid all leave the line
 * standing, and only a definitive one ends a run. That breakout is in neither the run it closed
 * nor the one it opened.
 *
 * `side` is **not** `LineRelation.side`, despite the spelling. There it is where a bar opened; here
 * it is which side of the line price was holding, which is why these are two Series and not four
 * kinds of one. It is total: a run that could never say which side it held is not emitted.
 *
 * Anchored on the **last** bar of the run, with `bars[0]` the first — the `since` this Point does
 * not separately declare. `bars` is contiguous and includes the bars that did nothing about the
 * line, so the run's extreme can be measured without going back to the candles.
 */
export interface LineRespect extends PatternPoint {
  /** The browser's own segment id, the same one `LineRelation.line` carries. */
  line: string
  /** The line's price — the level the bars held, not anything about them. */
  price: number
  /** Which side of the line the bars held it from. Never `null`. */
  side: 'above' | 'below'
  /** The run, first bar to last. `bars[bars.length - 1]` is this Point's own anchor. */
  bars: PatternPoint[]
}

/**
 * The move a leg came back into, and how far back into it the leg came.
 *
 * **Whole or absent**, which is why it nests inside `Retracement` rather than spreading six
 * optional fields across it: there is no state where some of these are known and others are not,
 * so a reader gets one `point.measured?.ratio` instead of six nulls the type system cannot know
 * are correlated.
 *
 * The first nested payload here that is **not** a `PatternPoint` — `TrendLineEnd` and `LegPoint`
 * both are. It is anchored on nothing and has no bar of its own; the two Points it carries do.
 */
export interface RetracedMove {
  /** Where the retraced move began: the nearest earlier pivot on the leg's closing side that
   *  price had not exceeded. A bare pivot, so both detectors produce one shape here. */
  origin: PatternPoint & { price: number }
  /** Where the retraced move ended and the measured one began — the deepest opposite-side pivot
   *  between `origin` and the close. The 0% end of the ladder, `origin` being the 100% end. */
  turn: PatternPoint & { price: number }
  /** `|origin.price - turn.price|` — the whole move, in price units. */
  retraced: number
  /** `|close price - turn.price|` — how far back the leg came. */
  move: number
  /**
   * `move / retraced`, and **a fraction, not a percentage**: 0.618, never 61.8. The engine
   * measures and the browser formats.
   *
   * Always in `[0, 1]`, by construction rather than by clamping — the origin is at or beyond the
   * close and the turn is at or beyond it the other way, so the numerator is a part of the
   * denominator. There is no such thing as an extension here.
   */
  ratio: number
  /**
   * How many pivots each half of the move spans. `(1, 1)` is the textbook reading — this leg
   * against the one before it.
   *
   * Anything larger says the search walked back past a top the leg had taken out, and the number
   * above is a fraction of a **bigger** swing than the previous leg. That is the only thing that
   * explains a reading dropping sharply between two adjacent legs: a leg creeping through the
   * previous top reads 0.97, then 0.99, then one tick more and 0.41 against a swing three legs
   * deep. Nothing else on the Point says so.
   */
  retraced_legs: number
  move_legs: number
}

/**
 * One leg and how much of the move before it it gave back, anchored on the pivot that **closes**
 * the leg — unlike `LegWindow` and `LegExtremes`, which describe a span and anchor where it
 * starts. This reports a level reached, and the bar it was reached on is where a number belongs.
 *
 * The pipeline runs this Pattern twice, and **neither instance reads a detector directly**: both
 * read a `LegReach` Series, because a detector's own pivot is not its leg's extreme and a fraction
 * taken between four such prices is short by whatever the detector left on the table. So both
 * Series' percentages match a ruler dragged over the swing they name, and what still differs
 * between the two is only *which swings* each detector calls a leg.
 *
 * One consequence to expect on the chart: a Point is anchored where the leg **reached**, not where
 * the detector marked it, so the number does not sit on the drawn `zig-zag` or `simple-leg` line
 * and on a leg marked late it can be several candles away from the vertex there.
 */
export interface Retracement extends PatternPoint {
  /** The closing pivot's own price — the level this fraction is measured to. */
  price: number
  /**
   * Which extreme of its bar the closing pivot is. `'high'` is a leg that rose into a top, and the
   * move it retraces is the fall before it.
   *
   * The side vocabulary, not the bull/bear one — so a filter on it would join `SIDES` in
   * `pages/monitor.vue`, never `DIRECTIONAL`.
   */
  direction: 'high' | 'low'
  /**
   * The measurement, or `null`. Three causes and they are not told apart on the wire: no
   * un-exceeded pivot anywhere in the window, a "leg" whose two ends are on one side, or an origin
   * and a turn at one price.
   *
   * `null` means **"not measured in this window"** and never "unmeasurable" — the same honesty
   * `BarGap.closed_by` keeps, and the same trap: the identical leg reads `null` on a short window
   * and 0.45 on a longer one.
   */
  measured: RetracedMove | null
  /**
   * This leg closes on the newest pivot its source produced, so its closing price can still move.
   *
   * Read positionally on the server, so one rule serves both detectors — which makes it
   * conservative: a genuinely closed final leg is flagged too. Carried, not acted on, the trade
   * `LegMark.provisional` makes.
   */
  provisional: boolean
}

/**
 * Whether the simple legs are still lagging the zigzag at the right edge — `pivot-offset`.
 *
 * **At most one Point per response**, and only for the newest pair, unlike every other Series
 * here: this reads the window's right edge and nothing behind it, so the history of past offsets
 * is not in it. It repaints — a new confirmed mark or a new vertex replaces the Point outright.
 *
 * Anchored on the simple-leg mark, which is the later of the two bars whenever `offset` is true.
 * The zigzag's own bar is not carried: `zig-zag` is on the wire under its own key, and a copy here
 * could drift from it. No `price` — the answer is about which bar came later, not about a level.
 *
 * Draws nothing, so it has no `OVERLAYS` entry. Read with `seriesPoints`, like `leg-breaks`.
 */
export interface PivotOffset extends PatternPoint {
  /** True when the mark sits on a **strictly later** bar than the vertex. The same bar is false. */
  offset: boolean
}

export interface SeriesEnvelope<TPoint extends PatternPoint = PatternPoint> {
  /**
   * What the Pattern calls itself — one line, written on the class, for a person reading a list.
   *
   * Not to be confused with `producerName` below, which is the class part of the key and is what
   * picks the overlay component. Both survive: one is read by a person, the other by a `Record`.
   */
  name: string
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
