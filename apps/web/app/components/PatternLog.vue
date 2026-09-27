<script setup lang="ts">
/**
 * The Log under the chart: a Series read as rows rather than drawn as an overlay.
 *
 * This is the other half of `OVERLAYS` in `pages/monitor.vue`. That map says which Patterns have a
 * shape on the chart; `LOGGED` below says which ones are answered by reading. A Pattern in
 * neither appears nowhere, which is the normal state of one whose page work has not been done —
 * `line-relations` was exactly that until this component existed.
 *
 * Fed **both** runs, which is a change from when it was written and the reason is the same one it
 * was written with. Line relations is about the lines a person pinned, and a `GET` carries no
 * lines, so the only run that can answer it is the `POST` behind `Calcular` — those entries still
 * appear only after a click, and the panel keeps a real "nothing yet" state for them. `bars` is
 * the other case: it is in the declared pipeline and answers on every closed bar, so waiting for a
 * `Calcular` that has nothing to do with it would be a gap rather than an honesty.
 *
 * They arrive as two props rather than one merged response because they are two answers about one
 * window and cannot share a `useFetch` key — the same split `autoOverlays` and `manualOverlays`
 * keep in `pages/monitor.vue`, meeting here in the picker instead of in the sidebar.
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
import { barBrief, barMoment } from '~/utils/bar-time'
import { MANUAL, PARTIAL } from '~/utils/manual-series'
import { Select, SelectContent, SelectItem, SelectTrigger } from '~/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/components/ui/table'

const props = defineProps<{
  /** The automatic pipeline run, which re-runs on every closed bar. */
  auto: PatternResponse | null
  /** The last manual pipeline run, or `null` while nobody has asked for one. */
  response: PatternResponse | null
  pending: boolean
  error: string | null
}>()

/**
 * Which producers this panel shows, keyed by the class part of the key — `line-relations`, without
 * its parameters — exactly as `OVERLAYS` is keyed, so a Pattern is named the same way on both
 * sides. Being in both is allowed and would mean a Series you can look at and read.
 *
 * A name can stand for more than one Series, and four names here do: the pipeline declares
 * `line-respect` over the levels and again over the sloped lines, `leg-target` follows it once per
 * respect, and the two moving averages get an `average-relations` and an `average-respect` each. All
 * of each reach the picker, for the reason both halves of the first pair are drawn — they are the same
 * rows about different lines. The filter is on the name and the entries are on the key, so admitting
 * one admits every instance, and they stay separate things to pick between.
 *
 * The three `average-*` names are `bars`' case and not `line-relations`': they are in the declared
 * pipeline and answer about the market on every closed bar, so they arrive on the automatic run and
 * are not in `MANUAL`. What that costs is the fourth kind. A `close` needs the proximity ladder, the
 * ladder only travels in a body, and `entries` below takes a producer both runs answered from the
 * automatic one — so the near misses around an average are computed on a `Calcular` and then shadowed
 * here by the `GET`'s copy, which has three kinds. That is a real loss, it is the one kind with a
 * dial, and the alternatives are worse: naming them `MANUAL` would click-gate a Series about the
 * market behind a button that is about pinned lines, and preferring the `POST`'s copy would move
 * `bars` too.
 */
const LOGGED = new Set([
  'average-relations',
  'average-respect',
  'average-target',
  'bars',
  'leg-breaks',
  'leg-recap',
  'leg-target',
  'line-relations',
  'line-respect',
  'trend-relations',
])

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
 * `level:1788519000:low` — so the bare field name promises a line and delivers its handle.
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
 * The fields the general formatter below misreads, and how they are read instead.
 *
 * A second exception beside `COLUMN_RENAMES`, and it should stay as small as that one. The rule the
 * formatter follows — a number is `String(value)` — is right for every price and every count the
 * engine emits, and wrong for exactly two things:
 *
 * - `ratio` is a fraction, and a fraction arrives as `0.6180339887`. Rounded here rather than in
 *   the engine, which measures and does not format. Keyed by the field and deliberately not by
 *   "any number that is not whole": prices are floats too, and `138500.000` would be a worse cell
 *   than the one we already have.
 * - `taken` is an array of **levels**, not of bars, and the array branch below would read it as
 *   "where it starts and how long it is" — which for a list of levels is neither. What a reader
 *   wants of them is *which* they were, and the bar each sits on is what says so. `broke` already
 *   carries the count in its own column, so spending this one on the count too would say one
 *   thing twice and the other not at all.
 * - `measured` is a whole `RetracedMove` and has no bar of its own, so the object branch below
 *   falls through to `JSON.stringify` and spends the width on six fields to show one number. The
 *   fraction is the answer; `retraced_legs` is what makes it legible and is the thing this hides,
 *   which is what `Copiar JSON` is for — the same trade `taken` makes.
 * - `reach` is a **`LegPoint` on one Series and a price on another**: `leg-recap` carries the whole
 *   point, `leg-target` carries the number. The object branch would show the bar and drop the
 *   price, which is the half a reader is checking, so both travel — and the `null` fall-through is
 *   what lets the bare number keep the general rule.
 * - `levels`, `trends`, `averages` and `hourly_averages` are arrays of **targets**, not of bars, so
 *   the array branch would read them as "where it starts and how long it is" and answer `1 barra`
 *   about a line. Which lines is the whole question — and on the two average fields the answer is
 *   the average's own name, since an average names its own line.
 *
 * `null` from an entry means "no opinion, fall through" — a key can be listed here and still let
 * the general rules handle a value it has nothing to say about.
 */
