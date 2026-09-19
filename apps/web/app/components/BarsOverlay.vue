<script setup lang="ts">
import type { BarMark } from '~/types/pattern'
import { type Turn, barMarkers } from '~/utils/bars'

/**
 * Draws one `bars` Series: a dot on every mark, coloured by which filter made it and placed on the
 * side of the price the turn it is a candidate for would happen at — or, for an inside bar, which
 * has no such side, on the side the bar after it did not break.
 *
 * Renders no markup. It reaches the chart through `inject` and draws through the chart API.
 *
 * Markers with no line, which is the case this registry entry exists to prove: a `bars` Point is
 * anchored on the bar it is about and carries no second bar to draw to, so there is nothing here
 * for `useLineOverlay` to hang a segment on. Expect a lot of dots — nothing narrows the history
 * first, and every bar was asked for both turns.
 *
 * `directions` is the sidebar's bull/bear filter. Absent means both, so the registry — which knows
 * nothing of turns — gets the whole Series. Inside bars carry no direction and are drawn whatever
 * it is set to; see `barMarkers`.
 *
 * `nextByTime` is the bar after each mark, handed over whether or not any switch is on: it decides
 * which side an inside bar's dot sits on, and the page has it either way. `confirmedOnly` is the
 * separate confirmation filter — on, a directional mark survives only if the bar immediately after
 * it broke the way the mark predicted. See `barMarkers`.
 */
const props = withDefaults(
  defineProps<{
    points: BarMark[]
    visible: boolean
    color?: string
    directions?: Turn[]
    nextByTime?: ReadonlyMap<number, { high: number, low: number }> | null
    confirmedOnly?: boolean
  }>(),
  {
    color: undefined,
    directions: () => ['bullish', 'bearish'],
    nextByTime: null,
    confirmedOnly: false,
  },
)

useMarkerOverlay(
  () => barMarkers(props.points, props.directions, props.nextByTime ?? null, props.confirmedOnly),
  () => props.visible,
)
</script>

<template>
  <!-- Draws through the chart API, not the DOM. -->
</template>
