<script setup lang="ts">
import type { Component } from 'vue'
import { isTimeframe, TIMEFRAMES, type Timeframe } from '~/types/candle'
import { producerName, type ZigZagPivot } from '~/types/pattern'
import ZigZagOverlay from '~/components/ZigZagOverlay.vue'

/**
 * Until instruments are a table, the picker offers what the database is known to hold.
 * Today that is the mini index future only, and only on `5m` and `1h` — the other two
 * timeframes render the empty state, which is the honest answer.
 */
const SYMBOLS = ['WIN@N'] as const

const DEFAULT_SYMBOL = 'WIN@N'
const DEFAULT_TIMEFRAME: Timeframe = '5m'

/**
 * Which component draws which Pattern, keyed by the producer's class part — `zig-zag`, without
 * its parameters, so two zigzags at different depths share one renderer.
 *
 * This registry is the bet that Patterns differ in *how* they are drawn, not only in their data.
 * If every overlay ends up being "a line plus markers", it should collapse into one data-driven
 * component and this map should go.
 */
const OVERLAYS: Record<string, Component> = {
  'zig-zag': ZigZagOverlay,
}

/** Enough hues to tell overlapping Series apart; reused cyclically beyond that. */
const COLORS = ['#2563eb', '#c026d3', '#ea580c', '#0d9488']

const route = useRoute()
const router = useRouter()

// The URL is the source of truth, so a monitor view is shareable and survives a reload.
const symbol = computed(() => {
  const value = route.query.symbol
  return typeof value === 'string' && value.length > 0 ? value.toUpperCase() : DEFAULT_SYMBOL
})

const timeframe = computed<Timeframe>(() => {
  const value = route.query.timeframe
  return isTimeframe(value) ? value : DEFAULT_TIMEFRAME
})

/**
 * Where the window ends, or `null` for the live edge.
 *
 * Absence is what means "now", so a link without `to` always shows the present while a link with
 * it shows exactly what the person who copied it saw. An unparseable value falls back to live
 * rather than erroring, the same silent fallback `symbol` and `timeframe` make.
 */
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
  // `new Date` reads an offsetless string as local time — what was typed — and `Z` is mandatory,
  // since the routes answer 400 for a naive datetime.
  select({ to: new Date(value).toISOString() })
}

// One window, both requests. See `useWindow` for why that matters.
const window = useWindow(timeframe, at)

const { data: candles, pending, error, refresh } = useCandles(symbol, timeframe, window, windowKey)
const { data: patterns, error: patternsError } = usePatterns(window, windowKey)

/**
 * Every Series the pipeline produced, in a shape the checkbox list and the overlays share.
 *
 * Series of *any* timeframe are listed, including ones the chart is not showing. Marking one of
 * those is allowed and will distort the candle spacing, because the chart's time scale is the
 * union of its series' times — a known and accepted trade.
 */
const overlays = computed(() =>
  Object.entries(patterns.value?.series ?? {}).map(([producer, series], index) => ({
    producer,
    component: OVERLAYS[producerName(producer)],
    points: series.points as ZigZagPivot[],
    timeframe: series.identity.timeframe,
    color: COLORS[index % COLORS.length]!,
  })),
)

/**
 * Unchecked producers. Held as the exception rather than the rule so a Series arriving for the
 * first time is visible by default, with no bookkeeping when the pipeline gains a Pattern.
 *
 * Local, not in the URL: the producer key carries the timeframe, so it changes as you switch
 * timeframes and would not survive in a link anyway.
 */
const hidden = ref(new Set<string>())

function toggle(producer: string) {
  if (hidden.value.has(producer)) hidden.value.delete(producer)
  else hidden.value.add(producer)
}
</script>

<template>
  <main class="mx-auto max-w-7xl p-8">
    <header class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold">Monitor</h1>
        <!-- Says which of the two the view is, so a shared link that is frozen in the past does
             not read as a live chart that stopped updating. -->
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
      <!-- `overflow-hidden` clips the chart's square canvas to the rounded corners; without it the
           white canvas pokes out past the radius at each corner. -->
      <section class="min-w-0 flex-1 overflow-hidden rounded border border-gray-200">
        <p v-if="pending" class="p-8 text-center text-sm text-gray-500">
          Carregando candles…
        </p>

        <div v-else-if="error" class="p-8 text-center text-sm">
          <p class="text-red-600">Não foi possível carregar os candles.</p>
          <p class="mt-1 font-mono text-xs text-gray-500">{{ error.message }}</p>
          <button class="mt-3 rounded border border-gray-300 px-3 py-1 text-sm" @click="refresh()">
            Tentar de novo
          </button>
        </div>

        <p v-else-if="!candles?.length" class="p-8 text-center text-sm text-gray-500">
          Nenhum candle para {{ symbol }} · {{ timeframe }} nesta janela.
        </p>

        <ClientOnly v-else>
          <CandleChart :candles="candles">
            <component
              :is="overlay.component"
              v-for="overlay in overlays"
              :key="overlay.producer"
              :points="overlay.points"
              :color="overlay.color"
              :visible="!hidden.has(overlay.producer)"
            />
          </CandleChart>
          <template #fallback>
            <div class="h-[520px] w-full" />
          </template>
        </ClientOnly>
      </section>

      <aside class="w-full shrink-0 rounded border border-gray-200 p-4 lg:w-80">
        <h2 class="text-sm font-semibold">Padrões</h2>

        <p v-if="patternsError" class="mt-3 text-xs text-red-600">
          Não foi possível rodar o pipeline.
          <span class="block font-mono text-gray-500">{{ patternsError.message }}</span>
        </p>

        <p v-else-if="!overlays.length" class="mt-3 text-xs text-gray-500">
          Nenhum padrão produzido nesta janela.
        </p>

        <ul v-else class="mt-3 space-y-2">
          <li v-for="overlay in overlays" :key="overlay.producer">
            <label class="flex items-start gap-2 text-xs">
              <input
                type="checkbox"
                class="mt-0.5"
                :checked="!hidden.has(overlay.producer)"
                @change="toggle(overlay.producer)"
              >
              <span class="min-w-0">
                <span class="font-mono break-all" :style="{ color: overlay.color }">
                  {{ overlay.producer }}
                </span>
                <span class="block text-gray-500">
                  {{ overlay.points.length }} pontos
                  <span v-if="overlay.timeframe !== timeframe" class="text-amber-600">
                    · {{ overlay.timeframe }}, fora do timeframe exibido
                  </span>
                  <span v-if="!overlay.component" class="text-red-600">
                    · sem componente de desenho
                  </span>
                </span>
              </span>
            </label>
          </li>
        </ul>

        <!-- A Pattern that raised drew nothing, and so did a Pattern that found nothing. Without
             this the two are indistinguishable on the chart. -->
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
