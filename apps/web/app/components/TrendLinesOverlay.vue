<script setup lang="ts">
import type {
  IChartApi,
  ISeriesApi,
  MouseEventParams,
  SeriesType,
  Time,
  UTCTimestamp,
} from 'lightweight-charts'
import type { Candle } from '~/types/candle'
import type { TrendLine } from '~/types/pattern'

/**
 * Draws one trend-lines Series: a straight stroke from each `simple-leg` leg's extreme to every
 * later leg's extreme of the same side it can reach without a candle in the way.
 *
 * Renders no markup. It reaches the chart through `inject` and draws through the chart API — the
 * same shape as the other six overlays.
 *
 * The third **series primitive**, after `LegExtremesOverlay`'s levels and `BarGapOverlay`'s boxes,
 * and the first sloped one. See `TrendSegments` for why neither of those could stand in and why a
 * `LineSeries` is worse here than it was for them.
 *
 * `sides` is this Series' own filter — tops or bottoms — and it is deliberately *not* the bull/bear
 * one the three directional overlays share: see `TrendSide`. Absent means both, so the registry,
 * which knows nothing of trend lines, gets the whole Series.
 *
 * `pinned` and `onlyPinned` are the auto-hide switch and mean what they mean on the other two
 * pinnable overlays. What a pin means to *this* drawing is the thing the request calls **selecting**
 * a line: it survives the hide timer, and it carries the line's own slope past its far end out to
 * the current candle. That second half is what `extend` has meant since `LevelSegments`; only the
 * geometry is new.
 *
 * `focus` is the other half of the sidebar's `Destacar por ponto` switch: a bar, and once one is
 * chosen the only lines left on the chart are the ones arriving there — plus whatever you pinned or
 * moved, which a focus never takes away. See `trendSegments`, which decides what that means and why
 * the rest is removed rather than faded.
 *
 * `focusOnHover` is that same highlight, put on the cursor: sweep along the candles and the fan culls
 * to each bar it reaches and comes back whole between them, which is the chart read bar by bar
 * rather than a click spent per guess. It is the *second* choice — `props.focus` wins whenever the
 * page holds one — and that order is the whole arrangement: hover asks, and the click that fixes a
 * bar is what stops the drawing following the cursor, so the lines arriving there can be travelled
 * to and clicked. Which is `onClick`'s own argument about why a click on a line must not also name
 * a bar, one gesture earlier.
 *
 * `previewOnHover` is that switch a third time, at the same cursor but about a line rather than a
 * bar: the line under it is drawn as though it were selected, so a line's projection can be read
 * without committing to a pin and undoing it. It needs no condition of its own about the focus — a
 * line that is not drawn is a line you cannot hover, so only what survived the highlight previews.
 *
 * `moves` and `bars` are the hand-adjusted lines and the candles they are anchored to. Either end
 * of a selected line can be dragged onto any bar's `open`, `high`, `low` or `close`; the result is a
 * different line from the one the engine proposed and is named as one — see `movedSegments`, which
 * decides what a move *is*, and `onPointerDown` below, which is the gesture. This component holds
 * only the drag in progress: what survives the release is the page's, like every pin.
 */
const props = withDefaults(
  defineProps<{
    points: TrendLine[]
    visible: boolean
    color?: string
    /** Which sides to draw. `'high'` is the ceilings along the tops, `'low'` the floors. */
    sides?: TrendSide[]
    /** Ids of the lines to keep once `onlyPinned` is on, and to run to the live edge at all times. */
    pinned?: string[]
    /** The Series' hide timer has fired: only the selected lines are still worth the space. */
    onlyPinned?: boolean
    /** The bar whose arriving lines are the only fan left. `null` means nothing is being asked about. */
    focus?: number | null
    /** Let the bar under the cursor stand in for `focus` while the page holds none. Its switch decides. */
    focusOnHover?: boolean
    /** Draw the line under the cursor as though it were selected. The page's switch decides. */
    previewOnHover?: boolean
    /** The hand-adjusted lines, as `moveKey` strings. Each one is its own pin — see `movedSegments`. */
    moves?: string[]
    /**
     * The candle history by `time`, which is what makes the drag magnetic: an end is dropped on one
     * of the four prices a bar actually took, never between them. The same map the wick tool takes,
     * and for the same reason — the lookups are by name, one bar at a time, on mouse moves.
     */
    bars?: ReadonlyMap<number, Candle>
    /**
     * The one line that is selected right now, or `null` — the line wearing its two dots, and the
     * line the control bar over the chart is about.
     *
     * It is also the only line whose ends can be dragged. See `movable`: a dot now says "this line
     * is selected" and nothing else, and a grab starts from a selection.
     */
    selected?: string | null
  }>(),
  {
    color: '#2563eb',
    sides: () => ['high', 'low'],
    pinned: () => [],
    onlyPinned: false,
    focus: null,
    focusOnHover: false,
    previewOnHover: false,
    moves: () => [],
    bars: () => new Map(),
    selected: null,
  },
)

