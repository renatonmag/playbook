<script setup lang="ts">
import type { Component } from 'vue'
import { isTimeframe, TIMEFRAMES, type Timeframe } from '~/types/candle'
import { producerName, type PatternPoint } from '~/types/pattern'
import AdvancingLegsVerify from '~/components/AdvancingLegsVerify.vue'
import LegReversalsVerify from '~/components/LegReversalsVerify.vue'
import LegWindowVerify from '~/components/LegWindowVerify.vue'
import NestedLegsVerify from '~/components/NestedLegsVerify.vue'

/** The monitor's picker, for the same reason: instruments are not a table yet. */
const SYMBOLS = ['WIN@N'] as const

const DEFAULT_SYMBOL = 'WIN@N'
const DEFAULT_TIMEFRAME: Timeframe = '5m'

/**
 * Which component *reads out* which Pattern, keyed by the producer's class part.
 *
 * The monitor has the mirror of this map, pointing at overlays. The split is deliberate: some
 * Patterns are a shape on a chart and some are a table of numbers, and `leg-window` is the first
 * of the second kind — a slice of bars with two indices into it, which is checked by reading.
 *
 * A Pattern may end up in both maps. Nothing here assumes it is in only one.
 *
 * `nested-legs` is the third of that second kind, and the clearest case for it: it draws nothing
 * on a chart at all, since what it produces is a *grouping* of two Series the monitor already
 * draws separately. Reading which simple leg landed in which zigzag leg is the only way to check
 * it.
 *
 * `advancing-legs` is the same case one step on: it is that grouping with the pushes that got
 * nowhere taken out, so every leg it keeps is already drawn by `simple-leg` and what it produces
 * is a *decision*. Which legs are here and which are not is read, never seen.
 */
const VERIFIERS: Record<string, Component> = {
  'leg-window': LegWindowVerify,
  'leg-reversals': LegReversalsVerify,
  'nested-legs': NestedLegsVerify,
  'advancing-legs': AdvancingLegsVerify,
}

const route = useRoute()
const router = useRouter()

// The URL is the source of truth, so a verify view is shareable and survives a reload.
const symbol = computed(() => {
  const value = route.query.symbol
  return typeof value === 'string' && value.length > 0 ? value.toUpperCase() : DEFAULT_SYMBOL
})

const timeframe = computed<Timeframe>(() => {
  const value = route.query.timeframe
  return isTimeframe(value) ? value : DEFAULT_TIMEFRAME
})

/** Where the window ends, or `null` for the live edge. Absence is what means "now". */
const at = computed<string | null>(() => {
  const value = route.query.to
  if (typeof value !== 'string') return null
  return Number.isNaN(new Date(value).getTime()) ? null : value
})

/** Names the window for Nuxt's cache. From the URL, not from the resolved `to` — see `useCandles`. */
const windowKey = computed(() => at.value ?? 'now')

function select(patch: { symbol?: string, timeframe?: string, to?: string }) {
  router.replace({
    // `undefined` drops the key from the URL, which is how the window goes back to live.
    query: { symbol: symbol.value, timeframe: timeframe.value, to: at.value ?? undefined, ...patch },
  })
}

/**
 * `datetime-local` speaks local wall time with no offset, the URL and the routes speak ISO with
 * one. `toISOString()` cannot format the input's value — it converts to UTC, and the field would
 * show an hour the user never picked.
 */
