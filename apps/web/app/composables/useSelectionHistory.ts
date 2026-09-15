/**
 * `Ctrl+Z` for what is selected on `/monitor`: the pinned levels and the trend lines somebody moved
 * by hand.
 *
 * Selecting on that page is destructive in three ways that have no other way back — `limpar` drops
 * every pin under a Series at once, and a trend line dropped on a candle consumes the origin's pin
 * along the way. `/rules` gets its undo for free by keeping its state in the URL, but a sidebar
 * layout cannot travel in a link at all (see `useStoredOverlays`), so this is a history of its own.
 *
 * **`pinned` and `moves` together, and nothing else.** They are already one decision: `applyMove`
 * deletes a pin as it adds a move, and `clearPins` empties both. Undoing either alone would leave
 * the pair disagreeing about a line. The filter axes — `shown`, `open`, `autoHide`,
 * `confirmedOnly` — stay out: those are preferences about what is drawn, not things that were
 * *chosen* off a chart, and folding them in would make `Ctrl+Z` re-tick a checkbox somebody set on
 * purpose several actions ago.
 *
 * **Watched, not wrapped.** Eleven places mutate these two sets, between the four functions on the
 * page and the overlay wiring and list buttons that call them. A deep watcher sees all of them
 * without any of them knowing this file exists — the same trade `useStoredOverlays` makes one
 * declaration below — and it buys the coalescing for free: a `pre`-flush watcher runs once per tick,
 * so `applyMove`'s delete-then-add and `clearPins`' loop each land as one step rather than as the
 * several a command log would have recorded.
 *
 * The cost is that a history is a thing about this visit: a reload starts empty, while the
 * `localStorage` snapshot does not. That asymmetry is deliberate — undoing changes what is on
 * screen, and the snapshot follows the screen, so a `Ctrl+Z` is saved like any other change rather
 * than "un-saving" the one before it.
 */

import type { Ref } from 'vue'

/** The two sets that make up a selection. Everything here is keyed by these names. */
type Tracked = 'pinned' | 'moves'

const NAMES: Tracked[] = ['pinned', 'moves']

/** A selection frozen as plain arrays, which is what a stack can hold without aliasing the live sets. */
type Snapshot = Record<Tracked, string[]>

/**
 * How far back `Ctrl+Z` reaches. The page lives for a whole session and every step keeps a copy of
 * the full selection, so this is a bound on memory rather than a claim about how much undo is
 * useful — a hundred steps is far past what anyone retraces by hand.
 */
const DEPTH = 100

export function useSelectionHistory(sets: Record<Tracked, Ref<Set<string>>>) {
  function snapshot(): Snapshot {
    return { pinned: [...sets.pinned.value], moves: [...sets.moves.value] }
  }

  const past = ref<Snapshot[]>([])
  const future = ref<Snapshot[]>([])

  /** What the sets hold right now — the thing that moves onto a stack when the other one is entered. */
  let present = snapshot()

  /**
   * Whether the write about to be seen is our own.
   *
   * Needed because the watcher below cannot tell a restored selection from a chosen one, and a
   * restore that recorded itself would make `Ctrl+Z` toggle between two states forever.
   */
  let applying = false

  watch(
    NAMES.map(name => sets[name]),
    () => {
      if (applying) return

      past.value.push(present)
      if (past.value.length > DEPTH) past.value.shift()

      present = snapshot()

      // A new choice is what makes the abandoned branch unreachable: there is no longer a state to
      // step forward into, only the one somebody just made.
      future.value = []
    },
    { deep: true },
  )

  /**
   * Put a snapshot back into the live sets.
   *
   * The flag has to outlive the assignment: the watcher is `pre`-flush, so it runs a microtask later
   * and would find `applying` already cleared if this were a plain statement pair.
   */
  function apply(entry: Snapshot) {
    applying = true
    for (const name of NAMES) sets[name].value = new Set(entry[name])
    present = entry
    nextTick(() => { applying = false })
  }

  /** Step back. Reports whether it moved, so a key handler knows when it has consumed the event. */
  function undo(): boolean {
    const entry = past.value.pop()
    if (entry === undefined) return false

    future.value.push(present)
    apply(entry)
    return true
  }

  /** Step forward again, until the next choice throws the branch away. */
  function redo(): boolean {
    const entry = future.value.pop()
    if (entry === undefined) return false

    past.value.push(present)
    apply(entry)
    return true
  }

  /**
   * `Restaurar`'s history: none.
   *
   * A restore is not a step — it is a different selection arriving whole, from another visit, and
   * stepping back out of it into whatever the page happened to hold beforehand is not something
   * anybody asked for. So the stacks go and the restored state becomes the beginning.
   *
   * Called *after* the sets have been replaced, and it does not write to them; the guard is here
   * only to swallow the watcher pass that the caller's own write is about to cause.
   */
  function reset() {
    applying = true
    past.value = []
    future.value = []
    present = snapshot()
    nextTick(() => { applying = false })
  }

  return {
    undo,
    redo,
    reset,
    canUndo: computed(() => past.value.length > 0),
    canRedo: computed(() => future.value.length > 0),
  }
}