/**
 * A line was clicked. The id is `trendSegmentId`'s, and what to do about it is the page's business:
 * this component has no memory of its own and is redrawn from `pinned`, `moves` and `selected`.
 *
 * `pin` means *add*, not toggle. A line no longer leaves the list through a click on the chart —
 * that click selects it now — and leaves it through the control bar's `Trash` instead.
 *
 * `bar` is the same arrangement for the highlight: the bar a click landed on, or `null` for a bar
 * the fan does not reach — which is the highlight being *cleared*, not a bar being named. A click
 * past the data emits nothing at all; see `onClick`. Whether any of it means anything is the page's
 * to decide, which is why the page only listens while its switch is on.
 *
 * The two are exclusive — a click reports one thing or the other, never both. See `onClick`.
 */
const emit = defineEmits<{
  pin: [id: string]
  /**
   * The line a click landed on, or `null` when the page is being told the selection it holds no
   * longer resolves to anything drawn.
   *
   * The drawn segment's id, not the Point's and not a `moveKey`: it is what the hit test hands back
   * and what `setHandle` is named in. A move changes it — the line the drag made is a different
   * drawn line — which is why a release emits this too, with the new id.
   */
  select: [id: string | null]
  bar: [time: number | null]
  /**
   * One of a selected line's two ends was dragged onto a candle and released. The payload is
   * `moveKey`'s string, which names the line it was made from as well as where *both* its ends now
   * sit — everything the page has to store, and nothing it has to interpret. A drag of one end
   * therefore carries the other end's earlier move with it rather than discarding it.
   *
   * What that does to the old line, to its pin and to any earlier move of it is the page's, for the
   * reason `pin` is: this component is redrawn from `moves` and remembers nothing.
   */
  move: [key: string]
  // There is no `unmove`. Removing a line is the control bar's `Trash` now, and which of the two
  // doors a line leaves by — its pin or its move — is decided where it has always had to be: on the
  // page, which is what the `Selecionadas` list's `✕` already does.
}>()

const candleSeries = inject(CANDLE_SERIES, shallowRef(null))
const chart = inject(CHART, shallowRef(null))

/**
 * `props.color` is **used** here, unlike on the other two primitives, which accept it for the
 * registry's sake and then ignore it. There is nothing about a line that one Series-wide colour
 * cannot say: which side it runs along is the most visible thing on the chart about it. See
 * `trendSegments`, which is where that argument is written out, and which is why the sidebar has a
 * side filter but no colour key.
 */

/**
 * What to hand the primitive: the Series' lines and the hand-adjusted ones, or only what was
 * selected once the timer has fired. Both shaping functions live in `~/utils/trend-lines` because
 * the sidebar lists the same lines in words.
 */
function segmentsToDraw(): DrawnTrend[] {
  const drag = dragging.value

  const pinned = new Set(props.pinned)
  // A line being dragged falls back into the fan for the duration, which is exactly what a release
  // will do to it for good. Drawing the pin's projection beside the one you are placing would show
  // two answers to a question that has one.
  if (drag) pinned.delete(drag.origin)

  // The drag *is* a move, uncommitted: one shaping function draws it, so what you are placing and
  // what you get cannot come out looking like two different lines.
  const moves = drag
    ? [...props.moves.filter(key => parseMove(key)?.origin !== drag.origin), moveKeyOf(drag)]
    : props.moves

  // The bar the fan is culled to: the one the page fixed, and failing that the one under the
  // cursor. `??` and not `||`, so a fixed bar is honoured even at time zero.
  const focus = props.focus ?? hoveredBar.value

  const segments = [
    ...trendSegments(props.points, props.sides, props.color, pinned, focus, hovered.value),
    ...movedSegments(props.points, props.sides, props.color, moves, props.bars),
  ]

  // Still the real pins, not the hover: the timer keeps what you decided to keep, and the cursor
  // has not decided anything. A moved line is kept unconditionally — the move is its pin.
  return props.onlyPinned
    ? segments.filter(segment => pinned.has(segment.id) || segment.origin !== undefined)
    : segments
}

/**
 * The line under the cursor, or `null`.
 *
 * A `ref` rather than a plain `let`, unlike `drawnIds`: this one is read by the redraw watcher, and
 * the whole feature is that moving the mouse redraws.
 */
