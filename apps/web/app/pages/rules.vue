<script setup lang="ts">
import type { Timeframe } from '~/types/candle'
import { DIRECTIONS, type Form, type Shape } from '~/types/shape'
import { COLOUR_MODES, fromQuery, marked, marks, overlap, parseRule, sameRule, toQuery, type Rule } from '~/utils/rule'

/**
 * The bench for hunting Forma rules — issue #11.
 *
 * It exists because measuring a candidate rule used to cost a round trip through a
 * conversation. Here the rule is edited on screen and the counts move as you type, because the
 * Shapes are fetched once and every rule is evaluated in the client. Nothing about a rule is
 * ever sent to the server: `/shapes` measures, this page judges.
 */

const SYMBOL = 'WIN@N'

/**
 * Only the two the database actually holds. `15m` and `1d` have no rows, and offering them
 * would answer every rule with a confident zero.
 */
const BENCH_TIMEFRAMES: Timeframe[] = ['5m', '1h']

/** How many marked Candles the sample draws. Enough to spot a wrong-looking bar, few enough to scan. */
const SAMPLE_SIZE = 48

const route = useRoute()
const router = useRouter()

// The URL is the source of truth for the rule being edited, so a bench state is a link.
const rule = computed<Rule>(() => fromQuery(route.query as Record<string, unknown>))

function update(patch: Partial<Rule>) {
  router.replace({ query: toQuery({ ...rule.value, ...patch }) })
}

/** `null` clears the proportional frontier; the field is left empty to mean "unused". */
function setRatio(value: string) {
  update({ wcMaxRatio: value === '' ? null : Number(value) })
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

/** What the rule being edited marks, per timeframe. Recomputed on every keystroke, in memory. */
const hits = computed(() =>
  BENCH_TIMEFRAMES.map(timeframe => ({
    timeframe,
    total: shapes.value[timeframe].length,
    marked: marked(rule.value, shapes.value[timeframe]),
  })),
)

const { data: saved } = useFetch<{ rules: unknown[] }>('/api/rules', { default: () => ({ rules: [] }) })

/**
 * The rules committed to `docs/forma/rules.json`, normalised.
 *
 * Typed `unknown[]` on the way in and put through `parseRule` here, deliberately: that file is
 * edited by hand, and trusting its shape is how a missing field becomes `undefined` inside a
 * comparison and a wrong number on screen with nothing to show for it. Everything downstream —
 * the loader list and the comparison table — reads this, so both see the same rule.
 */
const savedRules = computed(() => (saved.value?.rules ?? []).map(parseRule))

/** How the edited rule divides each timeframe against every rule already committed to the repo. */
const comparisons = computed(() =>
  savedRules.value.map(({ rule: other }) => ({
    name: other.name,
    per: BENCH_TIMEFRAMES.map(timeframe => ({
      timeframe,
      ...overlap(rule.value, other, shapes.value[timeframe]),
    })),
  })),
)

/** Puts a saved rule in the editor. Through the URL, so the browser's Back button undoes it. */
function load(saved: Rule) {
  router.replace({ query: toQuery(saved) })
}

/** The saved rule the editor is currently showing, unchanged. */
function isLoaded(saved: Rule) {
  return saved.name === rule.value.name && sameRule(saved, rule.value)
}

/**
 * The saved rule the edited one appears to have come from — matched by name alone.
 *
 * Name alone, because the whole point is to catch the case where the fields have *drifted* and
 * the name has not. That is the state in which "copiar JSON" quietly overwrites the record of a
 * rule with a variant of it.
 */
const loadedFrom = computed(() => savedRules.value.find(({ rule: other }) => other.name === rule.value.name)?.rule)

const drifted = computed(() => loadedFrom.value !== undefined && !sameRule(loadedFrom.value, rule.value))

/**
 * Which timeframe the sample is drawn from. Its own control rather than following the counts,
 * because the two histories are very different lengths — `1h` reaches back to 2021, `5m` only
 * to late 2025 — and a rule can look right on one and wrong on the other.
 */
const sampleFrom = ref<Timeframe>('1h')

/**
 * An evenly spaced sample of the marked Candles, not the first `n`.
 *
 * The rows come back oldest first, so taking the head would show a rule's behaviour in 2021 and
 * call it the rule's behaviour. Spacing spreads the sample across the whole history.
 */
const sample = computed(() => {
  const all = marked(rule.value, shapes.value[sampleFrom.value])
  if (all.length <= SAMPLE_SIZE) return all
  const stride = all.length / SAMPLE_SIZE
  return Array.from({ length: SAMPLE_SIZE }, (_, i) => all[Math.floor(i * stride)]!)
})

/** The pinned-window link `/monitor` already understands — the bar, back in its chart. */
function inContext(shape: Shape) {
  return {
    path: '/monitor',
    query: { symbol: SYMBOL, timeframe: sampleFrom.value, to: new Date(shape.time * 1000).toISOString() },
  }
}

/** Full date and time, for the tooltip. */
function when(shape: Shape) {
  return new Date(shape.time * 1000).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

/**
 * Just the day, for the label under a bar. Formatted rather than sliced off `when`: the `1h`
 * history spans five years, and a truncation that drops the year makes 2021 and 2026 identical.
 */
function day(shape: Shape) {
  return new Date(shape.time * 1000).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  })
}

