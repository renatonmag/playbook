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
 * `focus` is the other half of the sidebar's `Destacar por ponto` switch: a bar, whose arriving
 * lines keep the Series' colour while the rest of the fan fades. See `trendSegments`, which decides
 * what that means. A dimmed line is still *drawn* — the highlight is emphasis, not a filter — but it
 * is no longer a target: the fan is dense enough that a faded line lies across a lit one every few
 * pixels, so a backdrop that still took clicks would hand back the wrong line most of the time.
 *
 * `previewOnHover` is that switch again, at the cursor: the line under it is drawn as though it were
 * selected, so a line's projection can be read without committing to a pin and undoing it. It needs
 * no condition of its own about the focus — a line you cannot hit is a line you cannot hover, so
 * once a bar is chosen only the lit lines preview.
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
    /** The bar whose arriving lines stay lit. `null` means nothing is being asked about. */
    focus?: number | null
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
  }>(),
  {
    color: '#2563eb',
    sides: () => ['high', 'low'],
    pinned: () => [],
    onlyPinned: false,
    focus: null,
    previewOnHover: false,
    moves: () => [],
    bars: () => new Map(),
  },
)

/**
 * A line was clicked. The id is `trendSegmentId`'s, and what to do about it — select, deselect — is
 * the page's business: this component has no memory of its own and is redrawn from `pinned`.
 *
 * `bar` is the same arrangement for the highlight: the bar a click landed on, `null` when it landed
 * past the data. Whether that sets a focus or means nothing at all is the page's to decide, which is
 * why the page only listens while its switch is on.
 *
 * The two are exclusive — a click reports one thing or the other, never both. See `onClick`.
 */
const emit = defineEmits<{
  pin: [id: string]
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
  /**
   * A moved line was clicked. Its own `moveKey`, and the page is expected to drop it.
   *
   * Not `pin`, which is the same gesture on the line beside it, because the two name different
   * things: `pin`'s id belongs to a Point the pipeline produced, and a moved line answers to no
   * such Point. What they share is the meaning — clicking a selected line deselects it — and a
   * moved line is selected by definition, so this is what deselecting one is.
   */
  unmove: [key: string]
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

  const segments = [
    ...trendSegments(props.points, props.sides, props.color, pinned, props.focus, hovered.value),
    ...movedSegments(props.points, props.sides, props.color, moves, props.bars, props.focus),
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
 * A line whose ends can be taken hold of: where they currently are, and what a drag of one would be
 * a move *of*.
 *
 * Only selected lines get handles. The fan runs to some hundreds of strokes and a click in it is
 * already a near thing; making every one of them draggable would turn the gesture that reads the
 * chart into the gesture that edits it. Selecting a line is the deliberate act that says this is
 * the line you are working on, and it is the same act on a line you have already moved — a move is
 * its own pin.
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
 * The whole reason there is a threshold: a click on a selected line has always meant *deselect*,
 * and it still does. Without a few pixels of slack every attempt to unpin a line would instead
 * commit a move of it to wherever the cursor happened to be.
 */
const GRAB_THRESHOLD = 3

/**
 * How near an endpoint the cursor must be for that end to be the one a press takes hold of, in CSS
 * pixels — a little wider than the dot is, so the aim is the dot rather than its exact centre.
 *
 * Wider than `HIT_TOLERANCE` too, deliberately: the line has to be hovered at all for either dot to
 * be drawn, so this is only ever measured along a line the cursor is already within four pixels of.
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
 * The release that just ended a drag, so the library's own click — which arrives after it — is not
 * read as a click on the line. Consumed once; see `onClick`.
 */
let justDragged = false

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
 * The cursor moved: note which of this Series' lines it is on, so the drawing can try that one on.
 *
 * The first `subscribeCrosshairMove` in the app, and the click subscription could not stand in for
 * a plain reason: the point is to answer *before* the click. What it reads is the same
 * `hoveredInfo.objectId` the click reads, so it carries `onClick`'s two caveats with it — every
 * primitive reports into that one field, hence the `drawnIds` check, and a touch that never hovers
 * previews nothing. It loses nothing either: tapping still selects.
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
    dragTo(param)
    return
  }

  const id = param.hoveredInfo?.objectId

  // The grab affordance: both of the hovered line's ends, each parked on its own bar, with the one
  // in reach of the cursor drawn larger. Pushed straight at the primitive rather than through the
  // watcher, because a dot growing by two pixels is not a reason to reshape a fan of several
  // hundred lines.
  const grab = typeof id === 'string' ? movable.get(id) ?? null : null
  const end = grab && param.point ? nearestEnd(grab, param.point) : null
  grabbable = grab && end ? { ...grab, end } : null
  primitive?.setHandle(grab ? { id: grab.id, active: end } : null)

  const next = props.previewOnHover && typeof id === 'string' && drawnIds.has(id) ? id : null

  // This fires on every mouse move across the pane. Only a change is worth reshaping the Series
  // and repainting for.
  if (next === hovered.value) return
  hovered.value = next
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

  // The library turns a mouse-up into a click of its own, and it arrives after this. Set before the
  // `changed` test and not after it, because both endings need it: one would deselect the line it
  // just made, and the other would deselect the line it failed to move. Cleared on the next turn of
  // the loop, so a drag the library did *not* follow with a click cannot swallow the next real one.
  justDragged = true
  setTimeout(() => {
    justDragged = false
  })

  // A drag that never reached another bar is not a move. Nothing is emitted, and the line is left
  // exactly as it was — including, if it was one, still pinned.
  if (!changed) return

  emit('move', moveKeyOf(drag))
}

