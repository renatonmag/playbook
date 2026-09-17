import { parseProximity, type ProximityLevel, type ProximityRule } from '~/utils/proximity'

/**
 * The proximity ladder `/monitor` asks the pipeline to run, remembered between visits.
 *
 * `useStoredRule`'s twin, and every argument it makes applies here unchanged: `localStorage`
 * rather than the URL, because this is a thing you are in the middle of tuning and not a thing you
 * send someone, and what you do want is for it to still be there tomorrow.
 *
 * One difference worth stating, because it is the reason the two are separate composables rather
 * than one over a bigger object: there is no `PIPELINE_RULE` to start from. A pipeline built
 * without a browser runs no ladder at all, and an empty one is not a placeholder — it is the
 * setting that says "do not report near misses", which is also what every run before this existed
 * was making. So the seed is `[]`, the server render and the first client frame agree on it, and
 * there is nothing to reset *to* that is not also what clearing the rows does.
 */

/** Namespaced, because `localStorage` is one flat space shared by every page on the origin. */
const KEY = 'playbook:monitor:proximity'

export function useStoredProximity() {
  /**
   * Starts empty, on the server and on the first client frame alike — see the module docstring for
   * why the empty ladder is a real setting rather than a stand-in for one.
   *
   * `localStorage` does not exist during the server render, so the stored ladder is adopted in
   * `onMounted` and the controls live inside a `<ClientOnly>` for the same reason the rule's do.
   */
  const levels = ref<ProximityRule>([])

  onMounted(() => {
    const stored = localStorage.getItem(KEY)
    if (stored === null) return

    try {
      levels.value = parseProximity(JSON.parse(stored))
    }
    catch {
      // Unparseable JSON is not worth surfacing: the user did not write it and cannot fix it, and
      // no ladder is a correct answer. Dropping it is what un-wedges the page.
      localStorage.removeItem(KEY)
    }
  })

  // Deep, because a caller edits one field of one row and the array identity does not move.
  if (import.meta.client) {
    watch(levels, value => localStorage.setItem(KEY, JSON.stringify(value)), { deep: true })
  }

  /** One more rung, at the bottom of the list where the button that added it is. */
  function add(level: ProximityLevel) {
    levels.value = [...levels.value, level]
  }

  /** Patch one field of one rung. The shape `useStoredRule.update` edits a rule in. */
  function update(index: number, patch: Partial<ProximityLevel>) {
    levels.value = levels.value.map((level, at) => (at === index ? { ...level, ...patch } : level))
  }

  function remove(index: number) {
    levels.value = levels.value.filter((_, at) => at !== index)
  }

  /**
   * Back to no ladder, which is back to what the pipeline runs unattended.
   *
   * `useStoredRule.reset`'s counterpart and worth an affordance for the same reason: the producer
   * key does not move when the ladder changes, so nothing in the response distinguishes a run with
   * one from a run without, and "get me back to the baseline" has to be a button.
   */
  function clear() {
    levels.value = []
  }

  return { levels, add, update, remove, clear }
}
