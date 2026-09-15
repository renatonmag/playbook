import type { MaybeRefOrGetter } from 'vue'
import type { PatternResponse } from '~/types/pattern'
import type { Window } from '~/composables/useWindow'
import { ruleKey, toPatternQuery, type Rule } from '~/utils/rule'

/**
 * Runs the declared pipeline over a window and returns every Series it produced.
 *
 * There is no `symbol` or `timeframe` here, and that is the route's contract rather than an
 * omission: the pipeline is declared in code on the server, and it names the instrument while
 * each Pattern declares the timeframes it reads.
 *
 * The one thing a caller may compose is `rule` — the Forma rule `bars` applies. It is
 * optional, and omitting it is not the same as passing the pipeline's own numbers: with no rule
 * parameters at all the route runs the very tuple a tick worker would import. Everything else
 * about the pipeline — which Patterns, in what order, at what tuning — stays declared on the
 * server. See the module docstring on `/patterns` for why this single exception exists.
 */
export function usePatterns(
  window: MaybeRefOrGetter<Window>,
  windowKey: MaybeRefOrGetter<string>,
  rule?: MaybeRefOrGetter<Rule | null>,
) {
  const { public: { apiBase } } = useRuntimeConfig()

  const query = computed(() => {
    const chosen = toValue(rule) ?? null
    return { ...toValue(window), ...(chosen ? toPatternQuery(chosen) : {}) }
  })

  return useFetch<PatternResponse>('/patterns', {
    baseURL: apiBase,
    query,
    // What distinguishes one request from another. `windowKey` names the window from the URL
    // rather than from the resolved `from`/`to`: those are derived from the clock while the
    // window is live and would differ between the server render and the client, making Nuxt
    // store the state under one name and read it back under another.
    //
    // The rule has to be in here too, and for a sharper reason. `/patterns` answers under the
    // same producer key whatever rule ran — the override is always named `K` — so a window alone
    // no longer names a response. Keyed by window only, Nuxt would hand back the previous rule's
    // marks and the chart would sit still while the numbers changed.
    key: computed(() => {
      const chosen = toValue(rule) ?? null
      return `patterns:${toValue(windowKey)}:${chosen ? ruleKey(chosen) : 'declarada'}`
    }),
    default: () => ({ series: {}, failed: [] }),
  })
}