/** Give the chart its own drag back, and stop carrying anything. */
function endDrag() {
  chart.value?.applyOptions({ handleScroll: true, handleScale: true })
  dragging.value = null
  primitive?.setHandle(null)
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
 * highlight off the pivot on the first pin and dimmed every line you were about to click next, so
 * the feature ended after one selection.
 *
 * Once a focus is set only the lit lines are hit-testable, so the click that reaches this branch is
 * a click on a line that answers the question being asked. Everything else — the dimmed backdrop,
 * the candles, empty pane — asks a new question, and names a bar.
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
 * watch it land, then hands it back dimmed when the next candle brings the fan in. The line half of
 * the click is untouched: what survived the hide is on screen, and clicking it still deselects it.
 */
function onClick(param: MouseEventParams<Time>) {
  // The click the library makes out of a drag's release. It named a line, but it did not mean it.
  if (justDragged) {
    justDragged = false
    return
  }

  const id = param.hoveredInfo?.objectId
  if (typeof id === 'string' && drawnIds.has(id)) {
    // A line you placed by hand and a line the engine proposed are deselected by the same click,
    // and they are deselected out of two different places. See `unmove`.
    const grab = movable.get(id)
    if (grab && grab.origin !== grab.id) emit('unmove', moveKeyOf(grab))
    else emit('pin', id)
    return
  }

  // Below the branch above and not at the top of the handler, which is the whole point: the lines
  // the timer kept are still drawn and still answer clicks. It is only the fan they were picked out
  // of that is gone, and with it the question a bar answers.
  if (props.onlyPinned) return

  // A bar time is a number on this chart's scale; anything else — or a click past the last bar,
  // where `time` is absent — names no bar.
  emit('bar', typeof param.time === 'number' ? param.time : null)
}

/** The ids currently handed to the primitive, which is exactly what a click can name. */
let drawnIds = new Set<string>()

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
    () => props.previewOnHover,
    () => props.moves,
    () => props.bars,
    hovered,
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
      window.addEventListener('pointerup', onPointerUp)
      window.addEventListener('keydown', onKeyDown)

      subscribed = api
    }

    // Hidden by holding no lines rather than by detaching — the `setMarkers([])` precedent, and
    // the same trade both other primitives make: an empty draw is a `return`.
    const segments = props.visible ? segmentsToDraw() : []
    drawnIds = new Set(segments.map(segment => segment.id))

    const pinned = new Set(props.pinned)
    movable = new Map(
      segments
        // A selected line, or one already moved — the move being its own pin. Note what this
        // excludes for free: a dimmed line is `hittable: false`, so it is never hovered and never
        // offers a handle, whatever the pins say.
        .filter(segment => segment.origin !== undefined || pinned.has(segment.id))
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

    // While a line is being carried the handle follows it: set here rather than at the cursor
    // because the segment it belongs to is minted afresh on every frame of the drag, under a new id
    // each time an end reaches another bar. `active` is the end in hand. See `TrendHandle`.
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
  pane = null
  window.removeEventListener('pointerup', onPointerUp)
  window.removeEventListener('keydown', onKeyDown)
})
</script>

<template>
  <!-- Draws through the chart API, not the DOM. -->
</template>
