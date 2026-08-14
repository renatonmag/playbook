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
  windowKey: MaybeRefOrGetter<string>,
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
    // `windowKey` names the window, and must not be the resolved `from`/`to`: those are derived
    // from the clock while the window is live, so a key built from them would differ between the
    // server render and the client, making Nuxt store the state under one name and read it back
    // under another. A key from the URL is the same on both sides, and still tells two pinned
    // windows apart — without it the second would be served the first's payload.
    key: computed(() => `candles:${query.value.symbol}:${query.value.timeframe}:${toValue(windowKey)}`),
    default: () => [],
  })
}
