<script setup lang="ts">
import type { IChartApi, ISeriesApi, MouseEventParams, SeriesType, Time } from 'lightweight-charts'
import type { LegExtremes } from '~/types/pattern'

/**
 * Draws one leg-extremes Series: a short level at each of a leg's three defining points, running
 * forward from the bar it was found on.
 *
 * Renders no markup. It reaches the chart through `inject` and draws through the chart API.
 *
 * Unlike the other three overlays this one draws neither a line series nor markers, but a **series
 * primitive** — see `LevelSegments` for why neither of the built-ins can express a level with a
 * length. It is the first primitive in this app.
 *
 * `directions` is the sidebar's bull/bear filter, exactly as on `LegReversalsOverlay`: which legs'
 * points to draw. Absent means both, so the registry — which knows nothing of legs — gets the
 * whole Series.
 *
 * `pinned` and `onlyPinned` are the other half of the auto-hide switch. The page owns the timer and
 * the set of levels somebody clicked; this component owns what that means to the drawing, which is
 * "keep those, drop the rest" rather than "draw nothing".
 */
const props = withDefaults(
  defineProps<{
    points: LegExtremes[]
    visible: boolean
    /**
     * This Series' producer key, which is what its segment ids are named after.
     *
     * Required, and not defaulted: the pipeline runs `leg-extremes` twice, and two Series naming
     * their segments the same way is exactly the failure `onClick` below cannot see.
     */
    namespace: string
    color?: string
    directions?: LegExtremes['direction'][]
    /** Ids of the segments to keep once `onlyPinned` is on, and to draw thicker at all times. */
    pinned?: string[]
    /** The Series' hide timer has fired: only the pinned segments are still worth the space. */
    onlyPinned?: boolean
  }>(),
  {
    color: undefined,
    directions: () => ['bullish', 'bearish'],
    pinned: () => [],
    onlyPinned: false,
  },
)

/**
 * A segment was clicked. The id is `extremeSegmentId`'s, and what to do about it — pin, unpin — is
 * the page's business: this component has no memory of its own and is redrawn from `pinned`.
 */
const emit = defineEmits<{ pin: [id: string] }>()

const candleSeries = inject(CANDLE_SERIES, shallowRef(null))
const chart = inject(CHART, shallowRef(null))

/**
 * How many candles an **unpinned** level covers, counting the one it was found on.
 *
 * Forward, not centred: a level drawn off a bar reads as "this price, from here on", and running
 * it backwards would lay it over the move that produced it. Four is short enough that the three
 * levels of one leg stay legible side by side and long enough to tell from a marker.
 *
 * A pinned level ignores it and runs to the current bar — that is what a pin is for, and it is why
 * only the pinned ones may do it: three levels a leg, legs overlapping, all of them full-width
 * would be a grid rather than a chart.
 */
const SPAN = 4

/**
 * `props.color` is accepted for the registry's sake and then ignored, the same trade
 * `LegReversalsOverlay` makes: *which* of the three levels a segment is is the information here,
 * and one Series-wide colour cannot carry it. The sidebar swatch still shows the palette colour,
 * which is a legend for the checkbox and not for the segments — hence the key beside it, which
 * reads `EXTREME_HUES` from the same module this does.
 */

/**
 * What to hand the primitive: the Series' segments, or only the pinned ones once the timer has
 * fired. `extremeSegments` lives in `~/utils/leg-extremes` because the sidebar lists the same
 * things in words — see its docblock.
 */
function segmentsToDraw(): LevelSegment[] {
  const pinned = new Set(props.pinned)
  const segments = extremeSegments(props.namespace, props.points, props.directions, pinned)
  return props.onlyPinned ? segments.filter(segment => pinned.has(segment.id)) : segments
}

/**
 * A click anywhere on the pane, narrowed to a click on one of *this* Series' segments.
 *
 * `hoveredInfo.objectId` is whatever `LevelSegments.hitTest` last returned for the cursor's
 * position, so this is a mouse affordance: a touch that never hovers leaves it unset, and nothing
 * is pinned. Acceptable — the whole feature is "click the line you care about".
 *
 * The id check is not a formality. Every primitive on the chart reports into the same field, and
 * the two `leg-extremes` Series the pipeline produces both subscribe here; without it each would
 * claim the other's clicks. It only works because an id names its Series — see `extremeSegmentId`,
 * and `namespace` above, which is the half of that this component supplies.
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
 * The chart this is subscribed to, so the unsubscribe cannot go to a different one.
 *
 * Declared above the watcher, not beside its cleanup: the watcher runs `immediate`, during setup,
 * and a `let` read before its declaration is a ReferenceError rather than an `undefined`.
 */
let subscribed: IChartApi | null = null

// The primitive hangs on the candlestick series: it is positioned by `time` and `price` against
// the series it is attached to, and this overlay owns no series of its own to attach to.
let primitive: LevelSegments | null = null

// Same reason the other overlays wait on their refs: the candlestick series is created in the
// parent's `onMounted`, which runs after this component's.
watch(
  [
    candleSeries,
    chart,
    () => props.points,
    () => props.visible,
    () => props.directions,
    () => props.pinned,
    () => props.onlyPinned,
  ],
  ([bars, api]) => {
    if (!bars) return

    if (!primitive) {
      primitive = new LevelSegments({ bars: SPAN, lineWidth: 2 })
      // The cast is the same one `ZigZagOverlay` makes for its markers: the candlestick series is
      // declared on the chart's generic horizontal scale, and a primitive is typed on `Time`.
      ;(bars as ISeriesApi<SeriesType, Time>).attachPrimitive(primitive)
    }

    // Subscribed here rather than in `onMounted` for the reason this watcher exists at all: the
    // chart is created in the parent's `onMounted`, which runs after this component's. Guarded the
    // same way the primitive is — this watcher runs on every redraw.
    if (api && !subscribed) {
      api.subscribeClick(onClick)
      subscribed = api
    }

    // Hidden by holding no segments rather than by detaching — the `setMarkers([])` precedent.
    // Attach/detach churn on every checkbox click buys nothing: the primitive is one object and
    // an empty draw is a `return`.
    const segments = props.visible ? segmentsToDraw() : []
    drawnIds = new Set(segments.map(segment => segment.id))
    primitive.setSegments(segments)
  },
  { immediate: true },
)


onBeforeUnmount(() => {
  // Only matters when this overlay is unmounted while the chart lives on — the "pattern gone from
  // the response" path. When the whole chart goes, `chart.remove()` has already taken the series
  // and everything attached to it, and reaching for a disposed series here would be the error.
  // Same guard `useLineOverlay` puts on its `removeSeries`.
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