const hovered = shallowRef<string | null>(null)

/**
 * The bar under the cursor, when it is one the fan reaches and the page holds no focus of its own.
 *
 * Held here rather than pushed at the page, unlike the click's bar: a preview is not a decision.
 * Nothing about it is stored, nothing survives the cursor leaving, and the sidebar's `· hh:mm` goes
 * on naming the bar somebody actually fixed — which is also what keeps the two legible side by side.
 */
const hoveredBar = shallowRef<number | null>(null)

/**
 * A line whose ends can be taken hold of: where they currently are, and what a drag of one would be
 * a move *of*.
 *
 * The selected line, and only it. The fan runs to some hundreds of strokes and a click in it is
 * already a near thing; making every one of them draggable would turn the gesture that reads the
 * chart into the gesture that edits it. Selecting a line is the deliberate act that says this is
 * the line you are working on.
 *
 * Narrower than it was, and that is the trade the dots now pay for: every *pinned* line used to
 * grow handles under the cursor and be draggable there and then. A dot said two things at once —
 * "this can be grabbed" and, once there was such a thing, "this is selected" — and the second is
 * the one worth keeping. So a line is selected first and dragged second, which is the order every
 * drawing tool asks for.
 *
 * Both ends are here because a drag of one has to carry the other: a near end placed by hand is not
 * re-derived from the Point on the next drag of the far end, it is kept.
 */
interface Grabbable {
  /** The drawn segment's id, which is what the hit test hands back. */
  id: string
  /** The engine's line this is, or was made from. A second move replaces the first. */
  origin: string
  /** Which side it runs along, so the drag can name the line it is making. */
  side: TrendSide
  /** Where each end currently sits, so a drag that never finds a bar changes nothing. */
  fromTime: number
  toTime: number
  /** And at what price, which is what puts the two dots on the pane. See `nearestEnd`. */
  fromPrice: number
  toPrice: number
  /** The far end's anchor on its bar. */
  field: PriceField
  /**
   * The near end's, or `null` while it is still the Point's own extreme. The asymmetry is
   * `TrendMove`'s and means the same thing: a near end nobody has moved follows its leg.
   */
  fromField: PriceField | null
}

/**
 * One of those, with the end the cursor is on. Decided at hover and carried through the press, so
 * the dot that grew under the cursor is the end that moves — the press itself re-deciding would let
 * a pixel of travel between hover and click swap which end you thought you had hold of.
 */
interface Grabbed extends Grabbable {
  end: 'from' | 'to'
}

/**
 * A drag in progress: the grabbed line, with the end being carried wherever the cursor has put it.
 *
 * `changed` is whether the cursor ever reached a bar other than the one that end already sat on.
 * A drag that never did is not a move — it is a slip of the hand on the way to a click, and
 * committing it would mark a line as adjusted without adjusting it.
 */
interface Drag extends Grabbed {
  changed: boolean
}

/**
 * What a line's current ends are called as a move — **both** of them, however few this particular
 * drag touched. That is what merges a near-end drag into an existing far-end move rather than
 * throwing it away: the drag started from the drawn segment, which already carries whatever the
 * last move put on it.
 *
 * Takes a `Grabbable` rather than a `Drag` because the click handler wants it too: un-moving a line
 * has to name the key that was stored, and a stored key is the same two ends this mints.
 */
function moveKeyOf(grab: Grabbable): string {
  return moveKey(
    grab.origin,
    { time: grab.toTime, field: grab.field },
    grab.fromField ? { time: grab.fromTime, field: grab.fromField } : null,
  )
}

/**
 * How far the pointer must travel with the button down before this is a drag rather than a click.
 *
 * The whole reason there is a threshold: a press on a dot that turns out to be a click still has
 * to be a click — it is how the line is selected in the first place, and how a selection is kept
 * while reaching for its control bar. Without a few pixels of slack every one of those would
 * instead commit a move of the line to wherever the cursor happened to be.
 */
const GRAB_THRESHOLD = 3

/**
 * How near an endpoint the cursor must be for that end to be the one a press takes hold of, in CSS
 * pixels — a little wider than the dot is, so the aim is the dot rather than its exact centre.
 *
 * Wider than `HIT_TOLERANCE` too, and now it is the only test there is: the dots belong to the
 * selected line whether the cursor is on the stroke or not, so a dot sitting a few pixels off the
 * line can be aimed at directly rather than by first finding the line under it.
 */
const GRAB_RADIUS = 9

