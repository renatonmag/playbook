import { isTimeframe } from '~/types/candle'
import type { Indicator, IndicatorKind } from '~/utils/indicator'

/**
 * The indicators `/monitor` draws — which are on the chart, how each is set, and which are hidden —
 * remembered between visits.
 *
 * Stored like the Forma rule and deliberately not like the sidebar's layout. `useStoredOverlays`
 * only comes back on the `Restaurar` click, because restoring it means a reload silently redrawing
 * a chart nobody asked for, and because its keys are producer keys that a different timeframe
 * cannot even name. Neither objection applies here: an indicator is a setting, not a snapshot of a
 * session, its period means the same thing on every Instrument and Timeframe, and a moving average
 * somebody put on their chart is exactly the kind of thing that should still be there tomorrow.
 *
 * A list and not a record by kind. Two weighted averages of different periods is the ordinary
 * picture — see `Indicator` — so there is nothing to key by; an `id` is what identifies one, and
 * every function here takes that id rather than a position, because the chips are rendered from
 * this list and a position moves when something ahead of it is removed.
 */

/** Namespaced, because `localStorage` is one flat space shared by every page on the origin. */
const KEY = 'playbook:monitor:indicators'

/**
 * What a new indicator starts as: 30 of the chart's own bars, red, hairline.
 *
 * Red because the average is read *against* the candles rather than with them, and nothing else on
 * this chart is red except a falling bar's body. Every instance starts here — a second one added
 * for contrast is expected to be recoloured, and guessing a palette for it would be this file
 * deciding what somebody is comparing.
 */
const DEFAULTS = { period: 30, color: '#dc2626', width: 1, timeframe: null } as const

/** The kinds a stored entry may claim to be. Anything else was written by a version that is gone. */
const KINDS = new Set<string>(INDICATOR_KINDS.map(entry => entry.kind))

/**
 * One stored entry, or `null` if it cannot be drawn.
 *
 * Total in `parseRule`'s sense, with one difference worth stating: a missing *field* falls back to
 * its default, but a missing `id` or an unknown `kind` drops the whole entry. The difference is
 * whether the result is still the thing somebody saved — a red 30-bar average where a blue 9-bar
 * one was is a repair, while an indicator with no id has no chip, no dialog and no way off the
 * chart, and one of an unknown kind has nothing to draw it.
 *
 * Out-of-range numbers are not corrected here: the dialog's inputs state their own range,
 * `weightedAverage` answers an unusable period with an empty line, and `useLineOverlay` clamps the
 * weight. This only has to guarantee the shape.
 */
function parseIndicator(value: unknown): Indicator | null {
  if (typeof value !== 'object' || value === null) return null

  const stored = value as Partial<Indicator>
  if (typeof stored.id !== 'string' || typeof stored.kind !== 'string' || !KINDS.has(stored.kind)) return null

  return {
    id: stored.id,
    kind: stored.kind as IndicatorKind,
    period: typeof stored.period === 'number' && Number.isFinite(stored.period) ? stored.period : DEFAULTS.period,
    color: typeof stored.color === 'string' ? stored.color : DEFAULTS.color,
    width: typeof stored.width === 'number' && Number.isFinite(stored.width) ? stored.width : DEFAULTS.width,
    visible: typeof stored.visible === 'boolean' ? stored.visible : true,
    // Absent in everything written before indicators could aggregate, and `null` is the right
    // reading of that: those lines were averages of whatever the chart was showing.
    timeframe: isTimeframe(stored.timeframe) ? stored.timeframe : DEFAULTS.timeframe,
  }
}

export function useStoredIndicators() {
  /**
   * Starts empty, on the server and on the first client frame alike — `localStorage` does not exist
   * during the server render, so the stored list cannot be the initial value without the two
   * renders disagreeing. Adopted in `onMounted`, which is why the menu and the chips on the page
   * sit inside a `<ClientOnly>`, the same guard the stored rule's controls need.
   */
  const indicators = ref<Indicator[]>([])

  onMounted(() => {
    const stored = localStorage.getItem(KEY)
    if (stored === null) return

    try {
      // Anything that is not an array of drawable entries reads as none. That covers the shape an
      // earlier version of this page wrote — a single `{ wma: … }` object, one slot rather than a
      // list — which is dropped rather than migrated: it named no instance, so there is nothing in
      // it that this page could put a chip on.
      const parsed: unknown = JSON.parse(stored)
      indicators.value = Array.isArray(parsed)
        ? parsed.map(parseIndicator).filter((entry): entry is Indicator => entry !== null)
        : []
    }
    catch {
      // Unparseable JSON is not worth surfacing: nobody typed it, nobody can fix it, and an empty
      // chart is a correct answer. Dropping it is what un-wedges the menu.
      localStorage.removeItem(KEY)
    }
  })

  // Deep, because the dialog's inputs are edited through `patch` but the chips' eye writes into an
  // entry in place. Client-only for the same reason as the read.
  if (import.meta.client) {
    watch(indicators, value => localStorage.setItem(KEY, JSON.stringify(value)), { deep: true })
  }

  /**
   * Put one on the chart, and say which one it is.
   *
   * Returns the new id because adding and configuring are one gesture: the combobox picks a kind,
   * and the dialog that opens next has to be about *this* instance rather than about the last one.
   */
  function add(kind: IndicatorKind): string {
    const indicator: Indicator = { id: crypto.randomUUID(), kind, ...DEFAULTS, visible: true }
    indicators.value = [...indicators.value, indicator]
    return indicator.id
  }

  /** Change some of one's settings. A missing id is a no-op: the chip that owned it is gone. */
  function patch(id: string, fields: Partial<Omit<Indicator, 'id' | 'kind'>>) {
    indicators.value = indicators.value.map(entry => (entry.id === id ? { ...entry, ...fields } : entry))
  }

  /** Hide or show one, keeping its settings and its place in the strip. */
  function toggle(id: string) {
    indicators.value = indicators.value.map(entry => (entry.id === id ? { ...entry, visible: !entry.visible } : entry))
  }

  /** Take one off the chart for good. The `✕` on the chip, and the only way one leaves. */
  function remove(id: string) {
    indicators.value = indicators.value.filter(entry => entry.id !== id)
  }

  return { indicators, add, patch, toggle, remove }
}
