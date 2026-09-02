<script setup lang="ts">
import type { SeriesMarker, Time, UTCTimestamp } from 'lightweight-charts'
import type { LegReversals } from '~/types/pattern'

/**
 * Draws one leg-reversals Series: a dot on every bar a reversal filter marked, coloured by which
 * filter marked it, and placed on the side of the price the leg was heading for.
 *
 * Renders no markup. It reaches the chart through `inject` and draws through the chart API.
 *
 * Unlike the other two overlays there is no line: a `LegReversals` Point is anchored on its leg's
 * opening vertex and carries nothing to draw there — the whole output is `found`, the bars inside
 * the leg. Joining those with a line would assert an order the Pattern does not claim.
 */
/**
 * `directions` is the sidebar's bull/bear filter: which legs' marks to draw. Absent means both,
 * so a caller that does not filter — and the registry, which knows nothing of legs — gets the
 * whole Series.
 */
const props = withDefaults(
  defineProps<{
    points: LegReversals[]
    visible: boolean
    color?: string
    directions?: LegReversals['direction'][]
  }>(),
  { color: undefined, directions: () => ['bullish', 'bearish'] },
)

/**
 * The hues, matching what `LegReversalsVerify` uses for the same types — sky, amber and pink.
 *
 * `props.color` is accepted for the registry's sake and then ignored on purpose: which filter
 * marked a bar is the information here, and one Series-wide colour cannot carry it. The sidebar
 * swatch will still show the palette colour, which is a legend for the checkbox, not for the dots.
 */
const HUES = {
  'two-bar': '#0ea5e9',
  'reversal-bar': '#f59e0b',
  'inside-bar': '#ec4899',
} as const

/**
 * A dot on each marked bar, on the side its leg was heading for, for the legs `directions` keeps.
 *
 * The filter is applied here rather than by the caller so the sidebar can ask for "bull only"
 * without knowing that a leg's direction is what puts its dots above or below the bar.
 *
 * Typed on `Time`, not `UTCTimestamp`: these end up on the candlestick series, whose horizontal
 * scale the chart declares generically.
 *
 * The side comes from the leg, not the mark: a leg that rose turns at a top, so its candidates go
 * above the bars; a leg that fell turns at a bottom and its go below. A single lane cannot say
 * this, and it is the thing worth reading off the chart at a glance.
 *
 * Sharing the lower lane with the zigzag's vertex dots used to cost an overlap on vertex bars, and
 * does not any more: every marker overlay draws through one plugin, which stacks the two outward
 * from the candle. See `createMarkerRegistry`.
 *
 * Consecutive legs overlap, so the same bar genuinely arrives twice under two anchors; the dots
 * are deduped by bar, type *and side*. A bar two filters both marked is two facts, not one — the
 * ordinary case for `inside-bar`, which reads only the extremes and so coexists freely with the
 * other two — and so is a bar two legs both marked, which is why the side is in the key: those
 * legs run opposite ways, so the bar is a candidate at both ends and gets a dot above and below.
 * Flattening legs also does not leave the times ascending across an overlap, and the chart
 * requires that, hence the sort.
 */
function asMarkers(
  points: LegReversals[],
  directions: LegReversals['direction'][],
): SeriesMarker<Time>[] {
  const seen = new Map<string, SeriesMarker<Time>>()

  for (const point of points) {
    if (!directions.includes(point.direction)) continue

    const position = point.direction === 'bullish' ? 'aboveBar' as const : 'belowBar' as const

    for (const bar of point.found) {
      seen.set(`${bar.time}:${bar.type}:${position}`, {
        time: bar.time as UTCTimestamp,
        position,
        shape: 'circle' as const,
        color: HUES[bar.type],
      })
    }
  }

  return [...seen.values()].sort((a, b) => (a.time as number) - (b.time as number))
}

useMarkerOverlay(() => asMarkers(props.points, props.directions), () => props.visible)
</script>

<template>
  <!-- Draws through the chart API, not the DOM. -->
</template>
