<script setup lang="ts">
import type { IChartApi, ISeriesApi, MouseEventParams, SeriesType, Time } from 'lightweight-charts'
import type { BarGap } from '~/types/pattern'

/**
 * Draws one bar-gap Series: a light-blue box over each three-bar gap, as tall as the untraded band
 * and four bars wide.
 *
 * Renders no markup. It reaches the chart through `inject` and draws through the chart API — the
 * same shape as the other four overlays.
 *
 * The second **series primitive** in this app, after `LegExtremesOverlay`'s levels. See
 * `LevelBoxes` for why a region is neither a marker nor a line series, and why it is a sibling of
 * `LevelSegments` rather than an option on it.
 *
 * `directions` is the sidebar's bull/bear filter, exactly as on the other two directional
 * overlays, and `states` is the second one this Series has of its own — open or closed. Both
 * absent means everything, so the registry — which knows nothing of gaps — gets the whole Series.
 * `pinned` and `onlyPinned` are the auto-hide switch, and mean here what they mean there:
 * the page owns the timer and the set of boxes somebody clicked, this component owns what that
 * means to the drawing.
 */
const props = withDefaults(
  defineProps<{
    points: BarGap[]
    visible: boolean
    color?: string
    directions?: BarGap['direction'][]
    /** Which of open and closed to draw. The gaps still standing are the ones with a level in them. */
    states?: GapState[]
    /** Ids of the boxes to keep once `onlyPinned` is on, and to run to the live edge at all times. */
    pinned?: string[]
    /** The Series' hide timer has fired: only the pinned boxes are still worth the space. */
    onlyPinned?: boolean
  }>(),
  {
    color: undefined,
    directions: () => ['bullish', 'bearish'],
    states: () => ['open', 'closed'],
    pinned: () => [],
    onlyPinned: false,
  },
)

/**
 * A box was clicked. The id is `gapBoxId`'s, and what to do about it — pin, unpin — is the page's
 * business: this component has no memory of its own and is redrawn from `pinned`.
 */
const emit = defineEmits<{ pin: [id: string] }>()

const candleSeries = inject(CANDLE_SERIES, shallowRef(null))
const chart = inject(CHART, shallowRef(null))

/**
 * How many candles an **unpinned** box covers, counting the one it starts on.
 *
 * Four, which is the three bars that make the gap plus one ahead: the anchor is the first bar of
 * the triple, so the box lies over the move that produced it and reaches a single bar past it.
 * That is the opposite reading to `LegExtremesOverlay`'s span, deliberately — a level is a price
 * that holds *from here on*, and a gap is a thing that happened *here*.
 *
 * A pinned box ignores it and runs to the current bar, which is what a pin is for: that is the
 * reading of a gap as a zone price may come back to, and it is worth the width only for the ones
 * somebody asked about.
 */
const SPAN = 4

/**
 * `props.color` is accepted for the registry's sake and then ignored, the same trade the other two
 * point-coloured overlays make: a box is light blue while its gap stands and red once price has
 * been back through it, which one Series-wide colour cannot say. `GAP_HUES` holds the pair, and
 * the sidebar swatch remains a legend for the checkbox rather than for the boxes.
 */

/**
 * What to hand the primitive: the Series' boxes, or only the pinned ones once the timer has fired.
 * `gapBoxes` lives in `~/utils/bar-gaps` because the sidebar lists the same things in words.
 */
function boxesToDraw(): PriceBox[] {
  const pinned = new Set(props.pinned)
  const boxes = gapBoxes(props.points, props.directions, props.states, pinned)
  return props.onlyPinned ? boxes.filter(box => pinned.has(box.id)) : boxes
}

/**
 * A click anywhere on the pane, narrowed to a click on one of *this* Series' boxes.
 *
 * `hoveredInfo.objectId` is whatever the primitives' hit tests last returned for the cursor, so
 * this is a mouse affordance: a touch that never hovers leaves it unset and nothing is pinned.
 *
 * The id check is not a formality. Every primitive on the chart reports into the same field — and
 * with `leg-extremes` also drawn, a click on a level would otherwise read as a click on a gap.
 */
function onClick(param: MouseEventParams<Time>) {
  const id = param.hoveredInfo?.objectId
  if (typeof id !== 'string') return
  if (!drawnIds.has(id)) return
  emit('pin', id)
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
let primitive: LevelBoxes | null = null

// Same reason the other overlays wait on their refs: the candlestick series is created in the
// parent's `onMounted`, which runs after this component's.
watch(
  [
    candleSeries,
    chart,
    () => props.points,
    () => props.visible,
    () => props.directions,
    () => props.states,
    () => props.pinned,
    () => props.onlyPinned,
  ],
  ([bars, api]) => {
    if (!bars) return

    if (!primitive) {
      primitive = new LevelBoxes({ bars: SPAN, borderWidth: 1, fillOpacity: 0.15 })
      // The cast is the same one the other overlays make: the candlestick series is declared on
      // the chart's generic horizontal scale, and a primitive is typed on `Time`.
      ;(bars as ISeriesApi<SeriesType, Time>).attachPrimitive(primitive)
    }

    if (api && !subscribed) {
      api.subscribeClick(onClick)
      subscribed = api
    }

    // Hidden by holding no boxes rather than by detaching — the `setMarkers([])` precedent, and
    // the same trade `LegExtremesOverlay` makes: an empty draw is a `return`.
    const boxes = props.visible ? boxesToDraw() : []
    drawnIds = new Set(boxes.map(box => box.id))
    primitive.setBoxes(boxes)
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
  subscribed = null
})
</script>

<template>
  <!-- Draws through the chart API, not the DOM. -->
</template>