/**
 * The end under the cursor, if the cursor is on one, kept out of the reactive graph on purpose: it
 * changes on every mouse move, and nothing about the drawing depends on it — the dots are pushed
 * straight at the primitive. Only `pointerdown` reads it.
 *
 * `null` while the cursor is on a movable line but on neither of its ends. That is the whole of
 * what parking the dots cost: a press in the middle of a line no longer starts a drag, because
 * there is nothing drawn there to have grabbed. It goes back to being a click, which is what a
 * press more than a few pixels from the old sliding dot already was.
 */
let grabbable: Grabbed | null = null

/** The button is down on an end, but it has not moved far enough to be a drag yet. */
let pressed: { grab: Grabbed, x: number, y: number } | null = null

/**
 * The drag in progress, or `null`. A `ref`, unlike the two above: this one reshapes the Series on
 * every frame, because the line is redrawn to the end you are carrying.
 */
const dragging = shallowRef<Drag | null>(null)

/**
 * The release that just ended a drag, as the id the line now carries — so the library's own click,
 * which arrives after it, is not read as a click on the line.
 *
 * An id rather than a flag, and that is the whole of what selection cost here: that click has to be
 * *claimed*, not swallowed. A click nobody claims clears the selection — see `PaneClicks` — so a
 * silent return would deselect the line the drag was placing. Consumed once; see `onClick`.
 */
let justDragged: string | null = null

/**
 * Which of a bar's four prices the cursor is nearest, in *pixels* rather than in price.
 *
 * The distance that matters is the one on screen: two prices a tick apart are one place to aim at,
 * and on a logarithmic scale equal price gaps are not equal distances at all. `priceToCoordinate`
 * is the same conversion the primitive draws through, so the anchor that lights up is the one under
 * the cursor.
 */
function snapTo(bar: Candle, y: number): PriceField | null {
  const series = candleSeries.value
  if (!series) return null

  let best: PriceField | null = null
  let nearest = Number.POSITIVE_INFINITY

  for (const field of PRICE_FIELDS) {
    const coordinate = series.priceToCoordinate(bar[field])
    if (coordinate === null) continue

    const gap = Math.abs(coordinate - y)
    if (gap >= nearest) continue

    best = field
    nearest = gap
  }

  return best
}

/**
 * Which of a line's two ends the cursor is close enough to take hold of, or `null` for neither.
 *
 * In pixels, through the same two scales `snapTo` and the primitive both convert with — the ends
 * are dots on a pane, and the distance to a dot is a distance on screen. The nearer end wins, which
 * matters only on a line so short that both dots are in reach at once; there the one being aimed at
 * is the one the cursor is nearer.
 *
 * Note that this reads the *anchors*, never the projection a selected line carries to the live
 * edge. That tip is a drawing, not an end, and nothing about it can be dragged.
 */
function nearestEnd(grab: Grabbable, point: { x: number, y: number }): 'from' | 'to' | null {
  const series = candleSeries.value
  const timeScale = chart.value?.timeScale()
  if (!series || !timeScale) return null

  let best: 'from' | 'to' | null = null
  let nearest = GRAB_RADIUS

  const ends = [
    { end: 'from' as const, time: grab.fromTime, price: grab.fromPrice },
    { end: 'to' as const, time: grab.toTime, price: grab.toPrice },
  ]

  for (const { end, time, price } of ends) {
    const x = timeScale.timeToCoordinate(time as UTCTimestamp)
    if (x === null) continue

    const y = series.priceToCoordinate(price)
    if (y === null) continue

    const gap = Math.hypot(x - point.x, y - point.y)
    if (gap > nearest) continue

    best = end
    nearest = gap
  }

  return best
}

/**
 * The cursor moved while one of a line's ends is being carried: put that end on the nearest anchor
 * of the bar underneath.
 *
 * Nothing happens when there is no bar under the cursor — past the last candle, or off the pane —
 * and the end stays where it last landed rather than snapping back or following the mouse into
 * open space. An end dropped on the wrong side of the one that is standing still is refused for
 * `movedSegments`' reason: that is not a shorter line, it is not a line. Which side is wrong
 * depends on which end is being carried, and that is the only thing the two directions differ in.
 */
function dragTo(param: MouseEventParams<Time>) {
  const drag = dragging.value
  if (!drag) return

  const y = param.point?.y
  if (y === undefined) return
  if (typeof param.time !== 'number') return

  const bar = props.bars.get(param.time)
  if (!bar) return

  const carrying = drag.end === 'to'
  if (carrying ? param.time <= drag.fromTime : param.time >= drag.toTime) return

  const field = snapTo(bar, y)
  if (field === null) return

  // Every mouse move inside one candle reports the same anchor; only a change is worth reshaping
  // the Series and repainting for.
  const at = carrying ? drag.toTime : drag.fromTime
  const on = carrying ? drag.field : drag.fromField
  if (param.time === at && field === on) return

  dragging.value = carrying
    ? { ...drag, toTime: param.time, field, changed: true }
    : { ...drag, fromTime: param.time, fromField: field, changed: true }
}

