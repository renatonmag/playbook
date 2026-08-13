import type { MaybeRefOrGetter } from 'vue'
import type { PatternResponse } from '~/types/pattern'
import type { Window } from '~/composables/useWindow'

/**
 * Runs the declared pipeline over a window and returns every Series it produced.
 *
 * There is no `symbol` or `timeframe` here, and that is the route's contract rather than an
 * omission: the pipeline is declared in code on the server, and it names the instrument while
 * each Pattern declares the timeframes it reads. The caller chooses the window and nothing else.
 */
export function usePatterns(window: MaybeRefOrGetter<Window>) {
  const { public: { apiBase } } = useRuntimeConfig()

  const query = computed(() => ({ ...toValue(window) }))

  return useFetch<PatternResponse>('/patterns', {
    baseURL: apiBase,
    query,
    // Constant on purpose: the window comes from the clock, and a key that changes on every
    // read makes Nuxt store the state under one name and read it back under another. The
    // pipeline is fixed, so there is only ever one patterns request in flight.
    key: 'patterns',
    default: () => ({ series: {}, failed: [] }),
  })
}
