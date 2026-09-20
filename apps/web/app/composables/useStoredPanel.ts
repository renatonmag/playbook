/**
 * Where the reader last left the floating panel on `/monitor`: its corner, its size, and whether
 * it was folded down to its title strip.
 *
 * Kept when the two chart bars' positions are not, and the difference is what the thing is. A bar
 * appears with a selection and goes with it — a position that outlived the session would be a
 * position nobody chose for the state they came back to. The panel is furniture: it is on screen
 * from the moment the page is, it is arranged once, and arranging it again on every visit is the
 * kind of small tax that makes a surface feel unfinished.
 *
 * One record rather than five composables, because the five numbers are only ever written together
 * — a drag writes two, a pull writes two, the fold writes one — and five keys is five chances for
 * storage to hold a panel that was never on screen in that shape.
 *
 * `localStorage` rather than the URL, for the reason `useStoredRule` spells out: this is a thing
 * you adjust while working, not a thing you send someone.
 */

/** Namespaced, because `localStorage` is one flat space shared by every page on the origin. */
const KEY = 'playbook:monitor:panel'

export interface PanelState {
  /**
   * Where the panel sits in the viewport, in pixels from its top-left, or `null` for "never moved".
   *
   * `null` is not a coordinate this could have computed instead: the resting place is a corner
   * inset from two edges, and insetting is something CSS does against a viewport nobody here has
   * measured. Once the title bar has been dragged the two numbers take over for good.
   */
  x: number | null
  y: number | null
  /**
   * Its size, which has no `null` because there is no CSS resting size to defer to. 600 wide is
   * the width the panel was asked for; the height is a guess at a useful first box, and both are
   * only ever starting points — the edges are there to be pulled.
   */
  width: number
  height: number
  /** Folded to the title strip. Not a height of 25: see `FloatingPanel` on why the two differ. */
  collapsed: boolean
}

const DEFAULTS: PanelState = { x: null, y: null, width: 600, height: 360, collapsed: false }

/** A number from storage, or `undefined` if what was there cannot be one. */
function positive(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined
}

export function useStoredPanel() {
  const state = reactive<PanelState>({ ...DEFAULTS })

  /**
   * False until storage has been looked in, so the page can hold the panel back for one tick.
   * Rendering it at the default corner and then snapping it to the stored one is a visible jump,
   * and the jump is worse than the tick — the panel is the last thing on the page to appear either
   * way, because it is `fixed` over everything else.
   */
  const ready = ref(false)

  onMounted(() => {
    // Anything unusable is simply the defaults, one field at a time. Hand-edited storage and
    // storage written by an older shape of this record are the ordinary cases here, not exotic
    // ones, and a single bad field should not throw away the four that are fine.
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null')
      if (parsed !== null && typeof parsed === 'object') {
        const stored = parsed as Partial<Record<keyof PanelState, unknown>>
        if (typeof stored.x === 'number' && Number.isFinite(stored.x)) state.x = stored.x
        if (typeof stored.y === 'number' && Number.isFinite(stored.y)) state.y = stored.y
        state.width = positive(stored.width) ?? DEFAULTS.width
        state.height = positive(stored.height) ?? DEFAULTS.height
        state.collapsed = stored.collapsed === true
      }
    }
    catch {
      // Not even JSON. The defaults are already in place.
    }

    ready.value = true
  })

  function remember(patch: Partial<PanelState>) {
    Object.assign(state, patch)
    if (import.meta.client) localStorage.setItem(KEY, JSON.stringify(state))
  }

  return { state, ready, remember }
}