/* --- the synthetic bar ------------------------------------------------------------------ */

/**
 * A bar the market never produced, to feel where the rule's frontier sits before looking at
 * data. It is the one piece of the synthetic generator that survived: #11 decided against a
 * synthetic *dataset*, but a synthetic bar is still the fastest way to see what a threshold does.
 */
const probeWf = ref(0.6)
const probeWc = ref(0.05)
const probeBear = ref(true)

const probeBody = computed(() => 1 - probeWf.value - probeWc.value)
const probeValid = computed(() => probeBody.value >= 0)

/**
 * Back from `(wf, wc)` to the direction-neutral measurement the rule reads.
 *
 * A `Form`, not a `Shape`: a bar the market never produced has no anchor and no size, and
 * inventing a `time` of 0 and an `amplitude` of 0 would describe a bar that never opened and
 * that `/shapes` would have omitted. `marks` reads neither.
 */
const probe = computed<Form>(() => {
  const [upper, lower] = rule.value.direction === 'baixa'
    ? [probeWf.value, probeWc.value]
    : [probeWc.value, probeWf.value]
  return { upper, lower, body: Math.max(0, probeBody.value), bear: probeBear.value }
})

const probeMarked = computed(() => probeValid.value && marks(rule.value, probe.value))

const asJson = computed(() => JSON.stringify(rule.value, null, 2))

const copied = ref(false)
async function copyRule() {
  await navigator.clipboard.writeText(asJson.value)
  copied.value = true
  setTimeout(() => (copied.value = false), 1500)
}

const field = 'w-24 rounded border border-gray-300 px-2 py-1 text-sm'
</script>