function hits(value: unknown): string | null {
  if (!Array.isArray(value)) return null
  // `—` rather than an empty cell, `taken`'s reason. On a `leg-recap` row it has two readings and
  // `provisional` is the column that tells them apart — see that field's own note in `pattern.ts`.
  // On the two average fields there is a third: those are filled on the automatic run, so an empty
  // one there is about the leg and never about nobody having pressed `Calcular`.
  if (value.length === 0) return '—'
  return value.map(target => String((target as { line?: unknown }).line)).join(' · ')
}

const COLUMN_FORMATS: Record<string, (value: unknown) => string | null> = {
  ratio: value => (typeof value === 'number' ? value.toFixed(3) : null),
  measured: (value) => {
    const ratio = (value as { ratio?: unknown } | null)?.ratio
    return typeof ratio === 'number' ? ratio.toFixed(3) : null
  },
  reach: (value) => {
    const point = value as { price?: unknown, time?: unknown } | null
    if (typeof point?.price !== 'number' || typeof point.time !== 'number') return null
    return `${point.price} · ${barBrief(point.time)}`
  },
  levels: hits,
  trends: hits,
  averages: hits,
  hourly_averages: hits,
  taken: (value) => {
    if (!Array.isArray(value)) return null
    // `—` rather than an empty cell: a leg that broke nothing is the ordinary case and reads as
    // the same "nothing here" every other empty field on this table reads as.
    if (value.length === 0) return '—'
    return value.map(level => barBrief((level as PatternPoint).time)).join(' · ')
  },
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

function logged(response: PatternResponse | null) {
  return Object.entries(response?.series ?? {})
    .filter(([producer]) => LOGGED.has(producerName(producer)))
    .map(([producer, series]) => ({
      producer,
      // What the Pattern calls itself, which is what the picker shows. The key itself is the
      // row's tooltip, the same split the sidebar's picker makes.
      label: series.name,
      points: series.points,
    }))
}

/**
 * Both runs' logged Series, the automatic one first.
 *
 * **Three rules, and they are three different rules.** The two responses answer under the same
 * producer keys — `PinnedLines.__str__` says `pinned` whatever the lines are, deliberately, so a key
 * does not move when they change — and nothing but the sets in `manual-series.ts` can tell the
 * copies apart.
 *
 * 1. A producer **both runs answer identically** is taken from the automatic one and not listed
 *    twice. The manual `POST` runs the *whole* pipeline, so `bars` comes back on it too, and the two
 *    answers are about the same window. First wins, so the entry a reader has been looking at does
 *    not jump position the moment a run lands.
 * 2. A producer in `MANUAL` is dropped from the automatic list *before* `seen` is built from it. The
 *    `GET` carries no lines, so it answers those keys with an empty Series on every run, forever.
 *    Left in, that empty answer claims the key and filters the real rows out, and the Pattern can
 *    only ever say "0 pontos" — which is exactly what it did until this filter existed. So before
 *    the first run with lines those Series are not in the picker at all. That is the honest state
 *    and the sidebar's already: without lines there is no question to answer.
 * 3. A producer in `PARTIAL` is the case neither of those covers, and `leg-recap` is why it exists:
 *    the `GET` answers it, but with two of its six readings empty for want of a line. So it is kept
 *    from the automatic run **only until the manual run answers it**, and superseded after. Rule 1
 *    would shadow the complete copy with the partial one; rule 2 would put a row that is four
 *    sixths right behind a button that is about lines.
 *
 * The cost of rule 3 is the thing rule 1 exists to prevent — a `PARTIAL` entry **moves position**
 * when a `Calcular` lands, out of the first block and into the second. Argued where the set is
 * declared. The *selection* survives it regardless: `selected` holds a producer key, both copies
 * wear the same one, and the repair watch below only fires when the key has gone.
 */
const entries = computed(() => {
  const manual = logged(props.response)
  const answered = new Set(manual.map(entry => entry.producer))

  const automatic = logged(props.auto).filter((entry) => {
    const name = producerName(entry.producer)
    if (MANUAL.has(name)) return false
    if (PARTIAL.has(name)) return !answered.has(entry.producer)
    return true
  })

  const seen = new Set(automatic.map(entry => entry.producer))
  return [...automatic, ...manual.filter(entry => !seen.has(entry.producer))]
})

/**
 * The producer on screen. `null` only while there is nothing to pick, which is now only the state
 * before the first response arrives — the watch below never leaves a selection pointing at a
 * Series a response dropped.
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
 *
 * Both responses, since either one is a new array under the producer on screen. The automatic one
 * lands on every closed bar, so ticks on a `bars` Series are short-lived by design — an index into
 * an array that has been replaced means nothing, and keeping the boxes ticked would say otherwise.
 */
watch([selected, () => props.auto, () => props.response], () => {
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

/** Whether the dump below the table is open. Survives a new response and a new producer. */
const dumping = ref(false)

/**
 * The Points on screen exactly as the engine emitted them — the ticked ones, or all of them.
 *
 * **Not `selectedRows`**, and the difference is the whole reason this exists. That computed narrows
 * to the visible columns and renames `line` to `lineId`, which is right for a clipboard: the reader
 * picked those columns and the header they read said `line id`. It is wrong here. What the table
 * above does to every nested field is collapse it — `bars` to where it starts and how long it is,
 * `levels` to a line id, `measured` to a fraction — and each of those is argued for in `cell()`. So
 * the one thing a reader cannot get from this panel is the Point, and that is what this is: the
 * hidden bar included, `time` still in Unix seconds, under the keys the wire uses and code will
 * index by. The table is the reading; this is the thing being read.
 *
 * Which means the two must not be folded together, however alike they look.
 *
 * Reads the selection model rather than `props`, so it tracks the ticks; and needs no watch of its
 * own, because the one above already clears them on a new response or a new producer.
 */
const dump = computed(() => {
  const ticked = table.getSelectedRowModel().rows
  return JSON.stringify(ticked.length ? ticked.map(row => row.original) : points.value, null, 2)
})

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
 * is *which* bar it is, so it collapses to the same reading. An **array** of bars (`bars`) is a
 * run, and the same argument applies twice over: what a reader wants of it is where it starts and
 * how long it is, and the alternative — the raw JSON of a dozen candles in one cell — is not a
 * reading of anything. The whole run still leaves through `Copiar JSON`, which is what that button
 * is for. `null` is a real answer on several of these fields — a `touch` has no `side`, a
 * `breakout` no `wick`, and only a `close` carries a `gap` and a `leg` — and reads as `—`.
 */
function cell(point: PatternPoint, key: string): string {
  const value = (point as unknown as Record<string, unknown>)[key]

  if (value === null || value === undefined) return '—'
  if (key === 'time' && typeof value === 'number') return barMoment(value)

  // Ahead of the general rules rather than after them, so an exception is an exception and not a
  // special case bolted to the end of whichever branch happened to catch the value first.
  const formatted = COLUMN_FORMATS[key]?.(value)
  if (formatted !== null && formatted !== undefined) return formatted

  if (Array.isArray(value)) {
    const first = value.at(0) as { time?: unknown } | undefined
    if (typeof first?.time !== 'number') return JSON.stringify(value)
    return `${barMoment(first.time)} · ${value.length} ${value.length === 1 ? 'barra' : 'barras'}`
  }

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
  <!-- Only while there is nothing to read. The automatic run re-fetches on every closed bar, and a
       panel that blanked for each of those would flash empty under a reader's eyes every five
       minutes — the rows on screen are still the answer about the window until the new ones land. -->
  <p v-if="pending && !entries.length" class="p-6 text-center text-sm text-gray-500">
    Calculando…
  </p>

  <div v-else-if="error && !entries.length" class="p-6 text-center text-sm">
    <p class="text-red-600">Não foi possível calcular.</p>
    <p class="mt-1 font-mono text-xs text-gray-500">{{ error }}</p>
  </div>

  <p v-else-if="!entries.length" class="p-6 text-center text-sm text-gray-500">
    Nenhuma série para ler ainda.
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

    <!-- One reading for an empty Series, whichever it is: a Pattern that found nothing found
         nothing, and naming the pinned lines here would misdescribe every other entry. -->
    <p v-if="!points.length" class="p-6 text-center text-sm text-gray-500">
      Nenhum ponto nesta série.
    </p>

    <template v-else>
      <div class="flex items-center justify-between gap-4 pb-2">
        <p class="text-xs text-gray-500">
          {{ points.length }} {{ points.length === 1 ? 'ponto' : 'pontos' }}
          <span v-if="selectedRows.length">· {{ selectedRows.length }} selecionado{{ selectedRows.length === 1 ? '' : 's' }}</span>
        </p>

        <div class="flex items-center gap-2">
          <!-- Never disabled, unlike its neighbour: there is always a Series to dump, and with no
               ticks that is the whole of it. -->
          <button
            class="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50"
            @click="dumping = !dumping"
          >
            {{ dumping ? 'Ocultar JSON' : 'Ver JSON' }}
          </button>

          <button
            class="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-transparent"
            :disabled="!selectedRows.length"
            @click="copySelection"
          >
            {{ copied ? 'Copiado!' : 'Copiar JSON' }}
          </button>
        </div>
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

      <!-- Both scrollbars of its own. The panel scrolls vertically and `Table` brings its own
           horizontal scroll, so a dump that grew with its content would push the table out of
           reach — of a reader who is looking at both. Tinted and bordered so it reads as a quoted
           artefact rather than as more of the table above it. -->
      <pre
        v-if="dumping"
        class="mt-3 max-h-80 overflow-auto rounded border border-gray-200 bg-gray-50 p-2 text-xs leading-snug text-gray-700"
      >{{ dump }}</pre>
    </template>
  </div>
</template>
