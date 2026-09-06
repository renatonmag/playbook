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
 * The column defs are built from the Points' own keys, not from a column list per Pattern. Every
 * Point on the wire is a flat record of numbers and strings plus, at most, a nested bar — so one
 * formatter covers all of them, and the next Pattern that wants a Log needs a line in `LOGGED` and
 * no rendering code. The one thing the keys do not decide is which of them appear: the bar under
 * the payload is dropped, for the reason `HIDDEN_COLUMNS` gives. The cost is that the columns are
 * the engine's field names, in English, on a screen whose copy is Portuguese. That is accepted:
 * these rows are read against the Pattern's source, where the same names are, and inventing labels
 * here would put a second vocabulary between the two. `COLUMN_RENAMES` is the stated exception:
 * a field name may be corrected where it misreads *on its own*, and nothing more — a label per
 * field is that second vocabulary again, arrived at one entry at a time.
 *
 * Reading is not the end of the loop, though — what comes back from `Calcular` is usually wanted
 * somewhere else, as a fixture or in an issue. Hence TanStack Table underneath: rows can be
 * ticked, and `Copiar JSON` puts the ticked rows on the clipboard with the values **as they came
 * off the wire**, not as the strings on screen. A formatted row is a reading; only the raw value
 * is data. What it carries is the columns, spelled as the columns are, so the copy and the table
 * never disagree about what a row is — which costs the copy its last claim to being the wire's own
 * record. See `COLUMN_RENAMES`.
 */
import {
  FlexRender,
  rowSelectionFeature,
  tableFeatures,
  useTable,
  type ColumnDef,
  type RowSelectionState,
} from '@tanstack/vue-table'
import { producerName, type PatternPoint, type PatternResponse } from '~/types/pattern'
import { barMoment } from '~/utils/bar-time'
import { Select, SelectContent, SelectItem, SelectTrigger } from '~/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/components/ui/table'

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

/** Pulled to the front, so a row says which bar it is before it says anything else. */
const BASE_COLUMNS = ['time']

/**
 * The rest of the bar, left out.
 *
 * Not because it is uninteresting — it is the OHLCV of the Point, and a Point *is* a candle plus a
 * payload. It is that the chart directly above draws all five, and a Series read as rows is read
 * for its payload: six columns of bar in front of it pushed the answer off the right edge of a
 * table that already scrolls sideways. What a row is *about* wins the width.
 */
const HIDDEN_COLUMNS = new Set(['open', 'high', 'low', 'close', 'volume'])

/**
 * The fields whose own name misreads, and what they are called instead.
 *
 * The exception to the rule the docblock states, and it should stay one. `line` holds an id —
 * `wick:1788519000:low:end` — so the bare field name promises a line and delivers its handle.
 *
 * Both spellings in one entry, so a rename cannot land on the screen and not in the copy. That is
 * the whole reason this is a record of pairs rather than two maps: the header and the key are one
 * decision, and a column called `line id` that copies as `line` would be the same misreading back
 * again, one step further from where anyone would look for it.
 */
const COLUMN_RENAMES: Record<string, { header: string, key: string }> = {
  line: { header: 'line id', key: 'lineId' },
}

/**
 * Selection is the one feature this table registers. v9 ships nothing by default — no sorting, no
 * filtering, no pagination — and that is the right trade here: the Log shows one Series exactly as
 * the engine emitted it, in emission order, and a column the reader can re-sort would quietly break
 * the correspondence with the Pattern's source that the English field names exist to keep.
 *
 * At module scope because the table's features must be a stable reference across renders.
 */
const features = tableFeatures({ rowSelectionFeature })

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

const points = computed<PatternPoint[]>(() => current.value?.points ?? [])

/**
 * The union of the Points' keys, less the hidden bar, `time` first and payload after in the order
 * the Points declare them. A union rather than the first Point's keys because the wire omits
 * nothing today, but a sparse encoding tomorrow would silently lose a column and the reader would
 * never know.
 *
 * This is the one list of what the Log shows: the table renders it, and `Copiar JSON` copies it.
 */
const columns = computed(() => {
  const seen = new Set<string>()
  for (const point of points.value) {
    for (const key of Object.keys(point)) {
      if (!HIDDEN_COLUMNS.has(key)) seen.add(key)
    }
  }

  return [
    ...BASE_COLUMNS.filter(key => seen.has(key)),
    ...[...seen].filter(key => !BASE_COLUMNS.includes(key)),
  ]
})

/**
 * One column per key, all of them `display` columns.
 *
 * Not `accessorKey`: an accessor exists to give the table a value to sort, filter or group by, and
 * this table does none of those. What it would buy instead is a `DeepKeys` constraint that a key
 * discovered at runtime cannot satisfy. So the def carries the formatter and nothing else, and
 * `row.original` stays the only thing anyone reads the Point out of — the cells here, and
 * `selectedRows` below.
 */
const columnDefs = computed<ColumnDef<typeof features, PatternPoint, unknown>[]>(() =>
  columns.value.map(key => ({
    id: key,
    // Renamed only at the edges — this header and the copy's keys. `id`, `cell` and `columns`
    // itself all go by the field name, so the middle of the component has one vocabulary.
    header: COLUMN_RENAMES[key]?.header ?? key,
    cell: ({ row }) => cell(row.original, key),
  })),
)

/**
 * Selection lives out here rather than inside the table because two other things need it: the
 * `Copiar` button, and the reset below.
 */
