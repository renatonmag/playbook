<script setup lang="ts">
import { Ruler } from '@lucide/vue'
import { Button } from '~/components/ui/button'
import IndicatorLegend from '~/components/IndicatorLegend.vue'
import type { Timeframe } from '~/types/candle'
import type { Indicator } from '~/utils/indicator'

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
 * It also places the indicator legend, which is a different thing and deliberately stays one: the
 * strip is a card of buttons, the legend is bare labels over the candles, and they share only this
 * corner. See `IndicatorLegend`. Its three events pass straight through — the page owns the dialog,
 * the hiding and the removing, the way it owns what the ruler means.
 *
 * Rendered inside `CandleChart`'s slot, which is a sibling of the library-owned container: see the
 * `relative` on the tag in `pages/monitor.vue`, the box these coordinates are measured in.
 */
const props = defineProps<{
  /** Whether the ruler is armed — waiting for the two clicks that make a measurement. */
  ruler: boolean
  /** The indicators on the chart, in the order they were added. One legend row each. */
  indicators: Indicator[]
  /** What the chart is showing, passed through for the legend's labels. */
  chartTimeframe: Timeframe
}>()

const emit = defineEmits<{
  /** The ruler button was pressed. Arming and disarming are both the page's to decide. */
  toggleRuler: []
  /** An indicator's settings were asked for — the legend's gear. */
  settings: [id: string]
  /** The legend's eye. Hides a line that still exists. */
  toggleVisible: [id: string]
  /** The legend's `✕`. Takes one off the chart for good. */
  remove: [id: string]
}>()
</script>

<template>
  <!-- The corner: the tools card, then the legend beside it. `items-start` so a legend several rows
       tall hangs downward from the card's top edge rather than centring itself against it. -->
  <div class="absolute left-3 top-3 z-10 flex items-start gap-2">
    <div class="flex items-center gap-0.5 rounded-lg border border-gray-50 bg-white p-1 shadow-md">
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

    <!-- Aligned with the card's button rather than with its border: `p-1` on the card is the offset
         between the two, and a legend that started at the card's top edge would read as sitting a
         row too high. -->
    <IndicatorLegend
      class="pt-1"
      :indicators="props.indicators"
      :chart-timeframe="props.chartTimeframe"
      @settings="(id: string) => emit('settings', id)"
      @toggle-visible="(id: string) => emit('toggleVisible', id)"
      @remove="(id: string) => emit('remove', id)"
    />
  </div>
</template>
