<script setup lang="ts">
import type { Timeframe } from '~/types/candle'
import type { Shape } from '~/types/shape'
import { AVERAGE_WINDOW, counts, DEFAULT_EXPANSION, DEFAULT_K, DEFAULT_SIMILARITY, impliedBodyMin, occurrences, type Occurrence } from '~/utils/two-bar-reversal'

/**
 * The bench for `TwoBarReversal` — the sibling of `/rules`, for a rule spanning two Candles.
 *
 * Same bargain as that page: the Shapes are fetched once and the rule is evaluated in the client
 * on every keystroke, so no rule parameter ever reaches the server. What differs is the unit and
 * the reading. `/rules` judges one Candle and shows a spaced *sample* of what it marked; this one
 * judges a pair and lists **everything**, paginated — which it can afford to, because the counts
 * here are in the thousands rather than the tens of thousands.
 */

const SYMBOL = 'WIN@N'

/** Only the two the database holds, exactly as on `/rules`. */
const BENCH_TIMEFRAMES: Timeframe[] = ['5m', '1h']

/**
 * Occurrences per page. Modest because a row is not a card: an occurrence is 2 to 8 Candles wide,
 * so 24 of them fill a screen where 24 single bars would not.
 */
const PAGE_SIZE = 24

/** The tallest a Candle in a row is drawn, in pixels. The rest scale down against it. */
const ROW_HEIGHT = 84

/**
 * The shortest a Candle may be drawn, as a fraction of `ROW_HEIGHT`.
 *
 * Almost never reached: across the `1h` history exactly one occurrence holds a Candle under a
 * tenth of its neighbour, and the median ratio is 0.65. It exists so that one does not render as
 * an invisible line.
 */
const MIN_SCALE = 0.12

const route = useRoute()
const router = useRouter()

/**
 * One dial, read from the URL — which carries the rule, so a bench state is a link, the same
 * contract `/rules` keeps.
 *
 * Anything absent or unusable falls back rather than erroring, as `fromQuery` does on `/rules`.
 * `0` has to survive the round trip, because on `similarity` it is a real setting and not an
 * empty field.
 */
function dial(key: string, fallback: number) {
  return computed(() => {
    const raw = route.query[key]
    const parsed = Number(raw)
    return typeof raw === 'string' && raw !== '' && !Number.isNaN(parsed) && parsed >= 0
      ? parsed
      : fallback
  })
}

const k = dial('k', DEFAULT_K)

/** How alike the two bodies must be in size. `0` turns the criterion off. */
const similarity = dial('s', DEFAULT_SIMILARITY)

/** How far the larger bar must beat the recent average amplitude. `0` turns the criterion off. */
const expansion = dial('m', DEFAULT_EXPANSION)

const timeframe = computed<Timeframe>(() => (route.query.tf === '5m' ? '5m' : '1h'))

/** Newest first by default: the page nobody scrolls past should hold the market that exists now. */
const newestFirst = computed(() => route.query.ordem !== 'antigas')

function update(patch: Record<string, string | undefined>) {
  router.replace({
    query: {
      k: String(k.value),
      s: String(similarity.value),
      m: String(expansion.value),
      tf: timeframe.value,
      ordem: newestFirst.value ? undefined : 'antigas',
      ...patch,
    },
  })
}

const { data: fiveMinute, pending: pendingFive, error: errorFive } = useShapes(SYMBOL, '5m')
const { data: hourly, pending: pendingHour, error: errorHour } = useShapes(SYMBOL, '1h')

const shapes = computed<Record<Timeframe, Shape[]>>(() => ({
  '5m': fiveMinute.value ?? [],
  '15m': [],
  '1h': hourly.value ?? [],
  '1d': [],
}))

const loading = computed(() => pendingFive.value || pendingHour.value)
const failure = computed(() => errorFive.value ?? errorHour.value)

/** What the rule marks in each timeframe. Recomputed on every change of `k`, in memory. */
const hits = computed(() =>
  BENCH_TIMEFRAMES.map(one => ({
    timeframe: one,
    ...counts(shapes.value[one], k.value, similarity.value, expansion.value, one),
  })),
)

/** The occurrences the list is showing, in reading order. */
const found = computed(() => {
  const all = occurrences(
    shapes.value[timeframe.value],
    k.value,
    similarity.value,
    expansion.value,
    timeframe.value,
  )
  return newestFirst.value ? [...all].reverse() : all
})

