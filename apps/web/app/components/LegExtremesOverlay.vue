<script setup lang="ts">
import type { ISeriesApi, SeriesType, Time, UTCTimestamp } from 'lightweight-charts'
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
 */
const props = withDefaults(
  defineProps<{
    points: LegExtremes[]
    visible: boolean
    color?: string
    directions?: LegExtremes['direction'][]
  }>(),
  { color: undefined, directions: () => ['bullish', 'bearish'] },
)

const candleSeries = inject(CANDLE_SERIES, shallowRef(null))

/**
 * How many candles a level covers, counting the one it was found on.
 *
 * Forward, not centred: a level drawn off a bar reads as "this price, from here on", and running
 * it backwards would lay it over the move that produced it. Four is short enough that the three
 * levels of one leg stay legible side by side and long enough to tell from a marker.
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
 * One segment per point, for the legs `directions` keeps.
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
 */
function asSegments(
  points: LegExtremes[],
  directions: LegExtremes['direction'][],
): LevelSegment[] {
  const segments: LevelSegment[] = []

  for (const point of points) {
    if (!directions.includes(point.direction)) continue

    for (const found of point.found) {
      segments.push({
        time: found.time as UTCTimestamp,
        // The value that won, already picked for the leg's direction by the Pattern — which is
        // what that field is carried for. Reading `high`/`low` off the bar here would mean
        // re-deriving from `direction` what the server already decided.
        price: found.price,
        color: EXTREME_HUES[found.type],
      })
    }
  }

  return segments
}

// The primitive hangs on the candlestick series: it is positioned by `time` and `price` against
// the series it is attached to, and this overlay owns no series of its own to attach to.
let primitive: LevelSegments | null = null

// Same reason the other overlays wait on their refs: the candlestick series is created in the
// parent's `onMounted`, which runs after this component's.
watch(
  [candleSeries, () => props.points, () => props.visible, () => props.directions],
  ([bars, points, visible, directions]) => {
    if (!bars) return

    if (!primitive) {
      primitive = new LevelSegments({ bars: SPAN, lineWidth: 2 })
      // The cast is the same one `ZigZagOverlay` makes for its markers: the candlestick series is
      // declared on the chart's generic horizontal scale, and a primitive is typed on `Time`.
      ;(bars as ISeriesApi<SeriesType, Time>).attachPrimitive(primitive)
    }

    // Hidden by holding no segments rather than by detaching — the `setMarkers([])` precedent.
    // Attach/detach churn on every checkbox click buys nothing: the primitive is one object and
    // an empty draw is a `return`.
    primitive.setSegments(visible ? asSegments(points, directions) : [])
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
})
</script>

<template>
  <!-- Draws through the chart API, not the DOM. -->
</template>
