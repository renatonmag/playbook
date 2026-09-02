<script setup lang="ts">
import type { LineData, SeriesMarker, Time, UTCTimestamp } from 'lightweight-charts'
import type { ZigZagPivot } from '~/types/pattern'

/**
 * Draws one zigzag Series: a line through the vertices, top → bottom → top → bottom, and a dot
 * below the bar each leg began on.
 *
 * Renders no markup. It reaches the chart through `inject` and draws through the chart API.
 *
 * The line is `useLineOverlay`'s; the markers are what makes this overlay its own component.
 */
const props = defineProps<{ points: ZigZagPivot[], visible: boolean, color?: string }>()

function asLine(points: ZigZagPivot[]): LineData<UTCTimestamp>[] {
  return points.map(point => ({ time: point.time as UTCTimestamp, value: point.price }))
}

/**
 * A dot under the bar the leg started on.
 *
 * The markers go on the *candlestick* series, not on the line above: a marker is placed by `time`
 * within its own series, and the line is sparse — it holds vertices only, never the bar a leg began
 * on. The candlestick series has every bar, so every dot lands where it belongs. `useMarkerOverlay`
 * is what puts them there, alongside every other overlay's, so a dot sharing a bar with another
 * Series' marker stacks rather than overlaps.
 *
 * Typed on `Time`, not `UTCTimestamp`, for the reason that series' scale is.
 *
 * A dot lands on the bar where the leg turned — the extreme that was current at that instant —
 * which is usually *not* one of the vertices on the line. Seeing a dot away from any corner of
 * the zigzag is the expected picture, not a misplacement.
 *
 * Expect roughly four in five legs to carry one. The rest turned on a bar the algorithm does
 * not record, which is a known defect being fixed separately; those Points arrive with
 * `since: null` and are skipped here rather than guessed at.
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

useLineOverlay(() => asLine(props.points), () => props.visible, () => props.color)
useMarkerOverlay(() => asMarkers(props.points), () => props.visible)
</script>

<template>
  <!-- Draws through the chart API, not the DOM. -->
</template>
