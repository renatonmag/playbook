<script setup lang="ts">
import type { AdvancingLeg } from '~/types/pattern'
import { barMoment } from '~/utils/bar-time'

/**
 * `AdvancingLeg` as a table, for the reason `LegWindowVerify` is one: this Pattern draws nothing.
 * Every leg it keeps is already on the chart under `simple-leg`, so what needs checking is not a
 * shape but a decision — which legs are here, and which are not.
 *
 * **One level**, unlike `NestedLegsVerify`. The Series is flat by design, and the group each row
 * came from is not carried; what a row does say is the role it played, which is the comparison
 * between its two directions. The rows stay in their `nested-legs` order, so a run of rows sharing
 * a `grupo` badge *is* a group, read down the column.
 *
 * The column that carries the whole rule is `nível`: the last bar's `high` on a bullish group, its
 * `low` on a bearish one — the number the filter actually compared. Down the advances of one group
 * it must rise strictly (bullish) or fall strictly (bearish). The pullbacks in between are not part
 * of that sequence and their `nível` is shown greyed for exactly that reason: it is the leg's last
 * bar like everyone else's, and the rule never looked at it.
 */
const props = defineProps<{ points: AdvancingLeg[] }>()

const rows = computed(() =>
  props.points.map((point, index) => {
    const last = point.bars[point.bars.length - 1]
    return {
      index,
      first: point.bars[0],
      last,
      count: point.bars.length,
      direction: point.direction,
      group: point.group,
      // The role, derived rather than carried: it is exactly this comparison, and the Point stores
      // attributes. See the `AdvancingLeg` doc comment.
      advances: point.direction === point.group,
      // Read for the *group's* direction, not the leg's — that is which field the rule compared.
      level: last ? (point.group === 'bullish' ? last.high : last.low) : null,
    }
  }),
)

/** Advances and pullbacks, so the header says how the filter split the window without scrolling. */
const advances = computed(() => rows.value.filter(row => row.advances).length)

/**
 * Short date and time, on the trading clock. `barMoment` carries the reason it is not the
 * reader's clock — every label on this page read three hours early before it existed.
 *
 * Reads the bar defensively and renders `—` rather than crashing the page: `bars` is never empty
 * in practice, but it is a wire shape, the same argument `NestedLegsVerify` makes.
 */
function when(bar: { time: number } | undefined) {
  return bar ? barMoment(bar.time) : '—'
}

/** Price to the instrument's own precision, as `LegReversalsVerify` formats it. */
function price(value: number | null) {
  return value === null ? '—' : value.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
}

/**
 * The two roles, told apart at a glance. A lookup keyed on the boolean rather than a ternary in
 * the template, for the reason `LegReversalsVerify`'s `BADGES` gives: a lookup fails loudly where
 * a ternary shows the last branch confidently.
 */
const ROLES: Record<'true' | 'false', { label: string, badge: string }> = {
  true: { label: 'avanço', badge: 'bg-emerald-100 text-emerald-700' },
  false: { label: 'pullback', badge: 'bg-gray-100 text-gray-600' },
}

function role(advances: boolean) {
  return ROLES[advances ? 'true' : 'false']
}

/** The group's own move, in the same words the rest of the screen uses. */
const WAYS: Record<AdvancingLeg['group'], string> = {
  bullish: 'alta',
  bearish: 'baixa',
}
</script>

<template>
  <div class="p-4">
    <p v-if="!rows.length" class="p-8 text-center text-sm text-gray-500">
      Nenhuma perna sobreviveu ao filtro nesta janela.
    </p>

    <template v-else>
      <p class="pb-3 text-xs text-gray-500">
        {{ rows.length }} pernas · {{ advances }} avanços · {{ rows.length - advances }} pullbacks
      </p>

      <div class="overflow-x-auto">
        <table class="w-full min-w-[44rem] text-xs tabular-nums">
          <thead class="text-gray-500">
            <tr class="text-left">
              <th class="py-1 pr-4 text-right font-medium">#</th>
              <th class="py-1 pr-4 font-medium">início</th>
              <th class="py-1 pr-4 font-medium">fim</th>
              <th class="py-1 pr-4 text-right font-medium">barras</th>
              <th class="py-1 pr-4 font-medium">papel</th>
              <th class="py-1 pr-4 font-medium">grupo</th>
              <th class="py-1 text-right font-medium">nível</th>
            </tr>
          </thead>

          <tbody>
            <tr
              v-for="row in rows"
              :key="row.first?.time"
              class="border-t border-gray-100"
            >
              <td class="py-1 pr-4 text-right text-gray-500">{{ row.index }}</td>
              <td class="py-1 pr-4 font-mono">{{ when(row.first) }}</td>
              <td class="py-1 pr-4 font-mono">{{ when(row.last) }}</td>
              <td class="py-1 pr-4 text-right">{{ row.count }}</td>
              <td class="py-1 pr-4">
                <span class="rounded px-1.5 py-0.5" :class="role(row.advances).badge">
                  {{ role(row.advances).label }}
                </span>
              </td>
              <td class="py-1 pr-4 text-gray-500">{{ WAYS[row.group] }}</td>
              <!-- Greyed on a pullback: the number is its last bar's like any other row's, and the
                   rule never compared it. Only the advances form the rising (or falling) run. -->
              <td class="py-1 text-right" :class="row.advances ? '' : 'text-gray-400'">
                {{ price(row.level) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>
