<script setup lang="ts">
import type { LegReversals } from '~/types/pattern'
import { reversalMarkers } from '~/utils/leg-reversals'

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
 *
 * `nextByTime` is the confirmation filter: when non-null, a mark survives only if the bar
 * immediately after it broke against the leg's move (`bearish` leg → next high above the marked
 * high; `bullish` leg → next low below the marked low). Absent or `null` is off — every mark
 * draws, today's behaviour — so the registry mount is unchanged. See `reversalMarkers`.
 */
const props = withDefaults(
  defineProps<{
    points: LegReversals[]
    visible: boolean
    color?: string
    directions?: LegReversals['direction'][]
    nextByTime?: ReadonlyMap<number, { high: number, low: number }> | null
  }>(),
  { color: undefined, directions: () => ['bullish', 'bearish'], nextByTime: null },
)

useMarkerOverlay(
  () => reversalMarkers(props.points, props.directions, props.nextByTime ?? null),
  () => props.visible,
)
</script>

<template>
  <!-- Draws through the chart API, not the DOM. -->
</template>
