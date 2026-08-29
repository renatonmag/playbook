<script setup lang="ts">
import type { NestedLegs } from '~/types/pattern'
import { barMoment } from '~/utils/bar-time'

/**
 * `NestedLegs` as a table, for the reason `LegWindowVerify` is one: this is timestamps and
 * boundaries, and what needs checking is whether each simple leg landed in the right zigzag leg —
 * which is read, not seen.
 *
 * Two levels, because the Point is two levels: one row per zigzag leg, and inside it one row per
 * simple leg that started in it. Legs that hold nothing are kept and shown as such — an empty
 * group is the number that says how far apart the two detectors are, and hiding it would hide
 * exactly that.
 *
 * The column that carries the whole rule is `início`: it must sit strictly after the group's
 * `abre` and at or before its `fecha`. `fim` is not bound by anything, and the last leg of a group
 * routinely runs past the close — flagged rather than hidden, since it looks like an error and is
 * not one.
 */
const props = defineProps<{ points: NestedLegs[] }>()

const rows = computed(() =>
  props.points.map((point, index) => {
    const closes = point.leg.bars[point.leg.end]
    return {
      index,
      opens: point.leg.bars[0],
      closes,
      since: point.leg.since,
      end: point.leg.end,
      inside: point.inside.map(leg => ({
        first: leg.bars[0],
        last: leg.bars[leg.bars.length - 1],
        count: leg.bars.length,
        // The tail case: `split_legs` gives its final leg the whole remainder of the window, so a
        // leg grouped by where it *starts* can end outside the group.
        overruns: !!closes && !!leg.bars[leg.bars.length - 1]
          && leg.bars[leg.bars.length - 1]!.time > closes.time,
      })),
    }
  }),
)

/** How many simple legs were grouped in all, so the header says something without scrolling. */
const total = computed(() => props.points.reduce((sum, point) => sum + point.inside.length, 0))

/**
 * Short date and time, on the trading clock. `barMoment` carries the reason it is not the
 * reader's clock — every label on this page read three hours early before it existed.
 *
 * Reads the bar defensively and renders `—` rather than crashing the page: `bars` is never empty
 * in practice, but it is a wire shape, the same argument `LegWindowVerify` makes.
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

    <template v-else>
      <p class="pb-3 text-xs text-gray-500">
        {{ rows.length }} pernas do zigzag · {{ total }} pernas simples agrupadas
      </p>

      <div class="overflow-x-auto">
        <table class="w-full min-w-[40rem] text-xs tabular-nums">
          <thead class="text-gray-500">
            <tr class="text-left">
              <th class="py-1 pr-4 text-right font-medium">#</th>
              <th class="py-1 pr-4 font-medium">início</th>
              <th class="py-1 pr-4 font-medium">fim</th>
              <th class="py-1 pr-4 text-right font-medium">barras</th>
              <th class="py-1 pr-4 text-right font-medium">since</th>
              <th class="py-1 text-right font-medium">end</th>
            </tr>
          </thead>

          <tbody v-for="row in rows" :key="row.index" class="border-t border-gray-200">
            <tr class="bg-gray-50 text-gray-500">
              <td class="py-1 pr-4 text-right">{{ row.index }}</td>
              <td class="py-1 pr-4 font-mono">abre {{ when(row.opens) }}</td>
              <td class="py-1 pr-4 font-mono">fecha {{ when(row.closes) }}</td>
              <td class="py-1 pr-4 text-right">{{ row.inside.length }}</td>
              <td class="py-1 pr-4 text-right">{{ row.since }}</td>
              <td class="py-1 text-right">{{ row.end }}</td>
            </tr>

            <tr v-if="!row.inside.length">
              <td />
              <td class="py-1 pr-4 text-gray-400" colspan="5">— nenhuma perna simples</td>
            </tr>

            <!-- Keyed on the start bar: a group holds legs that start on distinct bars, since a
                 detector marks a turn once. -->
            <tr
              v-for="leg in row.inside"
              :key="leg.first?.time"
              class="border-t border-gray-100"
            >
              <td />
              <td class="py-1 pr-4 font-mono">{{ when(leg.first) }}</td>
              <td class="py-1 pr-4 font-mono">
                {{ when(leg.last) }}
                <span v-if="leg.overruns" class="ml-1 text-amber-600">· passa do fecho</span>
              </td>
              <td class="py-1 pr-4 text-right">{{ leg.count }}</td>
              <td />
              <td />
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>
