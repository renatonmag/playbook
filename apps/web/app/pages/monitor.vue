<script setup lang="ts">
import { isTimeframe, TIMEFRAMES, type Timeframe } from '~/types/candle'

/**
 * Until instruments are a table, the picker offers what the database is known to hold.
 * Today that is the mini index future only, and only on `5m` and `1h` — the other two
 * timeframes render the empty state, which is the honest answer.
 */
const SYMBOLS = ['WIN@N'] as const

const DEFAULT_SYMBOL = 'WIN@N'
const DEFAULT_TIMEFRAME: Timeframe = '5m'

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

function select(patch: { symbol?: string, timeframe?: string }) {
  router.replace({
    query: { symbol: symbol.value, timeframe: timeframe.value, ...patch },
  })
}

const { data: candles, pending, error, refresh } = useCandles(symbol, timeframe)
</script>

<template>
  <main class="mx-auto max-w-5xl p-8">
    <header class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold">Monitor</h1>
        <p class="mt-1 text-sm text-gray-500">
          {{ symbol }} · {{ timeframe }}
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
      </div>
    </header>

    <!-- `overflow-hidden` clips the chart's square canvas to the rounded corners; without it the
         white canvas pokes out past the radius at each corner. -->
    <section class="mt-6 overflow-hidden rounded border border-gray-200">
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
        <CandleChart :candles="candles" />
        <template #fallback>
          <div class="h-[520px] w-full" />
        </template>
      </ClientOnly>
    </section>
  </main>
</template>
