<script setup lang="ts">
import {
  createSeriesMarkers,
  LineSeries,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type LineData,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts'
import type { ZigZagPivot } from '~/types/pattern'

/**
 * Draws one zigzag Series: a line through the vertices, top → bottom → top → bottom, and a dot
 * below the bar each leg began on.
 *
 * Renders no markup. It reaches the chart through `inject` and draws through the chart API.
 */
const props = defineProps<{ points: ZigZagPivot[], visible: boolean, color?: string }>()

const chart = inject(CHART, shallowRef(null))
const candleSeries = inject(CANDLE_SERIES, shallowRef(null))

let line: ISeriesApi<'Line'> | null = null
// Typed on `Time`, not `UTCTimestamp`: these hang on the candlestick series, whose horizontal
// scale the chart declares generically.
let markers: ISeriesMarkersPluginApi<Time> | null = null

function asLine(points: ZigZagPivot[]): LineData<UTCTimestamp>[] {
  return points.map(point => ({ time: point.time as UTCTimestamp, value: point.price }))
}

/**
 * A dot under the bar the leg started on.
 *
 * The markers hang on the *candlestick* series, not on the line above: a marker is placed by
 * `time` within its own series, and the line is sparse — it holds vertices only, never the bar a
 * leg began on. The candlestick series has every bar, so every dot lands where it belongs.
 *
 * Expect few of these. The algorithm records far fewer leg starts than it has legs; that is a
 * known defect being fixed separately, and an empty-looking chart here is that defect showing,
 * not this component failing.
 */
function asMarkers(points: ZigZagPivot[]): SeriesMarker<Time>[] {
  return points
    .filter(point => point.since !== null)
    .map(point => ({
      time: point.since!.time as UTCTimestamp,
      position: 'belowBar' as const,
      shape: 'circle' as const,
      color: props.color ?? '#2563eb',
    }))
}

// `watch`, never `onMounted` — a child mounts before its parent, so the chart does not exist
// yet at this component's `onMounted`. Waiting on the ref is required, not stylistic.
watch(
  [chart, candleSeries, () => props.points, () => props.visible],
  ([chartApi, bars, points, visible]) => {
    if (!chartApi) return

    line ??= chartApi.addSeries(LineSeries, {
      color: props.color ?? '#2563eb',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    })

    line.setData(asLine(points))
    line.applyOptions({ visible })

    if (bars) {
      if (!markers) markers = createSeriesMarkers(bars)
      markers.setMarkers(visible ? asMarkers(points) : [])
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  // Only matters when this overlay is unmounted while the chart survives — unchecking a box
  // hides the series instead of removing it, so this is the "pattern gone from the response"
  // path. When the whole chart goes, `chart.remove()` has already taken this with it.
  markers?.setMarkers([])
  if (line && chart.value) chart.value.removeSeries(line)
  line = null
  markers = null
})
</script>

<template>
  <!-- Draws through the chart API, not the DOM. -->
</template>