const pages = computed(() => Math.max(1, Math.ceil(found.value.length / PAGE_SIZE)))

/**
 * Which page the list is on. A plain `ref`, not the URL: what is worth sharing is the *rule*, and
 * page 37 of one `k` is a different set of bars from page 37 of another.
 */
const page = ref(1)

// Any change to what is being listed invalidates where you were in it.
watch([k, similarity, expansion, timeframe, newestFirst], () => (page.value = 1))

/**
 * The page being shown, with each Candle already paired to the height it draws at.
 *
 * The height is computed here rather than in the template so the row's largest amplitude is found
 * once per occurrence instead of once per bar.
 */
const shown = computed(() =>
  found.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE).map((one) => {
    const largest = Math.max(...one.shapes.map(shape => shape.amplitude))
    return { ...one, bars: one.shapes.map(shape => ({ shape, height: heightOf(shape, largest) })) }
  }),
)

/** The length histogram, as rows — how much of the list is a plain pair and how much is a run. */
const spread = computed(() => {
  const lengths = hits.value.find(hit => hit.timeframe === timeframe.value)?.lengths ?? new Map()
  return [...lengths.entries()].sort(([a], [b]) => a - b).map(([bars, howMany]) => ({ bars, howMany }))
})

/**
 * How tall one Candle is drawn — its amplitude against the largest in the same occurrence.
 *
 * The scale is **internal to the occurrence** and never global: `WIN@N` changed price level
 * between 2021 and 2026, so amplitudes from different years are not comparable and a shared scale
 * would draw the whole of 2021 as slivers.
 *
 * Only the heights mean anything. There is no vertical *offset*, because `/shapes` carries no
 * price and a bar's position on the scale is unknowable from what this page holds — so the row
 * answers "was the second bar bigger?" and never "did it close below the first one's open?".
 */
function heightOf(shape: Shape, largest: number): number {
  if (largest <= 0) return ROW_HEIGHT
  return Math.round(ROW_HEIGHT * Math.max(MIN_SCALE, shape.amplitude / largest))
}

/** The pinned-window link `/monitor` understands, ending at the Candle the occurrence completes on. */
function inContext(one: Occurrence) {
  return {
    path: '/monitor',
    query: { symbol: SYMBOL, timeframe: timeframe.value, to: new Date(one.time * 1000).toISOString() },
  }
}

