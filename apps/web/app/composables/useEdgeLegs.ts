import type { MaybeRefOrGetter, Ref } from 'vue'
import type { Candle } from '~/types/candle'
import type { PatternResponse } from '~/types/pattern'
import type { Window } from '~/composables/useWindow'

/**
 * `simple-leg`, re-run over the forming bar the moment that bar breaks the last closed one.
 *
 * **Why this exists at all.** `/patterns` reads closed bars only, deliberately and for the reasons
 * its module docstring gives, so the monitor's overlays sit one bar behind its candles. For most
 * Patterns that gap is a nicety. For `simple-leg` it is the answer: a leg *turns* on the bar that
 * takes out the previous bar's extreme — a bull leg on a lower low, a bear leg on a higher high,
 * which is `PbMark.mark_pullbacks`' whole rule — so the instant the forming candle breaks through,
 * the thing the next pipeline run will report has already happened. Waiting for the bar to close
 * is waiting a full Timeframe to be told something the break already said.
 *
 * So: watch the live edge, notice the break, and ask the server to run that one Pattern over the
 * window *including* the bar still being written. `POST /patterns/custom` is the route, and
 * `playbook_api.selection` is where "a caller narrows, it never composes" is argued.
 *
 * **At most twice per forming bar**, once for the high break and once for the low. The flags live
 * on the bar's `time` and are dropped when the edge moves, so the ceiling is per bar and not per
 * session. A bar that breaks one side, comes back inside, and breaks it again asks nothing the
 * first break did not already answer — the run is over the whole window, not over the tick.
 *
 * **Both breaks in one frame is one request, not two.** An outside bar takes out both extremes,
 * and the two runs it would provoke carry byte-identical input. That is a reading of "at most
 * twice" rather than a violation of it: the rule bounds the asking, and asking once for two facts
 * is fewer.
 *
 * **The forming bar is not sent.** The break is detected here, because this is where the socket
 * delivers it; the *bar* is read from the database by the route, which is the same row the feed
 * wrote and this page was pushed a copy of. Sending prices the server already holds would put a
 * second authority on what the bar is on the wire, and the two would differ by however long the
 * request took.
 *
 * `$fetch` and not `useFetch`, for `calculate`'s reason on the monitor: this is an imperative
 * action with no key. The response is not state Nuxt should cache or hydrate, and `useFetch`'s key
 * knows nothing about a body.
 */
export function useEdgeLegs(
  /** `live.bars` — the newest frame, replaced wholesale, which is what makes the watcher fire. */
  frame: MaybeRefOrGetter<Candle[]>,
  /** `mergedBars` — the window plus every bar the feed has opened since, in time order. */
  history: MaybeRefOrGetter<Candle[]>,
  /** The window the pipeline runs over, so the two answers are about one span of bars. */
  window: MaybeRefOrGetter<Window>,
  /** What names that window. Comes back with the response, so a stale answer is discardable. */
  windowKey: MaybeRefOrGetter<string>,
  /** Live and not replaying. A paused view has no forming bar for a break to be about. */
  enabled: MaybeRefOrGetter<boolean>,
) {
  const { public: { apiBase } } = useRuntimeConfig()

  const response = ref<PatternResponse | null>(null) as Ref<PatternResponse | null>
  /** The `windowKey` `response` was fetched for — see the composable's docblock on staleness. */
  const key = ref<string | null>(null)
  const pending = ref(false)
  const error = ref<string | null>(null)

  /**
   * Which breaks the bar at `time` has already provoked a run for.
   *
   * Plain state rather than a ref: nothing renders it, and making it reactive would only invite a
   * computed to depend on a thing that changes several times a second.
   */
  let broke: { time: number, high: boolean, low: boolean } | null = null

  /** Orders the answers the way `calculate` does: the debounce spaces requests, it does not sort them. */
  let latest = 0

  async function run(window_: Window, at: string) {
    const mine = ++latest
    pending.value = true
    error.value = null

    try {
      const answer = await $fetch<PatternResponse>('/patterns/custom', {
        baseURL: apiBase,
        method: 'POST',
        query: { ...window_ },
        // No rule and no `sn`: `simple-leg` takes neither, so sending them would put parameters in
        // the request that provably change no byte of the response.
        body: { patterns: ['simple-leg'], edge: 'forming' },
      })
      if (mine !== latest) return
      response.value = answer
      key.value = at
    }
    catch (failure) {
      if (mine !== latest) return
      // Kept rather than thrown: a failed edge run must leave the closed-bar answer drawn. The
      // page falls back to it by finding no fresher points, which is the same path it takes before
      // the first break of every bar.
      response.value = null
      key.value = null
      error.value = failure instanceof Error ? failure.message : String(failure)
    }
    finally {
      if (mine === latest) pending.value = false
    }
  }

  watch(() => toValue(frame), (bars) => {
    if (!toValue(enabled)) {
      // Dropped rather than kept, so turning the feed back on does not inherit flags set against a
      // bar that closed while it was off.
      broke = null
      return
    }
    if (!bars.length) return

    // The frame's newest bar, not its last. Ordering is the route's contract and a reader that
    // trusted it would be wrong in exactly the case this exists to catch — the same correction
    // `useBarClock` makes, for the same reason.
    const edge = bars.reduce((newest, bar) => (bar.time > newest.time ? bar : newest), bars[0]!)

    const bars_ = toValue(history)
    // The forming bar is the newest bar there is. A frame whose newest bar is not the newest bar
    // of the history is a correction to something already closed — the second entry of a frame
    // that spans a bar boundary — and a break on it is news about nothing.
    if (bars_.at(-1)?.time !== edge.time) return

    const previous = bars_.at(-2)
    if (!previous) return

    if (broke?.time !== edge.time) broke = { time: edge.time, high: false, low: false }

    const high = edge.high > previous.high && !broke.high
    const low = edge.low < previous.low && !broke.low
    if (!high && !low) return

    // Marked before the request and not after it. A run takes a round trip and the frames keep
    // arriving; flags set on the answer would let every frame in between fire the same break again,
    // which is the one way the ceiling could be exceeded.
    broke.high ||= high
    broke.low ||= low

    void run(toValue(window), toValue(windowKey))
  })

  return { response, key, pending, error }
}
