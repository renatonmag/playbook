<script setup lang="ts">
import type { LineData, UTCTimestamp } from 'lightweight-charts'
import type { LegMark } from '~/types/pattern'

/**
 * Draws one `simple-leg` Series: a line through the bars where legs ended.
 *
 * A line and nothing else. Unlike the zigzag, this Pattern carries no second bar per Point —
 * where the leg began is the previous Point, which the line already joins.
 *
 * Expect a far denser line than the zigzag's, and expect it to cut *inside* tops and bottoms
 * the zigzag reaches. The rule reads one side of the bar at a time, so a leg can make its high
 * several bars before the bar that marks its end, and the vertex is priced on the marked bar.
 * That gap is the reason this is on the chart at all — it is the finding, not a defect here.
 *
 * The final segment runs to a `provisional` Point — the leg still open at the newest bar, which
 * has not turned yet. It is drawn like any other: the alternative is a second line style saying
 * something the whole right edge of a live chart already says.
 */
const props = defineProps<{ points: LegMark[], visible: boolean, color?: string }>()

function asLine(points: LegMark[]): LineData<UTCTimestamp>[] {
  return points.map(point => ({ time: point.time as UTCTimestamp, value: point.price }))
}

useLineOverlay(() => asLine(props.points), () => props.visible, () => props.color)
</script>

<template>
  <!-- Draws through the chart API, not the DOM. -->
</template>
