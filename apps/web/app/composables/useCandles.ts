import type { MaybeRefOrGetter } from 'vue'
import type { Candle, Timeframe } from '~/types/candle'

/**
 * How far back each timeframe looks, in days.
 *
 * These are not cosmetic. The route caps a response at 1000 bars and answers 400 rather than
 * truncating, so a window has to stay under that ceiling. B3 trades ~7h a day, so a 5m session
 * is ~84 bars: five days leaves headroom, thirty would not.
 */
const LOOKBACK_DAYS: Record<Timeframe, number> = {
  '5m': 5,
  '15m': 15,
  '1h': 60,
  '1d': 3 * 365,
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Fetches the candle window for a symbol/timeframe pair and refetches when either changes.
 *
 * The payload is returned untouched: the API already emits Lightweight Charts' bar shape, and a
 * conversion here is exactly where a timezone bug would hide.
 */
export function useCandles(
  symbol: MaybeRefOrGetter<string>,
  timeframe: MaybeRefOrGetter<Timeframe>,
) {
  const { public: { apiBase } } = useRuntimeConfig()

  const query = computed(() => {
    const tf = toValue(timeframe)
    const to = new Date()
    const from = new Date(to.getTime() - LOOKBACK_DAYS[tf] * DAY_MS)

    return {
      symbol: toValue(symbol),
      timeframe: tf,
      // `toISOString()` ends in `Z`; the route rejects naive datetimes with a 400.
      from: from.toISOString(),
      to: to.toISOString(),
    }
  })

  return useFetch<Candle[]>('/candles', {
    baseURL: apiBase,
    query,
    key: computed(() => `candles:${query.value.symbol}:${query.value.timeframe}`),
    default: () => [],
  })
}
