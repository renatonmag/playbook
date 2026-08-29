<script setup lang="ts">
import type { LegWindow } from '~/types/pattern'
import { barMoment } from '~/utils/bar-time'

/**
 * `LegWindow` as a table, because it is not a shape on the chart.
 *
 * The other Patterns draw: a zigzag is a line, a leg mark is a vertex. A `LegWindow` is a slice of
 * bars with two indices pointing inside it, and what needs checking is whether those indices land
 * where they should — which is read, not seen.
 *
 * One row per leg, with the ends of `bars` and the two indices. The bars in between are not shown:
 * the question this answers is where each window starts, stops and turns, not what is inside it.
 */
const props = defineProps<{ points: LegWindow[] }>()

/**
 * The first and last bar of each window, resolved once so the template does no index arithmetic.
 *
 * `bars` is never empty in practice — a window is built from at least two Pivots — but it is a
 * wire shape, so the ends are read defensively and render as `—` rather than crashing the page.
 */
const rows = computed(() =>
  props.points.map((point, index) => ({
    index,
    first: point.bars[0],
    last: point.bars[point.bars.length - 1],
    count: point.bars.length,
    since: point.since,
    end: point.end,
  })),
)

/**
 * Short date and time, on the trading clock. `barMoment` carries the reason it is not the
 * reader's clock; `bars` is a wire shape, so an absent bar renders as `—` rather than crashing.
 */
function when(bar: { time: number } | undefined) {
  return bar ? barMoment(bar.time) : '—'
}
</script>

<template>
  <div class="p-4">
    <p v-if="!rows.length" class="p-8 text-center text-sm text-gray-500">
      Nenhum leg nesta janela.
    </p>

    <div v-else class="overflow-x-auto">
      <table class="w-full min-w-[32rem] text-xs tabular-nums">
        <thead class="text-gray-500">
          <tr class="text-left">
            <th class="py-1 pr-4 text-right font-medium">#</th>
            <th class="py-1 pr-4 font-medium">bars[0]</th>
            <th class="py-1 pr-4 font-medium">bars[-1]</th>
            <th class="py-1 pr-4 text-right font-medium">since</th>
            <th class="py-1 text-right font-medium">end</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.index" class="border-t border-gray-100">
            <td class="py-1 pr-4 text-right text-gray-400">{{ row.index }}</td>
            <td class="py-1 pr-4 font-mono">{{ when(row.first) }}</td>
            <td class="py-1 pr-4 font-mono">{{ when(row.last) }}</td>
            <td class="py-1 pr-4 text-right">{{ row.since }}</td>
            <td class="py-1 text-right">{{ row.end }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
