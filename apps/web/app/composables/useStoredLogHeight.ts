/**
 * How tall the reader last left the Log panel under `/monitor`'s chart, in pixels.
 *
 * Pixels rather than the percentage the splitter actually works in, because a percentage is only
 * meaningful next to the window it was measured against: restore 30% on a laptop after dragging
 * it on a big monitor and you get a different panel than the one you left. A height in pixels
 * survives the move, and the page converts it back into a share of the split at read time.
 *
 * A folded Log is not a separate flag: folding leaves the panel at its title strip, so the stored
 * height is that strip's, and restoring it collapses the panel by arithmetic rather than by a
 * second piece of state that could disagree with the first.
 *
 * `localStorage` rather than the URL, for the reason spelled out in `useStoredRule`: this is a
 * thing you adjust while working, not a thing you send someone.
 */

/** Namespaced, because `localStorage` is one flat space shared by every page on the origin. */
const KEY = 'playbook:monitor:log-height'

export function useStoredLogHeight() {
  const height = ref<number | null>(null)

  /**
   * False until the stored height has been looked for, so the caller can hold the splitter back
   * for one tick. The splitter reads its initial layout once and never again, so rendering it
   * before the answer is in would mean restoring the height by resizing a panel that is already
   * on screen — a visible jump, and an imperative call where a prop will do.
   */
  const ready = ref(false)

  onMounted(() => {
    const stored = localStorage.getItem(KEY)
    const parsed = stored === null ? Number.NaN : Number.parseFloat(stored)

    // Anything unusable is simply no height: the panel opens folded, which is where it starts on
    // a first visit anyway. Hand-edited storage is the ordinary case here, not the exotic one.
    if (Number.isFinite(parsed) && parsed > 0) height.value = parsed

    ready.value = true
  })

  function remember(px: number) {
    height.value = px
    if (import.meta.client) localStorage.setItem(KEY, String(Math.round(px)))
  }

  return { height, ready, remember }
}