/**
 * The cursor moved: note which of this Series' lines it is on, and which bar it is over, so the
 * drawing can try both on.
 *
 * The first `subscribeCrosshairMove` in the app, and the click subscription could not stand in for
 * a plain reason: the point is to answer *before* the click. What it reads is the same
 * `hoveredInfo.objectId` the click reads, so it carries `onClick`'s two caveats with it — every
 * primitive reports into that one field, hence the `drawnIds` check, and a touch that never hovers
 * previews nothing. It loses nothing either: tapping still selects, and tapping a bar still fixes it.
 *
 * Two answers out of one move, and they are independent: `hovered` is a line trying on a pin, and
 * `hoveredBar` is the whole fan trying on a highlight. A cursor over a candle usually sets the
 * second and not the first.
 */
function onCrosshairMove(param: MouseEventParams<Time>) {
  // Only what the pointer actually did. The library re-fires this after every repaint — including
  // the repaint `setHandle` itself asks for — and those echoes carry the *last* point with no
  // `hoveredInfo` at all, which reads here as "the cursor is on nothing". Acting on one throws away
  // what the real mouse move a frame earlier established: the handle goes out and, worse, so does
  // `grabbable`, so the press that follows a perfectly good hover starts no drag. The cursor is the
  // only thing this handler is about, and the cursor moves in real events.
  if (!param.sourceEvent) return

  // A drag owns the cursor: what is under it is a bar to drop an end on, not a line to hover. The
  // handle is set by the redraw watcher for the duration, since the line it belongs to is being
  // rebuilt on every frame.
  if (dragging.value) {
    // And a drag owns the highlight with it. A fan reshaping under the end you are placing is the
    // one thing worse than no preview at all — the line you are dragging would leave the chart the
    // moment the cursor crossed a pivot.
    hoveredBar.value = null
    dragTo(param)
    return
  }

  const id = param.hoveredInfo?.objectId

  // The grab affordance, read off the *selection* rather than off what the cursor is over: the
  // selected line's two dots are already drawn by the watcher, and all the cursor decides here is
  // which of them a press would take — the one in reach, drawn larger. Pushed straight at the
  // primitive rather than through the watcher, because a dot growing by two pixels is not a reason
  // to reshape a fan of several hundred lines.
  //
  // Not gated on the line being hovered, which is what parking the dots on the anchors earned: a
  // dot several pixels clear of its own stroke is aimed at directly now, instead of only counting
  // once the stroke under it had been found.
  const grab = props.selected === null ? null : movable.get(props.selected) ?? null
  const end = grab && param.point ? nearestEnd(grab, param.point) : null
  grabbable = grab && end ? { ...grab, end } : null
  if (grab) primitive?.setHandle({ id: grab.id, active: end })

  // The same question the click asks of a bar, asked a gesture earlier and answered the same way,
  // so hover and click cannot come to disagree about which bars are worth anything. A press already
  // resting on a handle counts as a drag about to happen and previews nothing.
  const bar = props.focusOnHover && !pressed && typeof param.time === 'number'
    && linesArriveAt(props.points, props.sides, param.time)
    ? param.time
    : null

  const next = props.previewOnHover && typeof id === 'string' && drawnIds.has(id) ? id : null

  // This fires on every mouse move across the pane. Only a change is worth reshaping the Series
  // and repainting for — either half of it.
  if (next === hovered.value && bar === hoveredBar.value) return
  hovered.value = next
  hoveredBar.value = bar
}

/**
 * The cursor left the pane: nothing is hovered any more, neither the line nor the bar.
 *
 * A DOM event because the library has none to offer — its crosshair subscription goes quiet on the
 * way out rather than reporting the exit, and what it does fire afterwards are the repaint echoes
 * `onCrosshairMove` deliberately ignores. Without this the fan stayed culled to whichever bar the
 * mouse happened to cross last on its way to the sidebar, which reads as a bar somebody fixed and
 * is a highlight nobody asked for.
 *
 * Not during a drag: the pointer is allowed to leave the pane with a line's end still on it, and
 * the drag ends on the release, not on the border.
 */
function onPointerLeave() {
  if (dragging.value) return
  hovered.value = null
  hoveredBar.value = null
}