<template>
  <main class="mx-auto max-w-7xl p-8">
    <header class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold">Bancada de regras</h1>
        <p class="mt-1 text-sm text-gray-500">
          {{ SYMBOL }} · fator Forma ·
          <a class="underline" href="https://github.com/renatonmag/playbook/issues/11" target="_blank" rel="noreferrer">
            questão #11
          </a>
        </p>
      </div>
      <p class="max-w-md text-xs text-gray-500">
        A API mede as proporções; a regra é avaliada aqui no navegador. Nenhum parâmetro de regra
        chega ao servidor.
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
      <div class="mt-6 flex flex-col gap-6 lg:flex-row">
        <!-- zona 1 — o editor -->
        <section class="shrink-0 rounded border border-gray-200 p-4 lg:w-80">
          <template v-if="savedRules.length">
            <h2 class="text-sm font-semibold">Regras salvas</h2>
            <ul class="mt-2 space-y-1">
              <li v-for="entry in savedRules" :key="entry.rule.name">
                <button
                  type="button"
                  class="w-full rounded border px-2 py-1.5 text-left text-sm"
                  :class="isLoaded(entry.rule)
                    ? 'border-gray-800 bg-gray-50 font-medium'
                    : 'border-gray-200 hover:border-gray-400 hover:bg-gray-50'"
                  @click="load(entry.rule)"
                >
                  <span class="flex items-baseline justify-between gap-2">
                    <span class="min-w-0 truncate">{{ entry.rule.name }}</span>
                    <span v-if="isLoaded(entry.rule)" class="shrink-0 text-xs text-gray-500">carregada</span>
                  </span>
                  <!-- The file is hand-edited, so a field that fell back to a default is a typo
                       to surface, not a default to accept. -->
                  <span v-if="entry.missing.length" class="mt-0.5 block font-mono text-[10px] text-amber-700">
                    faltando: {{ entry.missing.join(', ') }}
                  </span>
                </button>
              </li>
            </ul>
            <hr class="my-4 border-gray-200">
          </template>

          <h2 class="text-sm font-semibold">A regra</h2>

          <div class="mt-3 space-y-3 text-sm">
            <label class="flex items-center justify-between gap-2">
              <span class="text-gray-500">Nome</span>
              <input
                class="w-44 rounded border border-gray-300 px-2 py-1 text-sm"
                :value="rule.name"
                @change="update({ name: ($event.target as HTMLInputElement).value })"
              >
            </label>

            <p v-if="drifted" class="rounded bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
              Difere de <b>{{ loadedFrom!.name }}</b>, que está salva com esse mesmo nome. Copiar e
              colar no arquivo sobrescreve o registro dela.
            </p>

            <label class="flex items-center justify-between gap-2">
              <span class="text-gray-500">Reversão</span>
              <select
                class="rounded border border-gray-300 px-2 py-1 text-sm"
                :value="rule.direction"
                @change="update({ direction: ($event.target as HTMLSelectElement).value as Rule['direction'] })"
              >
                <option v-for="option in DIRECTIONS" :key="option" :value="option">de {{ option }}</option>
              </select>
            </label>

            <label class="flex items-center gap-2">
              <input
                type="checkbox"
                :checked="rule.requireWfOverWc"
                @change="update({ requireWfOverWc: ($event.target as HTMLInputElement).checked })"
              >
              <span>exigir <code class="font-mono">wf &gt; wc</code></span>
            </label>

            <label class="flex items-center justify-between gap-2">
              <span class="text-gray-500"><code class="font-mono">wf ≥</code></span>
              <input
                type="number" step="0.01" min="0" max="1" :class="field" :value="rule.wfMin"
                @change="update({ wfMin: Number(($event.target as HTMLInputElement).value) })"
              >
            </label>

            <label class="flex items-center justify-between gap-2">
              <span class="text-gray-500"><code class="font-mono">wc ≤</code></span>
              <input
                type="number" step="0.01" min="0" max="1" :class="field" :value="rule.wcMax"
                @change="update({ wcMax: Number(($event.target as HTMLInputElement).value) })"
              >
            </label>

            <label class="flex items-center justify-between gap-2">
              <span class="text-gray-500"><code class="font-mono">wc ≤ k·wf</code></span>
              <input
                type="number" step="0.01" min="0" :class="field" placeholder="sem k"
                :value="rule.wcMaxRatio ?? ''"
                @change="setRatio(($event.target as HTMLInputElement).value)"
              >
            </label>

            <div class="flex items-center justify-between gap-2">
              <span class="text-gray-500"><code class="font-mono">b</code> entre</span>
              <span class="flex gap-1">
                <input
                  type="number" step="0.05" min="0" max="1" class="w-16 rounded border border-gray-300 px-2 py-1 text-sm"
                  :value="rule.bodyMin"
                  @change="update({ bodyMin: Number(($event.target as HTMLInputElement).value) })"
                >
                <input
                  type="number" step="0.05" min="0" max="1" class="w-16 rounded border border-gray-300 px-2 py-1 text-sm"
                  :value="rule.bodyMax"
                  @change="update({ bodyMax: Number(($event.target as HTMLInputElement).value) })"
                >
              </span>
            </div>

            <label class="flex items-center justify-between gap-2">
              <span class="text-gray-500">Cor</span>
              <select
                class="rounded border border-gray-300 px-2 py-1 text-sm"
                :value="rule.colour"
                @change="update({ colour: ($event.target as HTMLSelectElement).value as Rule['colour'] })"
              >
                <option v-for="option in COLOUR_MODES" :key="option" :value="option">{{ option }}</option>
              </select>
            </label>

            <label v-if="rule.colour === 'acima-de'" class="flex items-center justify-between gap-2">
              <span class="text-gray-500">cor se <code class="font-mono">b &gt;</code></span>
              <input
                type="number" step="0.05" min="0" max="1" :class="field" :value="rule.colourBodyMin"
                @change="update({ colourBodyMin: Number(($event.target as HTMLInputElement).value) })"
              >
            </label>
          </div>

          <button
            class="mt-4 w-full rounded border px-3 py-1.5 text-sm hover:bg-gray-50"
            :class="drifted ? 'border-amber-400 text-amber-800' : 'border-gray-300'"
            @click="copyRule()"
          >
            {{ copied ? 'copiado' : drifted ? `copiar JSON — sobrescreve ${loadedFrom!.name}` : 'copiar JSON' }}
          </button>
          <p class="mt-2 text-xs text-gray-500">
            Cole em <code class="font-mono">docs/forma/rules.json</code> para guardar no git.
          </p>
        </section>

        <div class="min-w-0 flex-1 space-y-6">
          <!-- zona 2 — as contagens -->
          <section class="rounded border border-gray-200 p-4">
            <h2 class="text-sm font-semibold">O que ela marca</h2>

            <div class="mt-3 flex flex-wrap gap-6">
              <div v-for="hit in hits" :key="hit.timeframe">
                <p class="font-mono text-xs text-gray-500">{{ hit.timeframe }}</p>
                <p class="text-2xl font-semibold tabular-nums">{{ hit.marked.length.toLocaleString('pt-BR') }}</p>
                <p class="text-xs text-gray-500 tabular-nums">
                  de {{ hit.total.toLocaleString('pt-BR') }} ·
                  {{ hit.total ? ((hit.marked.length / hit.total) * 100).toFixed(1) : '0,0' }}%
                </p>
              </div>
            </div>

            <div v-if="comparisons.length" class="mt-5 overflow-x-auto border-t border-gray-200 pt-4">
              <h3 class="text-xs font-semibold text-gray-500">Contra as regras salvas</h3>
              <table class="mt-2 w-full min-w-[30rem] text-xs tabular-nums">
                <thead class="text-gray-500">
                  <tr class="text-left">
                    <th class="py-1 pr-4 font-medium">Regra</th>
                    <th class="py-1 pr-4 font-medium">TF</th>
                    <th class="py-1 pr-4 text-right font-medium">as duas</th>
                    <th class="py-1 pr-4 text-right font-medium">só esta</th>
                    <th class="py-1 text-right font-medium">só a outra</th>
                  </tr>
                </thead>
                <tbody>
                  <template v-for="comparison in comparisons" :key="comparison.name">
                    <tr v-for="(row, index) in comparison.per" :key="row.timeframe" class="border-t border-gray-100">
                      <td class="py-1 pr-4">{{ index === 0 ? comparison.name : '' }}</td>
                      <td class="py-1 pr-4 font-mono text-gray-500">{{ row.timeframe }}</td>
                      <td class="py-1 pr-4 text-right">{{ row.both.toLocaleString('pt-BR') }}</td>
                      <td class="py-1 pr-4 text-right">{{ row.onlyA.toLocaleString('pt-BR') }}</td>
                      <td class="py-1 text-right">{{ row.onlyB.toLocaleString('pt-BR') }}</td>
                    </tr>
                  </template>
                </tbody>
              </table>
            </div>
          </section>

          <!-- zona 3 — a barra sintética -->
          <section class="rounded border border-gray-200 p-4">
            <h2 class="text-sm font-semibold">Barra sintética</h2>
            <p class="mt-1 text-xs text-gray-500">
              Uma barra que o mercado não produziu, para sentir onde a fronteira está.
            </p>

            <div class="mt-3 flex flex-wrap items-center gap-8">
              <div class="flex h-28 w-16 items-center justify-center rounded bg-gray-50">
                <ShapeCandle v-if="probeValid" :shape="probe" :muted="!probeMarked" :height="96" />
                <span v-else class="px-1 text-center text-[10px] text-gray-400">wf + wc &gt; 1</span>
              </div>

              <div class="min-w-56 flex-1 space-y-2">
                <label class="block">
                  <span class="flex justify-between font-mono text-xs">
                    <span class="text-gray-500">wf</span><span>{{ probeWf.toFixed(3) }}</span>
                  </span>
                  <input v-model.number="probeWf" type="range" min="0" max="1" step="0.001" class="w-full">
                </label>
                <label class="block">
                  <span class="flex justify-between font-mono text-xs">
                    <span class="text-gray-500">wc</span><span>{{ probeWc.toFixed(3) }}</span>
                  </span>
                  <input v-model.number="probeWc" type="range" min="0" max="1" step="0.001" class="w-full">
                </label>
                <label class="flex items-center gap-2 text-xs">
                  <input v-model="probeBear" type="checkbox">
                  <span>corpo de baixa</span>
                </label>
              </div>

              <div>
                <p class="font-mono text-xs text-gray-500">b = 1 − wf − wc</p>
                <p class="font-mono text-sm tabular-nums">{{ probeValid ? probeBody.toFixed(3) : '—' }}</p>
                <p
                  class="mt-2 text-lg font-semibold"
                  :class="probeMarked ? 'text-green-700' : 'text-gray-400'"
                >
                  {{ probeMarked ? 'marca' : 'não marca' }}
                </p>
              </div>
            </div>
          </section>

          <!-- zona 4 — a amostra real -->
          <section class="rounded border border-gray-200 p-4">
            <div class="flex flex-wrap items-baseline justify-between gap-3">
              <h2 class="text-sm font-semibold">Amostra do que ela marcou</h2>
              <label class="text-xs">
                <span class="mr-2 text-gray-500">Timeframe</span>
                <select v-model="sampleFrom" class="rounded border border-gray-300 px-2 py-1 text-xs">
                  <option v-for="option in BENCH_TIMEFRAMES" :key="option" :value="option">{{ option }}</option>
                </select>
              </label>
            </div>

            <p v-if="!sample.length" class="mt-4 text-sm text-gray-500">
              Nenhuma Candle marcada em {{ sampleFrom }}.
            </p>

            <template v-else>
              <p class="mt-1 text-xs text-gray-500">
                {{ sample.length }} barras espalhadas pelo histórico. Clique para ver no gráfico.
              </p>
              <!-- The labels are local wall time, which the server does not share; rendering them
                   only on the client keeps that difference from surfacing as a hydration
                   mismatch — the same guard `/monitor` puts around its timepicker. -->
              <ClientOnly>
                <ul class="mt-3 grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-2">
                  <li v-for="shape in sample" :key="shape.time">
                    <NuxtLink
                      :to="inContext(shape)"
                      class="flex flex-col items-center gap-1 rounded border border-gray-100 p-1.5 hover:border-gray-300 hover:bg-gray-50"
                      :title="when(shape)"
                    >
                      <ShapeCandle :shape="shape" :width="32" :height="72" />
                      <span class="font-mono text-[9px] text-gray-400">{{ day(shape) }}</span>
                    </NuxtLink>
                  </li>
                </ul>
                <template #fallback>
                  <div class="mt-3 h-24" />
                </template>
              </ClientOnly>
            </template>
          </section>
        </div>
      </div>
    </template>
  </main>
</template>
