import type { MaybeRefOrGetter } from 'vue'
import type { Timeframe } from '~/types/candle'
import type { Shape } from '~/types/shape'

/**
 * The whole history, not a window.
 *
 * `useWindow` exists because the chart and the pipeline must be asked about the *same* bars;
 * the bench has the opposite need — a rule's count means nothing over a sliding five days, and
 * a rule judged on a different window each reload is a rule nobody can compare. So the window
 * is fixed and absurdly wide, and `/shapes` answers with everything the table holds.
 *
 * The far end is a year ahead rather than `now` so the boundary never moves: a window built
 * from the clock would differ between the server render and the client, and Nuxt would store
 * the payload under one key and read it back under another.
 */
const ALL_HISTORY = { from: '2000-01-01T00:00:00Z', to: '2100-01-01T00:00:00Z' }

/**
 * Every measured Shape for one Instrument at one Timeframe.
 *
 * Fetched once per timeframe and then held in memory: the bench filters these arrays on every
 * keystroke, so a round trip per edit would make the counts lag behind the typing. `WIN@N` is
 * about 32k rows across both timeframes — a couple of megabytes, and nothing after the first
 * load.
 */
export function useShapes(
  symbol: MaybeRefOrGetter<string>,
  timeframe: MaybeRefOrGetter<Timeframe>,
) {
  const { public: { apiBase } } = useRuntimeConfig()

  const query = computed(() => ({
    symbol: toValue(symbol),
    timeframe: toValue(timeframe),
    ...ALL_HISTORY,
  }))

  return useFetch<Shape[]>('/shapes', {
    baseURL: apiBase,
    query,
    key: computed(() => `shapes:${query.value.symbol}:${query.value.timeframe}`),
    default: () => [],
  })
}
