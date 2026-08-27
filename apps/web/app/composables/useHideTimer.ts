import type { MaybeRefOrGetter, Ref } from 'vue'

/**
 * Hides something a while after it was last worth looking at, and un-hides it whenever it becomes
 * worth looking at again.
 *
 * The overlay this exists for draws three levels per leg, four candles wide each, and consecutive
 * legs overlap — a window's worth of them buries the candles underneath. The levels earn that space
 * right after a leg closes and stop earning it a moment later, which is a timer rather than a
 * checkbox: the interesting moment is the one a new bar just opened, so `restart` is `useBarClock`'s
 * `epoch` and every bump buys another `delay`.
 *
 * `hidden` starts `false` and is forced back to `false` the instant `enabled` goes off, so turning
 * the switch off reveals immediately rather than waiting out a timer nobody is watching any more.
 * Enabling arms the first window, which is what makes "on" mean "visible for 30s, then gone" and
 * not "gone now".
 *
 * A `restart` that never moves is a real state, not a bug: the bar clock only advances while the
 * live feed is connected, so with the feed off this hides once and stays hidden until the switch
 * goes off. That is the honest reading — there are no new bars to show anything for.
 */
export function useHideTimer(
  restart: MaybeRefOrGetter<number>,
  enabled: MaybeRefOrGetter<boolean>,
  delay = 30_000,
) {
  const hidden = ref(false) as Ref<boolean>

  let timer: ReturnType<typeof setTimeout> | null = null

  function clear() {
    if (timer !== null) clearTimeout(timer)
    timer = null
  }

  // Both dependencies do the same thing — start the window over — so they share a watcher. The
  // `immediate` run is what arms it on a page that opens with the switch already on.
  watch([() => toValue(restart), () => toValue(enabled)], ([, on]) => {
    clear()
    hidden.value = false
    if (!on) return

    // Timers only on the client. This is called from a server-rendered page, and a `setTimeout`
    // armed during SSR fires into a discarded render at best. Leaving `hidden` at `false` there is
    // also what the client starts at, so the two markups agree.
    if (!import.meta.client) return

    timer = setTimeout(() => {
      hidden.value = true
      timer = null
    }, delay)
  }, { immediate: true })

  onScopeDispose(clear)

  return { hidden }
}
