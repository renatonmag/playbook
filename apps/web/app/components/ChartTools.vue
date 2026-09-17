<script setup lang="ts">
import { Ruler } from '@lucide/vue'
import { Button } from '~/components/ui/button'

/**
 * The chart's own tools, as a small strip in the pane's top-left corner.
 *
 * Not a `useFloatingBar` like `ChartToolbar` and `ReplayToolbar`, and the difference is what the
 * three bars are. Those two open over whatever they are about — a selected line, the bar a replay
 * is cut at — so they land in the middle of the drawing and have to be draggable out of the way.
 * This one is always there and is about the chart rather than about anything on it, so it takes the
 * corner and stays out of the candles, which the price scale has already pushed to the right.
 *
 * It knows only that a tool is on or off. What arming the ruler *means* is the page's — see
 * `RulerOverlay` — which is the same division `ChartToolbar` makes with its `Trash`.
 *
 * Rendered inside `CandleChart`'s slot, which is a sibling of the library-owned container: see the
 * `relative` on the tag in `pages/monitor.vue`, the box these coordinates are measured in.
 */
const props = defineProps<{
  /** Whether the ruler is armed — waiting for the two clicks that make a measurement. */
  ruler: boolean
}>()

const emit = defineEmits<{
  /** The ruler button was pressed. Arming and disarming are both the page's to decide. */
  toggleRuler: []
}>()
</script>

<template>
  <div class="absolute left-3 top-3 z-10 flex items-center gap-0.5 rounded-lg border border-gray-50 bg-white p-1 shadow-md">
    <!-- `aria-pressed` and not a disabled state or a second icon: the button is a switch, and a
         switch that reads as pressed is the whole of what "the next two clicks measure" looks
         like from outside the canvas. -->
    <Button
      :variant="props.ruler ? 'secondary' : 'ghost'"
      size="icon-sm"
      :aria-pressed="props.ruler"
      aria-label="régua"
      title="Régua — dois cliques medem pontos e barras"
      @click="emit('toggleRuler')"
    >
      <Ruler class="size-4" />
    </Button>
  </div>
</template>
