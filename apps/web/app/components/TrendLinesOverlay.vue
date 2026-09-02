<script setup lang="ts">
import type { IChartApi, ISeriesApi, MouseEventParams, SeriesType, Time } from 'lightweight-charts'
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
  }>(),
  {
    color: '#2563eb',
    sides: () => ['high', 'low'],
    pinned: () => [],
    onlyPinned: false,
    focus: null,
    previewOnHover: false,
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
const emit = defineEmits<{ pin: [id: string], bar: [time: number | null] }>()

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
 * What to hand the primitive: the Series' lines, or only the selected ones once the timer has
 * fired. `trendSegments` lives in `~/utils/trend-lines` because the sidebar lists the same lines in
 * words.
 */
function segmentsToDraw(): DrawnTrend[] {
  const pinned = new Set(props.pinned)
  const segments = trendSegments(
    props.points,
    props.sides,
    props.color,
    pinned,
    props.focus,
    hovered.value,
  )
  // Still the real pins, not the hover: the timer keeps what you decided to keep, and the cursor
  // has not decided anything.
  return props.onlyPinned ? segments.filter(segment => pinned.has(segment.id)) : segments
}

/**
 * The line under the cursor, or `null`.
 *
 * A `ref` rather than a plain `let`, unlike `drawnIds`: this one is read by the redraw watcher, and
 * the whole feature is that moving the mouse redraws.
 */
const hovered = shallowRef<string | null>(null)

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
  const id = param.hoveredInfo?.objectId
  const next = props.previewOnHover && typeof id === 'string' && drawnIds.has(id) ? id : null

  // This fires on every mouse move across the pane. Only a change is worth reshaping the Series
  // and repainting for.
  if (next === hovered.value) return
  hovered.value = next
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
 */
function onClick(param: MouseEventParams<Time>) {
  const id = param.hoveredInfo?.objectId
  if (typeof id === 'string' && drawnIds.has(id)) {
    emit('pin', id)
    return
  }

  // A bar time is a number on this chart's scale; anything else — or a click past the last bar,
  // where `time` is absent — names no bar.
  emit('bar', typeof param.time === 'number' ? param.time : null)
}

/** The ids currently handed to the primitive, which is exactly what a click can name. */
let drawnIds = new Set<string>()

/**
 * The chart this is subscribed to, so the unsubscribe cannot go to a different one. Declared above
 * the watcher, which runs `immediate` — a `let` read before its declaration is a ReferenceError.
 */
let subscribed: IChartApi | null = null

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
    hovered,
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
      subscribed = api
    }

    // Hidden by holding no lines rather than by detaching — the `setMarkers([])` precedent, and
    // the same trade both other primitives make: an empty draw is a `return`.
    const segments = props.visible ? segmentsToDraw() : []
    drawnIds = new Set(segments.map(segment => segment.id))
    primitive.setSegments(segments)
  },
  { immediate: true },
)

onBeforeUnmount(() => {
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
})
</script>

<template>
  <!-- Draws through the chart API, not the DOM. -->
</template>
