/**
 * The `/monitor` sidebar's layout — which Patterns are unfolded, which are drawn, what is pinned
 * and what has been moved under each — remembered between visits.
 *
 * In `localStorage` rather than in the URL, and unlike `symbol`/`timeframe`/`to` this is not a
 * choice: the keys here are producer keys, and a producer key carries its timeframe. Half of a
 * saved layout would name Series the link's own timeframe cannot produce, so a layout is not a
 * thing that can travel in a link at all. What you do want is for it to still be there tomorrow,
 * which is exactly the trade `useStoredRule` makes for the Forma rule.
 *
 * Writing is automatic and reading is a button, which is the one asymmetry worth explaining.
 * Restoring on mount would mean a reload silently redraws a chart nobody asked for — and it would
 * have to happen after the first `/patterns` response, since the Series decide which keys mean
 * anything, so it would land as the sidebar filling itself in a beat late. The button puts that
 * moment where somebody chose it. The cost is stated on the page: there is one snapshot, so the
 * first control you touch after a reload overwrites the last session's.
 */

/** Namespaced, because `localStorage` is one flat space shared by every page on the origin. */
const KEY = 'playbook:monitor:overlays'

/**
 * The parts of the sidebar that survive a reload, by the name each carries on the page.
 *
 * `moves` is the odd one only in what follows its `producer|`: a hand-adjusted trend line, as one
 * `moveKey` string. It belongs here rather than in memory for `pinned`'s reason — it is a decision
 * somebody made about a line, not an exception to a default — and it resolves the same way, against
 * the current Points and the current bars, so a move whose line is gone is simply never consulted.
 *
 * `focusMode` is the one that is not about what is drawn: it is what a click on the chart *means*
 * for that Series. It is here anyway, because it is a decision somebody made about a Series and it
 * is keyed like every other one — and because it only ever comes back on the `Restaurar` click, so
 * no reload arms the chart behind anybody's back.
 *
 * Every one of them is a `Set<string>` of producer keys — which is what makes one composable
 * enough for seven pieces of state, and what the filter axes (`hiddenDirections`, `hiddenSides`,
 * `hiddenStates`) deliberately are not: those are keyed `producer:value` and store the *exception*,
 * so a stale entry from an older window is a checkbox silently off rather than a Series simply not
 * found. They stay in memory.
 */
type Stored = 'shown' | 'open' | 'pinned' | 'moves' | 'autoHide' | 'confirmedOnly' | 'focusMode'

const NAMES: Stored[] = ['shown', 'open', 'pinned', 'moves', 'autoHide', 'confirmedOnly', 'focusMode']

/** Total, like `parseRule`: anything that is not an array of strings reads as an empty set. */
function readList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []
}

export function useStoredOverlays(sets: Record<Stored, Ref<Set<string>>>) {
  /**
   * Whether there is a snapshot to load, which is the only thing the button can say for itself.
   *
   * `false` on the server and on the first client frame — `localStorage` does not exist during the
   * render — so the button is wrapped in a `<ClientOnly>` on the page, the same guard the stored
   * rule's controls need and for the same reason.
   */
  const saved = ref(false)

  onMounted(() => {
    saved.value = localStorage.getItem(KEY) !== null
  })

  // Client-only, and without `immediate`: a page that has just opened holds seven empty sets, and
  // writing those would erase the snapshot the button exists to restore. The first real toggle is
  // the first write, which is the cost this composable's docblock names.
  if (import.meta.client) {
    watch(
      NAMES.map(name => sets[name]),
      () => {
        const snapshot = Object.fromEntries(NAMES.map(name => [name, [...sets[name].value]]))
        localStorage.setItem(KEY, JSON.stringify(snapshot))
        saved.value = true
      },
      { deep: true },
    )
  }

  /**
   * Put the saved layout back.
   *
   * Keys naming producers the current response does not hold are **kept, not dropped**: a Series
   * that comes back — a rule edit, a timeframe switched away from and back — finds its pins
   * waiting, and everything that reads these sets asks by key, so the rest is simply never
   * consulted. Dropping them would quietly make `Restaurar` destructive.
   */
  function load() {
    const stored = localStorage.getItem(KEY)
    if (stored === null) return

    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(stored)
    }
    catch {
      // Unparseable JSON is not worth surfacing: the user did not write it and cannot fix it, and
      // an untouched sidebar is a correct answer. Dropping it is what un-wedges the button.
      localStorage.removeItem(KEY)
      saved.value = false
      return
    }

    // A snapshot written before one of these names existed restores the others and leaves that set
    // empty — hand-editable storage in practice, and an older version of this page is the ordinary
    // case rather than the exotic one.
    for (const name of NAMES) sets[name].value = new Set(readList(parsed?.[name]))
  }

  return { saved, load }
}
