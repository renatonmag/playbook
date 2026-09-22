<script setup lang="ts">
import { Eye, EyeOff, Settings, X } from '@lucide/vue'
import { Button } from '~/components/ui/button'
import type { Timeframe } from '~/types/candle'
import { indicatorLabel, type Indicator } from '~/utils/indicator'

/**
 * The chart's legend: one line per indicator, naming it and offering the three things that can be
 * done to it.
 *
 * Bare over the candles — no card, no border, no ground of its own. A legend is read *against* the
 * lines it names, and boxing it would make it a second toolbar sitting beside the ruler's rather
 * than a label on the drawing. The name keeps a white text-shadow for the one place that costs
 * something: a candle passing behind it.
 *
 * The three controls appear on hover. What the legend says at rest is which lines are on the chart
 * and what colour each is, which is what a legend is for; the gear, the eye and the `✕` are things
 * you go looking for, and three icons per row standing over the candles at all times would make the
 * legend the loudest thing on the pane.
 *
 * It renders over the chart's canvas, so the root does not take the mouse — see the
 * `pointer-events` split below. It is positioned by `ChartTools`, which owns the corner.
 */
const props = defineProps<{
  /** The indicators on the chart, in the order they were added. One row each. */
  indicators: Indicator[]
  /** What the chart is showing. Only the label needs it — see `indicatorLabel`. */
  chartTimeframe: Timeframe
}>()

const emit = defineEmits<{
  /** An indicator's settings were asked for — the gear. The page owns the dialog. */
  settings: [id: string]
  /** The eye. Hides a line that still exists, with its settings and its row intact. */
  toggleVisible: [id: string]
  /** The `✕`. Takes it off the chart for good, which is a different act from hiding it. */
  remove: [id: string]
}>()
</script>

<template>
  <!-- `pointer-events-none` on the box and back on for each row. The legend floats over the pane,
       and the pane is read with the mouse: the crosshair, the levels tool's hover and the ruler's
       two clicks all land on the canvas underneath. A transparent box the width of its longest row
       would eat every one of them in the space beside the shorter rows. -->
  <div class="pointer-events-none flex flex-col gap-px">
    <div
      v-for="indicator in props.indicators"
      :key="indicator.id"
      class="group pointer-events-auto flex h-5 items-center gap-1"
      :class="indicator.visible ? '' : 'opacity-40'"
    >
      <!-- The line's colour, because the name cannot say which line it names once there are two. -->
      <span class="size-1.5 shrink-0 rounded-full" :style="{ backgroundColor: indicator.color }" />

      <span class="font-mono text-[11px] leading-none text-gray-600 [text-shadow:0_0_2px_white]">
        {{ indicatorLabel(indicator, props.chartTimeframe) }}
      </span>

      <!-- `group-focus-within` alongside `group-hover`: a keyboard reaching these has no pointer to
           reveal them with, and a control that is focused but invisible is worse than one that is
           simply absent. -->
      <span class="flex opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        <Button
          variant="ghost"
          size="icon-xs"
          :aria-label="`configurar ${indicatorLabel(indicator, props.chartTimeframe)}`"
          title="Configurações"
          @click="emit('settings', indicator.id)"
        >
          <Settings class="size-3" />
        </Button>

        <!-- `aria-pressed` on the visible state, the ruler's convention: the two icons say which way
             the switch is thrown, and the attribute says the same thing to a reader that cannot see
             them. -->
        <Button
          variant="ghost"
          size="icon-xs"
          :aria-pressed="indicator.visible"
          :aria-label="indicator.visible ? `ocultar ${indicatorLabel(indicator, props.chartTimeframe)}` : `mostrar ${indicatorLabel(indicator, props.chartTimeframe)}`"
          :title="indicator.visible ? 'Ocultar' : 'Mostrar'"
          @click="emit('toggleVisible', indicator.id)"
        >
          <Eye v-if="indicator.visible" class="size-3" />
          <EyeOff v-else class="size-3" />
        </Button>

        <Button
          variant="ghost"
          size="icon-xs"
          :aria-label="`remover ${indicatorLabel(indicator, props.chartTimeframe)}`"
          title="Remover"
          class="text-gray-400 hover:text-red-600"
          @click="emit('remove', indicator.id)"
        >
          <X class="size-3" />
        </Button>
      </span>
    </div>
  </div>
</template>