function toLocalInput(iso: string) {
  const date = new Date(iso)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function pin(value: string) {
  // Empty means the field was cleared: back to live.
  if (!value) return select({ to: undefined })
  select({ to: new Date(value).toISOString() })
}

// No `useCandles` here: this page draws no chart, so the candles would be fetched and dropped.
const window = useWindow(timeframe, at)
const { data: patterns, pending, error, refresh } = usePatterns(window, windowKey)

/** Every Series the pipeline produced, in the shape the list and the reader share. */
const series = computed(() =>
  Object.entries(patterns.value?.series ?? {}).map(([producer, entry]) => ({
    producer,
    component: VERIFIERS[producerName(producer)],
    // Left as the base Point, like the monitor does: the component a producer maps to is the
    // thing that knows which Point it is getting, and it narrows in its own props.
    points: entry.points as PatternPoint[],
    timeframe: entry.identity.timeframe,
  })),
)

/**
 * Which producer the left pane is reading out. Local, not in the URL: the producer key carries
 * the timeframe, so it changes as you switch timeframes and would not survive in a link.
 */
const selected = ref<string | null>(null)

/**
 * The Series on show: the selected one, or the first that has a verifier.
 *
 * The fallback is what makes the page useful on arrival and after the window moves — a stale
 * selection whose producer is no longer in the response resolves back to something readable
 * instead of leaving the pane blank.
 */
const current = computed(() =>
  series.value.find(entry => entry.producer === selected.value)
  ?? series.value.find(entry => entry.component),
)
</script>

<template>
  <main class="mx-auto max-w-7xl p-8">
    <header class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold">Verificação</h1>
        <p class="mt-1 text-sm text-gray-500">
          {{ symbol }} · {{ timeframe }} ·
          <span v-if="at" class="text-amber-600">janela fixada</span>
          <span v-else>ao vivo</span>
        </p>
      </div>

      <div class="flex items-center gap-3">
        <label class="text-sm">
          <span class="mr-2 text-gray-500">Ativo</span>
          <select
            class="rounded border border-gray-300 px-2 py-1"
            :value="symbol"
            @change="select({ symbol: ($event.target as HTMLSelectElement).value })"
          >
            <option v-for="option in SYMBOLS" :key="option" :value="option">{{ option }}</option>
          </select>
        </label>

        <label class="text-sm">
          <span class="mr-2 text-gray-500">Timeframe</span>
          <select
            class="rounded border border-gray-300 px-2 py-1"
            :value="timeframe"
            @change="select({ timeframe: ($event.target as HTMLSelectElement).value })"
          >
            <option v-for="option in TIMEFRAMES" :key="option" :value="option">{{ option }}</option>
          </select>
        </label>

        <!-- The field reads local wall time, which the server may not share; rendering it only on
             the client keeps that difference from surfacing as a hydration mismatch. -->
        <ClientOnly>
          <label class="text-sm">
            <span class="mr-2 text-gray-500">Até</span>
            <input
              type="datetime-local"
              class="rounded border border-gray-300 px-2 py-1"
              :value="at ? toLocalInput(at) : ''"
              @change="pin(($event.target as HTMLInputElement).value)"
            >
          </label>
          <template #fallback>
            <div class="h-[34px] w-56" />
          </template>
        </ClientOnly>

        <button
          v-if="at"
          class="rounded border border-gray-300 px-3 py-1 text-sm"
          @click="select({ to: undefined })"
        >
          Agora
        </button>
      </div>
    </header>

    <div class="mt-6 flex flex-col gap-6 lg:flex-row">
      <section class="min-w-0 flex-1 rounded border border-gray-200">
        <p v-if="pending" class="p-8 text-center text-sm text-gray-500">
          Rodando o pipeline…
        </p>

        <div v-else-if="error" class="p-8 text-center text-sm">
          <p class="text-red-600">Não foi possível rodar o pipeline.</p>
          <p class="mt-1 font-mono text-xs text-gray-500">{{ error.message }}</p>
          <button class="mt-3 rounded border border-gray-300 px-3 py-1 text-sm" @click="refresh()">
            Tentar de novo
          </button>
        </div>

        <p v-else-if="!current" class="p-8 text-center text-sm text-gray-500">
          Nenhum padrão produzido nesta janela.
        </p>

        <p v-else-if="!current.component" class="p-8 text-center text-sm text-gray-500">
          <span class="font-mono break-all">{{ current.producer }}</span>
          <span class="mt-1 block">ainda não tem uma leitura em texto.</span>
        </p>

        <!-- Not client-only, unlike the date field above. The rows are formatted on the trading
             clock rather than the reader's — see `barMoment` — so the server and the browser
             render the same string and the table arrives with the page. -->
        <component :is="current.component" v-else :points="current.points" />
      </section>

      <aside class="w-full shrink-0 rounded border border-gray-200 p-4 lg:w-80">
        <h2 class="text-sm font-semibold">Padrões</h2>

        <p v-if="error" class="mt-3 text-xs text-red-600">
          Não foi possível rodar o pipeline.
          <span class="block font-mono text-gray-500">{{ error.message }}</span>
        </p>

        <p v-else-if="!series.length" class="mt-3 text-xs text-gray-500">
          Nenhum padrão produzido nesta janela.
        </p>

        <ul v-else class="mt-3 space-y-2">
          <li v-for="entry in series" :key="entry.producer">
            <label class="flex items-start gap-2 text-xs">
              <!-- Single choice, unlike the monitor's checkboxes: the pane on the left reads out
                   one Pattern at a time. -->
              <input
                type="radio"
                name="producer"
                class="mt-0.5"
                :checked="current?.producer === entry.producer"
                @change="selected = entry.producer"
              >
              <span class="min-w-0">
                <span class="font-mono break-all">{{ entry.producer }}</span>
                <span class="block text-gray-500">
                  {{ entry.points.length }} pontos · {{ entry.timeframe }}
                  <span v-if="!entry.component" class="text-red-600">
                    · sem verificador
                  </span>
                </span>
              </span>
            </label>
          </li>
        </ul>

        <!-- A Pattern that raised produced nothing, and so did a Pattern that found nothing.
             Without this the two are indistinguishable in the list above. -->
        <div v-if="patterns?.failed?.length" class="mt-4 border-t border-gray-200 pt-3">
          <p class="text-xs font-semibold text-red-600">Falharam</p>
          <ul class="mt-1 space-y-1">
            <li v-for="producer in patterns.failed" :key="producer" class="font-mono text-xs break-all text-gray-500">
              {{ producer }}
            </li>
          </ul>
          <p class="mt-2 text-xs text-gray-500">A exceção está no log do servidor.</p>
        </div>
      </aside>
    </div>
  </main>
</template>
