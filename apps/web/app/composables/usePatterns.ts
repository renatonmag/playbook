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
export function usePatterns(
  window: MaybeRefOrGetter<Window>,
  windowKey: MaybeRefOrGetter<string>,
) {
  const { public: { apiBase } } = useRuntimeConfig()

  const query = computed(() => ({ ...toValue(window) }))

  return useFetch<PatternResponse>('/patterns', {
    baseURL: apiBase,
    query,
    // The pipeline is fixed, so the window is all that distinguishes one request from another.
    // `windowKey` names it from the URL rather than from the resolved `from`/`to`: those are
    // derived from the clock while the window is live and would differ between the server render
    // and the client, making Nuxt store the state under one name and read it back under another.
    key: computed(() => `patterns:${toValue(windowKey)}`),
    default: () => ({ series: {}, failed: [] }),
  })
}
