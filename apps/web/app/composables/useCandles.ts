import type { MaybeRefOrGetter } from 'vue'
import type { Candle, Timeframe } from '~/types/candle'
import type { Window } from '~/composables/useWindow'

/**
 * Fetches the candle window for a symbol/timeframe pair and refetches when any of them changes.
 *
 * The window is a parameter rather than something computed here: `/candles` and `/patterns` must
 * be asked about the *same* bars, or the drawing and the calculation can disagree. One owner of
 * `from`/`to` is what makes that guarantee, so the page holds it.
 *
 * The payload is returned untouched: the API already emits Lightweight Charts' bar shape, and a
 * conversion here is exactly where a timezone bug would hide.
 */
export function useCandles(
  symbol: MaybeRefOrGetter<string>,
  timeframe: MaybeRefOrGetter<Timeframe>,
  window: MaybeRefOrGetter<Window>,
) {
  const { public: { apiBase } } = useRuntimeConfig()

  const query = computed(() => ({
    symbol: toValue(symbol),
    timeframe: toValue(timeframe),
    ...toValue(window),
  }))

  return useFetch<Candle[]>('/candles', {
    baseURL: apiBase,
    query,
    // Identifies the request, so it must not contain the window: `from` is derived from the
    // clock, and a key that changes on every read makes Nuxt store the state under one name and
    // read it back under another. The window still triggers refetches — `query` is watched.
    key: computed(() => `candles:${query.value.symbol}:${query.value.timeframe}`),
    default: () => [],
  })
}