/**
 * The button went down on a line whose end can be carried. Not a drag yet — see `GRAB_THRESHOLD`.
 *
 * DOM events rather than the chart's own subscriptions, which report clicks and crosshair moves and
 * have nothing to say about a button being held. `chartElement()` is the library's own node, so
 * this costs `CandleChart` nothing: an overlay that draws through the chart API reaches its pane
 * the same way.
 */
function onPointerDown(event: PointerEvent) {
  // The primary button only. A right-click on the pane is the browser's business.
  if (event.button !== 0) return
  if (!grabbable) return

  pressed = { grab: grabbable, x: event.clientX, y: event.clientY }

  // Here and not at the threshold below, which is the whole of what the threshold cost us: the
  // library starts its own pan on the press, and an option changed a frame later does not call it
  // off — the chart slid under the line for as long as the button was down. Suspending it on the
  // press costs a click nothing, since a press that turns out to be a click never scrolled anyway.
  chart.value?.applyOptions({ handleScroll: false, handleScale: false })
}

function onPointerMove(event: PointerEvent) {
  if (!pressed || dragging.value) return
  if (Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) < GRAB_THRESHOLD) return

  dragging.value = { ...pressed.grab, changed: false }
}

/**
 * The release: what was being carried becomes a move of the whole line — see `moveKeyOf` — and the
 * page decides what that costs the line it was made from.
 *
 * On `window` rather than on the pane, so a release outside the chart still ends the drag. The end
 * stays wherever the last bar under the cursor put it, which is the honest reading of letting go
 * off the edge of the pane.
 */
function onPointerUp() {
  const drag = dragging.value
  const held = pressed !== null
  pressed = null

  if (!drag) {
    // A press that never became a drag: give the chart its pan back and leave the click alone.
    if (held) chart.value?.applyOptions({ handleScroll: true, handleScale: true })
    return
  }

  const changed = drag.changed
  endDrag()

  // What the line is called once this release has landed: the drag's own id when it moved, and the
  // id it already had when it did not.
  const id = changed
    ? movedTrendId(drag.fromTime, drag.toTime, drag.side, drag.field, drag.fromField)
    : drag.id

  // The library turns a mouse-up into a click of its own, and it arrives after this. Set before the
  // `changed` test and not after it, because both endings need it: one would deselect the line it
  // just made, and the other the line it failed to move. Cleared on the next turn of the loop, so a
  // drag the library did *not* follow with a click cannot swallow the next real one.
  justDragged = id
  setTimeout(() => {
    justDragged = null
  })

  // A drag that never reached another bar is not a move. Nothing is emitted, and the line is left
  // exactly as it was — including, if it was one, still pinned and still selected.
  if (!changed) return

  emit('move', moveKeyOf(drag))

  // Here rather than left to the synthetic click below, which would also get there: between the
  // redraw `move` triggers and that click the selection would name a line that no longer exists,
  // and the dots would blink out for a frame in the middle of a gesture that never let go of them.
  emit('select', id)
}

/** Give the chart its own drag back, and stop carrying anything. */
function endDrag() {
  chart.value?.applyOptions({ handleScroll: true, handleScale: true })
  dragging.value = null

  // Back to the selected line's own two dots rather than to none: the drag is over, the line is
  // still selected, and `null` here would take its dots away until the cursor next moved. A line
  // the drag renamed does not match anything drawn for the one frame before `select` lands, which
  // draws no dots and is the same nothing `null` would have.
  primitive?.setHandle(props.selected === null ? null : { id: props.selected, active: null })
}

/** Escape abandons the drag: the line goes back to where it was and nothing is emitted. */
function onKeyDown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  if (!pressed && !dragging.value) return
  pressed = null
  endDrag()
}

/**
 * A click on the pane is one of two things: a click on one of *this* Series' lines, or a click on
 * the bar underneath it.
 *
 * Exclusive, and the line wins. Selecting a line is what you do *with* a highlighted pivot — you
 * take one of the lines arriving there, then another — and those clicks land wherever the line
 * happens to be, which is almost never over the focused bar. Letting them also name a bar moved the
 * highlight off the pivot on the first pin and took every line you were about to click next off the
 * chart, so the feature ended after one selection.
 *
 * Once a focus is set the only lines on the chart are the ones that answer it and the ones you
 * kept, so a click that reaches this branch is a click on one of those. Everything else — the
 * candles, and the pane the rest of the fan used to fill — is about a bar.
 *
 * And about a bar in one of two ways, because most bars are not worth highlighting. A bar the fan
 * reaches asks a new question. A bar it does not reach is not a question at all — highlighting it
 * would leave the chart empty — so it ends the one on screen and gives the fan back. That is the
 * cheap way out of a highlight, and the switch is the deliberate one.
 *
 * What a click *is*, now that the cursor already highlights what it passes over: not the choosing of
 * a bar but the keeping of one. The hover has shown you the answer by the time you press, and the
 * press is what stops the drawing following the cursor — see `focusOnHover` — so that the lines
 * arriving there hold still long enough to be travelled to and clicked.
 *
 * `hoveredInfo.objectId` is whatever the primitives' hit tests last returned for the cursor, so
 * this is a mouse affordance: a touch that never hovers leaves it unset and nothing is selected.
 *
 * The id check is not a formality. Every primitive on the chart reports into the same field, and
 * there are now three of them — a click on a level or a gap would otherwise read as a click on a
 * line.
 *
 * While the hide timer is hiding there is no bar half to be had. `onlyPinned` takes the fan off the
 * chart and leaves the selected lines — see `segmentsToDraw` — and a focus is read against the fan
 * it was picked out of, so a click naming a bar there moves the highlight somewhere nobody can
 * watch it land, then hands it back cut down when the next candle brings the fan in. The line half of
 * the click is untouched: what survived the hide is on screen, and clicking it still deselects it.
 */
