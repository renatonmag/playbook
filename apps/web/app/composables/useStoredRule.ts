import { parseRule, PIPELINE_RULE, type Rule } from '~/utils/rule'

/**
 * The Forma rule `/monitor` asks the pipeline to run, remembered between visits.
 *
 * In `localStorage` rather than in the URL, which is the other convention this page follows.
 * The two are a real choice, not a coin flip: `symbol`, `timeframe` and `to` are in the URL
 * because a monitor view is a thing you send someone, and those three are what makes it *that*
 * view. The rule is a thing you are in the middle of tuning — it changes on almost every
 * interaction, it would push nine more keys into every link, and a half-tuned rule is not
 * something anyone means to share. What you do want is for it to still be there tomorrow.
 *
 * The cost is that it is not shareable, and the bench on `/rules` is where a rule worth sharing
 * gets written down anyway — into `docs/forma/rules.json`, through git, with a name.
 */

/** Namespaced, because `localStorage` is one flat space shared by every page on the origin. */
const KEY = 'playbook:monitor:forma-rule'

export function useStoredRule() {
  /**
   * Starts at the pipeline's own rule, on the server and on the first client frame alike.
   *
   * `localStorage` does not exist during the server render, so the stored rule cannot be the
   * initial value without the two renders disagreeing. Adopting it in `onMounted` means the
   * first paint may show `PIPELINE_RULE` briefly and then the stored numbers — which is why the
   * controls are inside a `<ClientOnly>` on the page, and why the first `/patterns` request can
   * be superseded by a second. Both are the honest price of not having a hydration mismatch.
   */
  const rule = ref<Rule>({ ...PIPELINE_RULE })

  onMounted(() => {
    const stored = localStorage.getItem(KEY)
    if (stored === null) return

    try {
      // Through `parseRule`, which is total: anything missing or unusable falls back to a real
      // value rather than reaching a request as `undefined`. This is hand-editable storage in
      // practice — a devtools console is right there — and a rule that was written by an older
      // version of this page is the ordinary case, not the exotic one.
      rule.value = parseRule(JSON.parse(stored)).rule
    }
    catch {
      // Unparseable JSON is not worth surfacing: the user did not write it, cannot fix it, and
      // the pipeline's own rule is a correct answer. Dropping it is what un-wedges the page.
      localStorage.removeItem(KEY)
    }
  })

  // Deep, because `update` replaces the object but a future caller reaching into `rule.value`
  // should not silently fail to persist. Client-only for the same reason as the read.
  if (import.meta.client) {
    watch(rule, value => localStorage.setItem(KEY, JSON.stringify(value)), { deep: true })
  }

  /** Patch one or more fields. The shape `/rules` already edits rules in — see `rules.vue`. */
  function update(patch: Partial<Rule>) {
    rule.value = { ...rule.value, ...patch }
  }

  /**
   * Back to what the pipeline runs unattended.
   *
   * Worth an affordance of its own because the producer key does not move when the rule changes:
   * nothing in the response distinguishes an adjusted run from a default one, so "get me back to
   * the baseline" has to be a button and not an exercise in retyping seven numbers.
   */
  function reset() {
    rule.value = { ...PIPELINE_RULE }
  }

  return { rule, update, reset }
}