/** Full date and time, for the tooltip. */
function when(time: number) {
  return new Date(time * 1000).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

/**
 * The day and the hour an occurrence completed. The year is spelled out rather than truncated:
 * the `1h` history spans five years, and dropping it makes 2021 and 2026 identical.
 */
function label(one: Occurrence) {
  return new Date(one.time * 1000).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function count(value: number) {
  return value.toLocaleString('pt-BR')
}
</script>

<template>
  <main class="mx-auto max-w-7xl p-8">
    <header class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold">Reversão de duas barras</h1>
        <p class="mt-1 text-sm text-gray-500">
          {{ SYMBOL }} · <code class="font-mono">TwoBarReversal</code> ·
          <NuxtLink to="/rules" class="underline">bancada de uma barra</NuxtLink>
        </p>
      </div>
      <!-- Said here, in the loudest place on the page, because a list of thousands of rows reads
           as a list of signals unless it is told not to. -->
      <p class="max-w-md text-xs text-gray-500">
        Isto é um <b>filtro de forma e tamanho, não um detector de sinal</b>. A regra não olha
        <i>onde</i> o par acontece — nos ajustes padrão marca 2% a 4% de todos os pares do pregão,
        o corte barato que deixa o olho humano ver só candidatos. A API mede; a regra é avaliada
        aqui no navegador.
      </p>
    </header>

    <p v-if="loading" class="mt-8 rounded border border-gray-200 p-8 text-center text-sm text-gray-500">
      Medindo as Candles…
    </p>

    <div v-else-if="failure" class="mt-8 rounded border border-gray-200 p-8 text-center text-sm">
      <p class="text-red-600">Não foi possível ler as formas.</p>
      <p class="mt-1 font-mono text-xs text-gray-500">{{ failure.message }}</p>
    </div>

    <template v-else>
      <!-- zona 1 — a regra -->
      <section class="mt-6 rounded border border-gray-200 p-4">
        <h2 class="text-sm font-semibold">A regra</h2>
        <p class="mt-1 text-xs text-gray-500">
          Duas Candles contíguas do mesmo pregão, cada uma com
          <code class="font-mono">corpo ≥ k · maior pavio</code>, de cores contrárias, com corpos
          de tamanhos parecidos, e com pelo menos uma delas maior que a média recente.
        </p>

        <div class="mt-3 flex flex-wrap items-start gap-x-10 gap-y-4 text-sm">
          <div>
            <label class="flex items-center gap-2">
              <span class="text-gray-500"><code class="font-mono">k</code> — corpo contra o pavio</span>
              <input
                type="number" step="0.1" min="0"
                class="w-20 rounded border border-gray-300 px-2 py-1 text-sm"
                :value="k"
                @change="update({ k: ($event.target as HTMLInputElement).value })"
              >
            </label>
            <!-- Shown because `k` bounds the body on its own: without this, someone reads a count
                 that did not move and concludes the data is wrong rather than the dial redundant. -->
            <p class="mt-1 text-xs text-gray-500">
              só isso já garante <code class="font-mono">corpo ≥ {{ impliedBodyMin(k).toFixed(3) }}</code>
            </p>
          </div>

          <div>
            <label class="flex items-center gap-2">
              <span class="text-gray-500"><code class="font-mono">s</code> — corpos parecidos</span>
              <input
                type="number" step="0.05" min="0" max="1"
                class="w-20 rounded border border-gray-300 px-2 py-1 text-sm"
                :value="similarity"
                @change="update({ s: ($event.target as HTMLInputElement).value })"
              >
            </label>
            <!-- Spelled out because the obvious reading is the wrong one: `body` is already a
                 fraction, and filtering on *that* does nothing, since `k` pins every body above
                 `k/(k+2)` and the fractions then bunch against 1. -->
            <p class="mt-1 text-xs text-gray-500">
              <code class="font-mono">menor ÷ maior</code> dos dois corpos <b>em pontos</b>, não em
              fração. <code class="font-mono">0</code> desliga.
            </p>
          </div>

          <div>
            <label class="flex items-center gap-2">
              <span class="text-gray-500"><code class="font-mono">m</code> — contra a média</span>
              <input
                type="number" step="0.1" min="0"
                class="w-20 rounded border border-gray-300 px-2 py-1 text-sm"
                :value="expansion"
                @change="update({ m: ($event.target as HTMLInputElement).value })"
              >
            </label>
            <!-- Three things the dial does not say on its own, and each one is a reading someone
                 would otherwise get wrong: what is measured, how many bars have to pass, and that
                 the neighbour dial `s` measures a different quantity in the same units. -->
            <p class="mt-1 text-xs text-gray-500">
              <b>pelo menos uma</b> das duas barras com
              <code class="font-mono">amplitude ≥ m · média</code> das
              {{ AVERAGE_WINDOW }} anteriores — amplitude, não corpo.
              <code class="font-mono">0</code> desliga.
            </p>
          </div>
        </div>
      </section>

      <!-- zona 2 — as contagens -->
      <section class="mt-6 rounded border border-gray-200 p-4">
        <h2 class="text-sm font-semibold">O que ela marca</h2>

        <div class="mt-3 flex flex-wrap gap-10">
          <div v-for="hit in hits" :key="hit.timeframe">
            <p class="font-mono text-xs text-gray-500">{{ hit.timeframe }}</p>
            <p class="text-2xl font-semibold tabular-nums">{{ count(hit.occurrences) }}</p>
            <p class="text-xs text-gray-500 tabular-nums">
              ocorrências · {{ count(hit.pairs) }} pares
            </p>
            <p class="text-xs text-gray-500 tabular-nums">
              de {{ count(hit.eligible) }} elegíveis ·
              {{ hit.eligible ? ((hit.pairs / hit.eligible) * 100).toFixed(1) : '0,0' }}%
            </p>
          </div>
        </div>

        <div v-if="spread.length" class="mt-5 border-t border-gray-200 pt-4">
          <h3 class="text-xs font-semibold text-gray-500">
            Comprimento das ocorrências em {{ timeframe }}
          </h3>
          <!-- The direct reading of how much of the list is congestion: a run of six alternating
               bodies is not a reversal seen five times, it is a sideways stretch. -->
          <p class="mt-0.5 text-xs text-gray-500">
            Uma ocorrência com mais de 2 barras é uma corrida alternada — reversões encadeadas,
            agrupadas num item só.
          </p>
          <table class="mt-2 text-xs tabular-nums">
            <tbody>
              <tr v-for="row in spread" :key="row.bars" class="border-t border-gray-100">
                <td class="py-1 pr-4 text-gray-500">{{ row.bars }} barras</td>
                <td class="py-1 pr-4 text-right">{{ count(row.howMany) }}</td>
                <td class="py-1 text-gray-400">
                  {{ ((row.howMany / found.length) * 100).toFixed(1) }}%
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- zona 3 — a lista -->
      <section class="mt-6 rounded border border-gray-200 p-4">
        <div class="flex flex-wrap items-baseline justify-between gap-3">
          <h2 class="text-sm font-semibold">Tudo o que ela marcou</h2>
          <div class="flex flex-wrap items-center gap-4 text-xs">
            <label>
              <span class="mr-2 text-gray-500">Timeframe</span>
              <select
                class="rounded border border-gray-300 px-2 py-1 text-xs"
                :value="timeframe"
                @change="update({ tf: ($event.target as HTMLSelectElement).value })"
              >
                <option v-for="option in BENCH_TIMEFRAMES" :key="option" :value="option">{{ option }}</option>
              </select>
            </label>
            <label>
              <span class="mr-2 text-gray-500">Ordem</span>
              <select
                class="rounded border border-gray-300 px-2 py-1 text-xs"
                :value="newestFirst ? 'recentes' : 'antigas'"
                @change="update({ ordem: ($event.target as HTMLSelectElement).value === 'antigas' ? 'antigas' : undefined })"
              >
                <option value="recentes">mais recentes</option>
                <option value="antigas">mais antigas</option>
              </select>
            </label>
          </div>
        </div>

        <p v-if="!found.length" class="mt-4 text-sm text-gray-500">
          Nenhuma ocorrência em {{ timeframe }} com <code class="font-mono">k = {{ k }}</code>,
          <code class="font-mono">s = {{ similarity }}</code> e
          <code class="font-mono">m = {{ expansion }}</code>.
        </p>

        <template v-else>
          <p class="mt-1 text-xs text-gray-500">
            {{ count(found.length) }} ocorrências · página {{ page }} de {{ count(pages) }}.
            Dentro de cada item as alturas são proporcionais à amplitude das barras, numa escala
            só daquele item — nunca entre itens. Clique para ver no gráfico.
          </p>

          <!-- Local wall time is not shared with the server, so the labels render only on the
               client — the same guard `/rules` and `/monitor` put around theirs. -->
          <ClientOnly>
            <ul class="mt-4 grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-3">
              <li v-for="one in shown" :key="one.time">
                <NuxtLink
                  :to="inContext(one)"
                  class="flex h-full flex-col rounded border border-gray-100 p-2 hover:border-gray-300 hover:bg-gray-50"
                  :title="`de ${when(one.since)} a ${when(one.time)}`"
                >
                  <!-- `gap-3` is deliberate and not decoration: adjacent bars read as a chart
                       fragment with a shared price axis, and there is none — only the heights are
                       comparable, never the vertical positions. The gutter keeps them cards. -->
                  <span
                    class="flex items-center justify-center gap-3"
                    :style="{ height: `${ROW_HEIGHT}px` }"
                  >
                    <ShapeCandle
                      v-for="bar in one.bars"
                      :key="bar.shape.time"
                      :shape="bar.shape"
                      :width="26"
                      :height="bar.height"
                    />
                  </span>
                  <span class="mt-1.5 flex items-baseline justify-between gap-2">
                    <span class="font-mono text-[10px] text-gray-400">{{ label(one) }}</span>
                    <span v-if="one.shapes.length > 2" class="shrink-0 text-[10px] text-amber-700">
                      corrida de {{ one.shapes.length }}
                    </span>
                  </span>
                </NuxtLink>
              </li>
            </ul>

            <div v-if="pages > 1" class="mt-5 flex items-center justify-center gap-3 text-sm">
              <button
                type="button"
                class="rounded border border-gray-300 px-3 py-1 disabled:opacity-40"
                :disabled="page === 1"
                @click="page--"
              >
                anterior
              </button>
              <span class="tabular-nums text-gray-500">{{ page }} / {{ count(pages) }}</span>
              <button
                type="button"
                class="rounded border border-gray-300 px-3 py-1 disabled:opacity-40"
                :disabled="page === pages"
                @click="page++"
              >
                próxima
              </button>
            </div>

            <template #fallback>
              <div class="mt-4 h-24" />
            </template>
          </ClientOnly>
        </template>
      </section>
    </template>
  </main>
</template>
