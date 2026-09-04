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
 * One bar inside a leg that a reversal filter marked.
 *
 * Not a Point of any Series — these arrive nested in `LegReversals.found`, so `time` here is just
 * the bar's own, and it is the field the whole Pattern exists to produce: the timestamp to look up
 * on the real chart.
 */
export interface LegBar extends PatternPoint {
  /** Index into `bars` of the `LegWindow` at the same anchor. Meaningless without it. */
  at: number
  /**
   * Which filter marked it. `two-bar` means the bar belongs to a matching pair — with the bar
   * before it or the one after — listed once either way, so an alternating run reads as several
   * entries with contiguous `at` rather than one per pair. `inside-bar` means the previous bar
   * already covered this one's range, both extremes included.
   *
   * The three are not exclusive: `inside-bar` reads only the extremes, so it lands on bars the
   * other two also marked, and `found` then holds one entry per reading. Key a mark on `at` and
   * `type` together — never on `at` or `time` alone.
   */
  type: 'two-bar' | 'reversal-bar' | 'inside-bar'
}

/**
 * One leg's marked bars and which way it ran, anchored where its `LegWindow` is.
 *
 * Carries those two and nothing else: `since` and `end` are on the `LegWindow` Point at the same
 * `time`, and restating them would be two Series claiming one fact. An empty `found` is a leg that
 * matched nothing, which is not the same as a leg missing.
 */
export interface LegReversals extends PatternPoint {
  /** An array on the wire: the Python tuple serializes as a list. */
  found: LegBar[]
  /**
   * The leg's **own** move: `bullish` when it closed on a high, `bearish` on a low.
   *
   * Not the direction the filters hunted, which is the opposite one — the bar that turns a fall is
   * a bullish bar, so a `bearish` leg holds bullish candidates. Read it as "which end of the move
   * these marks sit at", which is what a drawing needs and what `found` cannot say on its own.
   */
  direction: 'bullish' | 'bearish'
}

/**
 * One finding about one bar, with no leg around it — a Point of the `bars` Series.
 *
 * The flat counterpart to `LegBar`: there is no window to index into, so there is no `at`, and the
 * mark is not nested inside anything — `time` here *is* the anchor. Several can share it, since
 * the three filters are a union and the Forma rule can match a bar for both turns, so `time`,
 * `type` and `direction` together name one.
 */
export interface BarMark extends PatternPoint {
  /**
   * Which filter marked it — the three readings `LegBar['type']` documents, plus one no leg can
   * carry.
   *
   * `small-overlap` means the bar closed clear of the range of the bar before it: a bull bar above
   * the previous high, a bear bar below the previous low. Only this Pattern asks it, which is why
   * it widens the union here instead of in `LegBar`.
   */
  type: LegBar['type'] | 'small-overlap'
  /**
   * The turn this mark is a candidate for — a `bearish` mark is a candidate top.
   *
   * **The opposite convention to `LegReversals.direction`**, which reports the leg's own move and
   * leaves the reader to invert it. There is no leg here to invert, so the mark says outright what
   * it is a candidate for. `null` on an `inside-bar`, which reads only the extremes and makes no
   * directional claim at all.
   *
   * `small-overlap` is the exception to the sentence above: there the direction is the bar's own
   * colour, so it marks a move that *continued* rather than one that might turn. Read alongside
   * the others it sits on the opposite side of the bar from a candidate for the same turn.
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
 * order, not `at` order, unlike `LegReversals.found`.
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
   * The same direction the three points were measured for. There is no mirror here, unlike
   * `LegReversals`, whose marks are candidates for the opposite turn.
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
