<script setup lang="ts">
/**
 * The Log under the chart: a Series read as rows rather than drawn as an overlay.
 *
 * This is the other half of `OVERLAYS` in `pages/monitor.vue`. That map says which Patterns have a
 * shape on the chart; `LOGGED` below says which ones are answered by reading. A Pattern in
 * neither appears nowhere, which is the normal state of one whose page work has not been done —
 * `line-relations` was exactly that until this component existed.
 *
 * Deliberately fed the **manual** run's response and not `usePatterns`' automatic one. Line
 * relations is about the lines a person pinned, and a `GET` carries no lines, so the only run that
 * can answer it is the `POST` behind `Calcular`. The panel therefore has a real "nothing yet"
 * state, and that is honest rather than a gap: before the click there is no question to answer.
 *
 * The table is built from the Points' own keys, not from a column list per Pattern. Every Point on
 * the wire is a flat record of numbers and strings plus, at most, a nested bar — so one formatter
 * covers all of them, and the next Pattern that wants a Log needs a line in `LOGGED` and no
 * rendering code. The cost is that the columns are the engine's field names, in English, on a
 * screen whose copy is Portuguese. That is accepted: these rows are read against the Pattern's
 * source, where the same names are, and inventing labels here would put a second vocabulary
 * between the two.
 */
import { producerName, type PatternPoint, type PatternResponse } from '~/types/pattern'
import { barMoment } from '~/utils/bar-time'
import { Select, SelectContent, SelectItem, SelectTrigger } from '~/components/ui/select'

const props = defineProps<{
  /** The last manual pipeline run, or `null` while nobody has asked for one. */
  response: PatternResponse | null
  pending: boolean
  error: string | null
}>()

/**
 * Which producers this panel shows, keyed by the class part of the key — `line-relations`, without
 * its parameters — exactly as `OVERLAYS` is keyed, so a Pattern is named the same way on both
 * sides. Being in both is allowed and would mean a Series you can look at and read.
 */
const LOGGED = new Set(['line-relations'])

/** The columns every Point carries, pulled to the front so the bar reads before its payload. */
const BASE_COLUMNS = ['time', 'open', 'high', 'low', 'close', 'volume']

const entries = computed(() =>
  Object.entries(props.response?.series ?? {})
    .filter(([producer]) => LOGGED.has(producerName(producer)))
    .map(([producer, series]) => ({
      producer,
      // What the Pattern calls itself, which is what the picker shows. The key itself is the
      // row's tooltip, the same split the sidebar's picker makes.
      label: series.name,
      points: series.points,
    })),
)

/**
 * The producer on screen. `null` only while there is nothing to pick, which is the pre-`Calcular`
 * state — the watch below never leaves a selection pointing at a Series the response dropped.
 */
const selected = ref<string | null>(null)

watch(entries, (list) => {
  if (list.some(entry => entry.producer === selected.value)) return
  selected.value = list[0]?.producer ?? null
}, { immediate: true })

const current = computed(() => entries.value.find(entry => entry.producer === selected.value) ?? null)

/**
 * The union of the Points' keys, base bar first and payload after in the order the Points declare
 * them. A union rather than the first Point's keys because the wire omits nothing today, but a
 * sparse encoding tomorrow would silently lose a column and the reader would never know.
 */
const columns = computed(() => {
  const seen = new Set<string>()
  for (const point of current.value?.points ?? []) {
    for (const key of Object.keys(point)) seen.add(key)
  }

  return [
    ...BASE_COLUMNS.filter(key => seen.has(key)),
    ...[...seen].filter(key => !BASE_COLUMNS.includes(key)),
  ]
})

/**
 * One cell, as text.
 *
 * `time` goes through `barMoment` — the trading clock, for the reason that module spells out at
 * length. A nested object is a whole bar (`since`), and the only thing worth showing of one here
 * is *which* bar it is, so it collapses to the same reading. `null` is a real answer on several
 * of these fields — a `touch` has no `side`, a `breakout` no `wick` — and reads as `—`.
 */
function cell(point: PatternPoint, key: string): string {
  const value = (point as unknown as Record<string, unknown>)[key]

  if (value === null || value === undefined) return '—'
  if (key === 'time' && typeof value === 'number') return barMoment(value)

  if (typeof value === 'object') {
    const nested = value as { time?: unknown }
    return typeof nested.time === 'number' ? barMoment(nested.time) : JSON.stringify(value)
  }

  return String(value)
}

/** The picker speaks strings; the ref allows `null`, which reka has no value for. */
function pick(value: unknown) {
  selected.value = typeof value === 'string' ? value : null
}
</script>

<template>
  <p v-if="pending" class="p-6 text-center text-sm text-gray-500">
    Calculando…
  </p>

  <div v-else-if="error" class="p-6 text-center text-sm">
    <p class="text-red-600">Não foi possível calcular.</p>
    <p class="mt-1 font-mono text-xs text-gray-500">{{ error }}</p>
  </div>

  <p v-else-if="!entries.length" class="p-6 text-center text-sm text-gray-500">
    Nenhum cálculo ainda — marque linhas no gráfico e use <span class="font-medium">Calcular</span>.
  </p>

  <div v-else>
    <!-- Single-select, so plain `v-model` would do; the handler is here only because the ref
         allows `null` and reka's model does not. -->
    <Select :model-value="selected ?? undefined" @update:model-value="pick">
      <SelectTrigger size="sm" class="mb-3 w-full">
        <span>{{ current?.label ?? 'Escolher padrão' }}</span>
      </SelectTrigger>
      <SelectContent>
        <SelectItem
          v-for="entry in entries"
          :key="entry.producer"
          :value="entry.producer"
          :title="entry.producer"
        >
          {{ entry.label }}
        </SelectItem>
      </SelectContent>
    </Select>

    <p v-if="!current?.points.length" class="p-6 text-center text-sm text-gray-500">
      Nenhuma relação encontrada para as linhas marcadas.
    </p>

    <template v-else>
      <p class="pb-2 text-xs text-gray-500">
        {{ current.points.length }} {{ current.points.length === 1 ? 'ponto' : 'pontos' }}
      </p>

      <!-- Its own horizontal scroll: the panel already scrolls vertically, and a wide Series must
           not push the chart's column sideways. -->
      <div class="overflow-x-auto">
        <table class="w-full min-w-[40rem] text-xs tabular-nums">
          <!-- Sticky against the panel's own scroll, so the field names survive a long Series. -->
          <thead class="sticky top-0 bg-white text-gray-500">
            <tr class="text-left">
              <th v-for="column in columns" :key="column" class="py-1 pr-4 font-medium">
                {{ column }}
              </th>
            </tr>
          </thead>

          <tbody>
            <!-- Index in the key: every pinned line answers on the same bars, so `time` alone
                 is not unique within a Series. -->
            <tr
              v-for="(point, index) in current.points"
              :key="`${point.time}:${index}`"
              class="border-t border-gray-200"
            >
              <td v-for="column in columns" :key="column" class="py-1 pr-4 font-mono">
                {{ cell(point, column) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>
