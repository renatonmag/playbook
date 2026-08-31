<script setup lang="ts">
import {
  createSeriesMarkers,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts'
import type { GeneralDirection } from '~/types/pattern'

/**
 * Draws one general-direction Series: an arrow on each bar where the reading turned — up and
 * above the bar when it turned bullish, down and below when it turned bearish.
 *
 * Renders no markup. It reaches the chart through `inject` and draws through the chart API.
 *
 * No line, deliberately: the Series holds only the turns, and the trend *between* two arrows is
 * exactly what a reader infers from the last arrow behind any bar — a line joining the turns
 * would draw a slope the Pattern never claimed.
 *
 * The up arrow sits *above* the bar and the down arrow *below* it — the opposite lanes from the
 * reversal dots, which sit where the old leg was heading. An arrow here announces the trend now
 * in force, so it stands on the side the market is claimed to be going.
 */
const props = withDefaults(
  defineProps<{
    points: GeneralDirection[]
    visible: boolean
    color?: string
  }>(),
  { color: '#a855f7' },
)

const candleSeries = inject(CANDLE_SERIES, shallowRef(null))

// Typed on `Time`, not `UTCTimestamp`: these hang on the candlestick series, whose horizontal
// scale the chart declares generically.
let markers: ISeriesMarkersPluginApi<Time> | null = null

/**
 * One arrow per turn. The markers hang on the *candlestick* series: a marker is placed by
 * `time` within its own series, and this overlay owns no series of its own to place them in.
 *
 * No dedup and no sort beyond what arrives: the Pattern emits at most one Point per bar and the
 * Series is already ascending, which is all the chart requires.
 */
function asMarkers(points: GeneralDirection[], color: string): SeriesMarker<Time>[] {
  return points.map(point => ({
    time: point.time as UTCTimestamp,
    position: point.direction === 'bullish' ? 'aboveBar' as const : 'belowBar' as const,
    shape: point.direction === 'bullish' ? 'arrowUp' as const : 'arrowDown' as const,
    color,
  }))
}

// Same reason the other overlays wait on their refs: the candlestick series is created in the
// parent's `onMounted`, which runs after this component's.
watch(
  [candleSeries, () => props.points, () => props.visible, () => props.color],
  ([bars, points, visible, color]) => {
    if (!bars) return
    if (!markers) markers = createSeriesMarkers(bars)
    markers.setMarkers(visible ? asMarkers(points, color) : [])
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  // The markers hang on a series this component does not own, so unmounting does not take them
  // with it — they have to be cleared by hand.
  markers?.setMarkers([])
  markers = null
})
</script>

<template>
  <!-- Draws through the chart API, not the DOM. -->
</template>
