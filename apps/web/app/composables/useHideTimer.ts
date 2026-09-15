import type { MaybeRefOrGetter, Ref } from 'vue'

/**
 * Hides something as soon as it is asked to, and un-hides it for a while whenever it becomes worth
 * looking at again.
 *
 * The overlay this exists for draws three levels per leg, four candles wide each, and consecutive
 * legs overlap — a window's worth of them buries the candles underneath. The levels earn that space
 * right after a leg closes and stop earning it a moment later, which is a timer rather than a
 * checkbox: the interesting moment is the one a new bar just opened, so `restart` is `useBarClock`'s
 * `epoch` and every bump buys another `delay`.
 *
 * Turning the switch on is *not* one of those moments, which is why `enabled` no longer arms a
 * window: the caller asked for the thing to go away, and making it wait out a `delay` first reads as
 * a click that did nothing. That hide is `hide()`, called from the click, rather than the rising
 * edge of `enabled` — watchers flush after the handler, and the hide has to land with the click.
 *
 * `hidden` starts `false` and is forced back to `false` the instant `enabled` goes off, so turning
 * the switch off reveals immediately rather than waiting out a timer nobody is watching any more.
 *
 * A `restart` that never moves is a real state, not a bug: the bar clock only advances while the
 * live feed is connected, so with the feed off this hides on the click and stays hidden until the
 * switch goes off. That is the honest reading — there are no new bars to show anything for.
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

  /** Hide now, for callers that mean now. The next `restart` still reveals for another `delay`. */
  function hide() {
    clear()
    hidden.value = true
  }

  // A new bar is the moment worth looking at: show, and start the window over.
  watch(() => toValue(restart), () => {
    clear()
    if (!toValue(enabled)) return
    hidden.value = false

    // Timers only on the client. This is called from a server-rendered page, and a `setTimeout`
    // armed during SSR fires into a discarded render at best. Leaving `hidden` at `false` there is
    // also what the client starts at, so the two markups agree.
    if (!import.meta.client) return

    timer = setTimeout(() => {
      hidden.value = true
      timer = null
    }, delay)
  })

  // The switch only ever ends a window. Going on is the caller's `hide()`; going off reveals.
  watch(() => toValue(enabled), (on) => {
    clear()
    if (!on) hidden.value = false
  })

  onScopeDispose(clear)

  return { hidden, hide }
}