function onClick(param: MouseEventParams<Time>) {
  // The click the library makes out of a drag's release. It named a line, but it did not mean it —
  // and it is claimed rather than dropped, because an unclaimed click is what deselects.
  if (justDragged !== null) {
    emit('select', justDragged)
    justDragged = null
    return
  }

  const id = param.hoveredInfo?.objectId
  if (typeof id === 'string' && drawnIds.has(id)) {
    // A first click does both: the line is pinned — which is what extends it to the live edge —
    // *and* becomes the selected one, so its actions are one click away rather than two. A line
    // that is already on the list is only selected, which is the whole change: that click used to
    // take it off. A moved line is never pinned, the move being its own pin.
    if (!props.pinned.includes(id) && !isMoved(id)) emit('pin', id)
    emit('select', id)
    return
  }

  // Below the branch above and not at the top of the handler, which is the whole point: the lines
  // the timer kept are still drawn and still answer clicks. It is only the fan they were picked out
  // of that is gone, and with it the question a bar answers.
  if (props.onlyPinned) return

  // A click past the last bar, where `time` is absent, names no bar and is reported as nothing: a
  // missed click cannot cost the highlight, which is the one case that is neither a new question
  // nor an answer to the old one.
  if (typeof param.time !== 'number') return

  // The fan's own reading of the bar, asked here rather than on the page because `points` and the
  // side filter are both props: a bar lines arrive at, or the clear.
  emit('bar', linesArriveAt(props.points, props.sides, param.time) ? param.time : null)
}

/** The ids currently handed to the primitive, which is exactly what a click can name. */
let drawnIds = new Set<string>()

/**
 * Which of those are hand-placed lines rather than lines the engine proposed.
 *
 * Read by `onClick` alone, to keep it from pinning one: a move is its own pin, and there is no
 * Point behind a moved line for a pin to name. `movable` cannot answer this any more — it holds
 * the selected line and nothing else.
 */
let moved = new Set<string>()

function isMoved(id: string): boolean {
  return moved.has(id)
}

/**
 * The subset of those whose ends can be carried, by id — the selected lines and the moved ones.
 * Rebuilt beside `drawnIds`, so what the cursor offers handles on is exactly what is on screen.
 */
let movable = new Map<string, Grabbable>()

/**
 * The chart this is subscribed to, so the unsubscribe cannot go to a different one. Declared above
 * the watcher, which runs `immediate` — a `let` read before its declaration is a ReferenceError.
 */
let subscribed: IChartApi | null = null

/**
 * The chart's own DOM node, held for the reason `subscribed` is — the unlisten has to reach the
 * node the listen reached — and declared here rather than beside its handlers for the same reason
 * that one is: the watcher below runs `immediate`.
 */
let pane: HTMLElement | null = null

// The primitive hangs on the candlestick series: it is positioned by `time` and `price` against
// the series it is attached to, and this overlay owns no series of its own.
let primitive: TrendSegments | null = null

