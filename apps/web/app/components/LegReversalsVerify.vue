<script setup lang="ts">
import type { LegBar, LegReversals } from '~/types/pattern'

/**
 * `LegReversals` as a table, for the same reason `LegWindowVerify` is one: this is not a shape on
 * the chart. It is a list of timestamps, and what needs checking is whether those bars are the
 * bars worth marking — which is done by reading the time off here and finding it on the chart.
 *
 * Two levels, because the Point is two levels: one row per leg, and inside it one row per bar the
 * filters marked. Legs that marked nothing are kept and shown as such — an empty leg is the number
 * that says whether the filter is too tight, and hiding it would hide exactly that.
 */
const props = defineProps<{ points: LegReversals[] }>()

const rows = computed(() =>
  props.points.map((point, index) => ({
    index,
    time: point.time,
    found: point.found,
  })),
)

/** How many bars were marked in all, so the header says something without scrolling. */
const total = computed(() => props.points.reduce((sum, point) => sum + point.found.length, 0))

/** Same format as the other pages: short date and time, in local wall time. */
function when(time: number) {
  return new Date(time * 1000).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

/** Price to the instrument's own precision — five digits on `WIN@N`, decimals elsewhere. */
function price(value: number) {
  return value.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
}

/** The two filters read differently and are worth telling apart at a glance. */
function badge(bar: LegBar) {
  return bar.type === 'two-bar'
    ? 'bg-sky-100 text-sky-700'
    : 'bg-amber-100 text-amber-700'
}
</script>

<template>
  <div class="p-4">
    <p v-if="!rows.length" class="p-8 text-center text-sm text-gray-500">
      Nenhum leg nesta janela.
    </p>

    <template v-else>
      <p class="pb-3 text-xs text-gray-500">
        {{ rows.length }} pernas · {{ total }} barras marcadas
      </p>

      <div class="overflow-x-auto">
        <table class="w-full min-w-[40rem] text-xs tabular-nums">
          <thead class="text-gray-500">
            <tr class="text-left">
              <th class="py-1 pr-4 text-right font-medium">#</th>
              <th class="py-1 pr-4 font-medium">barra</th>
              <th class="py-1 pr-4 text-right font-medium">at</th>
              <th class="py-1 pr-4 font-medium">tipo</th>
              <th class="py-1 pr-4 text-right font-medium">abertura</th>
              <th class="py-1 pr-4 text-right font-medium">máxima</th>
              <th class="py-1 pr-4 text-right font-medium">mínima</th>
              <th class="py-1 text-right font-medium">fecho</th>
            </tr>
          </thead>

          <tbody v-for="row in rows" :key="row.index" class="border-t border-gray-200">
            <tr class="bg-gray-50 text-gray-500">
              <td class="py-1 pr-4 text-right">{{ row.index }}</td>
              <td class="py-1 pr-4 font-mono" colspan="7">
                perna de {{ when(row.time) }}
                <span v-if="!row.found.length" class="ml-2 text-gray-400">— nada marcado</span>
              </td>
            </tr>

            <!-- `at` is not unique within a leg: a bar marked by both filters is two rows, which
                 needs `k` below 0,715 to happen at all. The type completes the key. -->
            <tr
              v-for="bar in row.found"
              :key="`${bar.at}-${bar.type}`"
              class="border-t border-gray-100"
            >
              <td />
              <td class="py-1 pr-4 font-mono">{{ when(bar.time) }}</td>
              <td class="py-1 pr-4 text-right">{{ bar.at }}</td>
              <td class="py-1 pr-4">
                <span class="rounded px-1.5 py-0.5" :class="badge(bar)">{{ bar.type }}</span>
              </td>
              <td class="py-1 pr-4 text-right">{{ price(bar.open) }}</td>
              <td class="py-1 pr-4 text-right">{{ price(bar.high) }}</td>
              <td class="py-1 pr-4 text-right">{{ price(bar.low) }}</td>
              <td class="py-1 text-right">{{ price(bar.close) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>
