<script setup lang="ts">
import type { SeriesMarker, Time, UTCTimestamp } from 'lightweight-charts'
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
 *
 * The lanes still cross on a bar that a reversal dot and an arrow both claim, and that is no longer
 * a collision: every marker overlay draws through one plugin, which stacks the two outward from the
 * candle. See `createMarkerRegistry`.
 */
const props = withDefaults(
  defineProps<{
    points: GeneralDirection[]
    visible: boolean
    color?: string
  }>(),
  { color: '#a855f7' },
)

/**
 * One arrow per turn. Typed on `Time`, not `UTCTimestamp`: these end up on the candlestick series,
 * whose horizontal scale the chart declares generically.
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

useMarkerOverlay(() => asMarkers(props.points, props.color), () => props.visible)
</script>

<template>
  <!-- Draws through the chart API, not the DOM. -->
</template>