const rowSelection = ref<RowSelectionState>({})
const tableState = computed(() => ({ rowSelection: rowSelection.value }))

/**
 * Rows are addressed by index — the default `getRowId`, and the honest one here, since a Series has
 * no key of its own (every pinned line answers on the same bars, so `time` is not unique). An index
 * only means something against the array it was taken from, so any new array clears the ticks:
 * switching producer in the picker, and every `Calcular` run.
 *
 * Its own watch, not folded into the one above: that one exists to repair the picker, and a clear
 * fired from it would tie two unrelated jobs to one condition.
 */
watch([selected, () => props.response], () => {
  rowSelection.value = {}
})

const table = useTable<typeof features, PatternPoint>({
  features,
  columns: columnDefs,
  data: points,
  state: tableState,
  // Table callbacks pass either the next value or a function of the previous one.
  onRowSelectionChange: (next) => {
    rowSelection.value = typeof next === 'function' ? next(rowSelection.value) : next
  },
})

/**
 * The ticked rows, as the clipboard will have them: each Point narrowed to the columns on screen,
 * so what you copy is what you selected — the hidden bar is not smuggled out with it.
 *
 * The values stay **raw** even though the keys are the table's: `time` leaves as Unix seconds and
 * a nested `since` leaves whole. The cells are a reading of a Point and this is the Point, which
 * is the whole reason a copy button beats retyping the screen.
 *
 * The keys being the table's has a price, and it is paid here: a fixture pasted out of the Log
 * says `lineId` where the engine says `line`, so it is one rename away from the wire rather than
 * zero. Taken deliberately — `COLUMN_RENAMES` exists because `line` names the wrong thing, and a
 * reader who has to correct a key is better off than one who has to work out what it held.
 *
 * Narrowed at the top level only, deliberately — a nested bar copied entire is still exactly what
 * the engine emitted, and cutting it down would invent a third shape nothing else knows.
 *
 * Read inside a `computed` so the button and the count track the ticks. A bare call in the handler
 * would be a snapshot — correct at that instant, and reactive to nothing.
 */
const selectedRows = computed(() =>
  table.getSelectedRowModel().rows.map((row) => {
    const point = row.original as unknown as Record<string, unknown>
    return Object.fromEntries(
      columns.value.map(key => [COLUMN_RENAMES[key]?.key ?? key, point[key]]),
    )
  }),
)

const copied = ref(false)

async function copySelection() {
  await navigator.clipboard.writeText(JSON.stringify(selectedRows.value, null, 2))
  copied.value = true
  setTimeout(() => (copied.value = false), 1500)
}

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

    <p v-if="!points.length" class="p-6 text-center text-sm text-gray-500">
      Nenhuma relação encontrada para as linhas marcadas.
    </p>

    <template v-else>
      <div class="flex items-center justify-between gap-4 pb-2">
        <p class="text-xs text-gray-500">
          {{ points.length }} {{ points.length === 1 ? 'ponto' : 'pontos' }}
          <span v-if="selectedRows.length">· {{ selectedRows.length }} selecionado{{ selectedRows.length === 1 ? '' : 's' }}</span>
        </p>

        <button
          class="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-transparent"
          :disabled="!selectedRows.length"
          @click="copySelection"
        >
          {{ copied ? 'Copiado!' : 'Copiar JSON' }}
        </button>
      </div>

      <!-- `Table` brings its own horizontal scroll: the panel already scrolls vertically, and a
           wide Series must not push the chart's column sideways. -->
      <Table class="min-w-[40rem] text-xs tabular-nums">
        <!-- Sticky against the panel's own scroll, so the field names survive a long Series. -->
        <TableHeader class="sticky top-0 bg-white">
          <TableRow v-for="group in table.getHeaderGroups()" :key="group.id">
            <!-- The tick column is written here rather than as a leading column def: its two
                 checkboxes are markup, and a def would have to build them with `h()` — script
                 rendering a control the rest of the panel renders in the template.

                 `getIsSomeRowsSelected` is "at least one", not "some but not all" — so the
                 half-tick has to exclude the all case by hand, or a fully ticked table shows a
                 box that says it is partly ticked. -->
            <TableHead class="w-8 px-2">
              <input
                type="checkbox"
                aria-label="Selecionar tudo"
                :checked="table.getIsAllRowsSelected()"
                :indeterminate="table.getIsSomeRowsSelected() && !table.getIsAllRowsSelected()"
                @change="table.getToggleAllRowsSelectedHandler()($event)"
              >
            </TableHead>
            <TableHead
              v-for="header in group.headers"
              :key="header.id"
              class="h-8 px-2 text-xs font-medium text-gray-500"
            >
              <FlexRender v-if="!header.isPlaceholder" :header="header" />
            </TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          <TableRow
            v-for="row in table.getRowModel().rows"
            :key="row.id"
            :data-state="row.getIsSelected() ? 'selected' : undefined"
          >
            <TableCell class="w-8 px-2">
              <input
                type="checkbox"
                :aria-label="`Selecionar linha ${row.index + 1}`"
                :checked="row.getIsSelected()"
                @change="row.getToggleSelectedHandler()($event)"
              >
            </TableCell>
            <TableCell
              v-for="cellItem in row.getAllCells()"
              :key="cellItem.id"
              class="px-2 py-1 font-mono"
            >
              <FlexRender :cell="cellItem" />
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </template>
  </div>
</template>