// Same reason the other overlays wait on their refs: the candlestick series is created in the
// parent's `onMounted`, which runs after this component's.
watch(
  [
    candleSeries,
    chart,
    () => props.points,
    () => props.visible,
    () => props.color,
    () => props.sides,
    () => props.pinned,
    () => props.onlyPinned,
    () => props.focus,
    () => props.focusOnHover,
    () => props.previewOnHover,
    () => props.moves,
    () => props.bars,
    () => props.selected,
    hovered,
    hoveredBar,
    dragging,
  ],
  ([bars, api]) => {
    if (!bars) return

    if (!primitive) {
      primitive = new TrendSegments({ lineWidth: 1 })
      // The cast is the same one the other overlays make: the candlestick series is declared on
      // the chart's generic horizontal scale, and a primitive is typed on `Time`.
      ;(bars as ISeriesApi<SeriesType, Time>).attachPrimitive(primitive)
    }

    if (api && !subscribed) {
      api.subscribeClick(onClick)
      api.subscribeCrosshairMove(onCrosshairMove)

      // The drag's three events, which the chart's own subscriptions do not report. `pointerup` and
      // the key go on `window`: a release or an Escape outside the pane has to end the drag, or the
      // chart would still be carrying a line with the button already up.
      pane = api.chartElement()
      pane.addEventListener('pointerdown', onPointerDown)
      pane.addEventListener('pointermove', onPointerMove)
      pane.addEventListener('pointerleave', onPointerLeave)
      window.addEventListener('pointerup', onPointerUp)
      window.addEventListener('keydown', onKeyDown)

      subscribed = api
    }

    // Hidden by holding no lines rather than by detaching — the `setMarkers([])` precedent, and
    // the same trade both other primitives make: an empty draw is a `return`.
    const segments = props.visible ? segmentsToDraw() : []
    drawnIds = new Set(segments.map(segment => segment.id))
    moved = new Set(segments.filter(segment => segment.origin !== undefined).map(segment => segment.id))

    movable = new Map(
      segments
        // The selected line, and nothing else. It is a `Map` of one rather than an object because
        // the drag reads it by id — including, mid-drag, by an id the selection has not caught up
        // with yet.
        .filter(segment => segment.id === props.selected)
        .map(segment => [
          segment.id,
          {
            id: segment.id,
            origin: segment.origin ?? segment.id,
            side: segment.side,
            fromTime: segment.from.time,
            toTime: segment.to.time,
            fromPrice: segment.fromPrice,
            toPrice: segment.toPrice,
            // An engine line's far end has no anchor of its own: it was drawn through a leg's
            // extreme, which is that bar's high or its low depending on which side the line runs
            // along. Only a starting value — the first bar the cursor reaches replaces it.
            field: segment.field ?? segment.side,
            // The near end's stays absent until somebody drags it, which is what says the line is
            // still hinged on the Point rather than on a bar. See `TrendMove`.
            fromField: segment.fromField ?? null,
          },
        ]),
    )

    primitive.setSegments(segments)

    // A selection that no longer resolves — the Series switched off, a side filtered out, the line
    // gone from a re-run — is handed back rather than left to rot: the page would otherwise float a
    // control bar over a line nobody can see. Not while a drag is in flight, where the id being
    // drawn is deliberately ahead of the one the page holds.
    if (props.selected !== null && !dragging.value && !drawnIds.has(props.selected)) emit('select', null)

    // The selected line wears its dots for as long as it is selected — that is what says it is
    // selected. `active: null` because which dot is in reach is the cursor's business, and
    // `onCrosshairMove` answers it without coming back through here.
    primitive.setHandle(
      props.selected !== null && drawnIds.has(props.selected)
        ? { id: props.selected, active: null }
        : null,
    )

    // While a line is being carried the handle follows it instead: set here rather than at the
    // cursor because the segment it belongs to is minted afresh on every frame of the drag, under a
    // new id each time an end reaches another bar. `active` is the end in hand. See `TrendHandle`.
    const drag = dragging.value
    if (drag) {
      primitive.setHandle({
        id: movedTrendId(drag.fromTime, drag.toTime, drag.side, drag.field, drag.fromField),
        active: drag.end,
      })
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  // A drag cut short by a navigation would otherwise leave the chart unable to pan.
  endDrag()

  // Only matters when this overlay is unmounted while the chart lives on. When the whole chart
  // goes, `chart.remove()` has already taken the series and everything attached to it.
  const bars = candleSeries.value
  if (primitive && bars) (bars as ISeriesApi<SeriesType, Time>).detachPrimitive(primitive)
  primitive = null

  // Unlike the primitive, this outlives the series: a click subscription is held by the chart, and
  // an overlay that came and went would leave a handler emitting into a dead component.
  subscribed?.unsubscribeClick(onClick)
  subscribed?.unsubscribeCrosshairMove(onCrosshairMove)
  subscribed = null

  pane?.removeEventListener('pointerdown', onPointerDown)
  pane?.removeEventListener('pointermove', onPointerMove)
  pane?.removeEventListener('pointerleave', onPointerLeave)
  pane = null
  window.removeEventListener('pointerup', onPointerUp)
  window.removeEventListener('keydown', onKeyDown)
})
</script>

<template>
  <!-- Draws through the chart API, not the DOM. -->
</template>
