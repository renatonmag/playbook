import type { MaybeRefOrGetter, Ref } from 'vue'
import type { Candle, Timeframe } from '~/types/candle'

/** What the socket is doing, as far as the page needs to say it out loud. */
export type LiveStatus = 'off' | 'connecting' | 'open' | 'error'

/** Backoff bounds for an unwanted close. Short enough to feel automatic, capped so a server
 *  that is down is not hammered by every open tab. */
const RETRY_MIN_MS = 1000
const RETRY_MAX_MS = 5000

interface Frame {
  type: 'candles' | 'error'
  candles?: Candle[]
  detail?: string
}

/**
 * The live edge of one Instrument/Timeframe, over `WS /ws/candles`.
 *
 * The counterpart to `useCandles`, and deliberately not folded into it: that composable owns a
 * *window*, which is a thing you ask for once, while this one owns a *connection*, which is a
 * thing you hold. Merging them would put a socket's lifecycle inside Nuxt's fetch cache.
 *
 * `connected` is the user's intent and `status` is the socket's reality. They differ on purpose:
 * while a reconnect is in flight the button should still read as on.
 */
export function useLiveCandles(
  symbol: MaybeRefOrGetter<string>,
  timeframe: MaybeRefOrGetter<Timeframe>,
) {
  const { public: { apiBase } } = useRuntimeConfig()

  const connected = ref(false)
  const status = ref<LiveStatus>('off')
  const error = ref<string | null>(null)

  /**
   * The bars from the most recent frame, oldest first — the whole frame, not just its last bar.
   *
   * A frame carries more than one bar exactly when a bar closes and the next opens, and the
   * closed one's final tick is in there. Keeping only the newest would leave that bar drawn at
   * its second-to-last state permanently, since nothing will ever send it again.
   *
   * A ref rather than a callback so the chart can watch it.
   */
  const bars = ref<Candle[]>([]) as Ref<Candle[]>

  /**
   * Every bar this connection has seen, by `time` — the record, where `bars` above is the news.
   *
   * Both, and not one: a frame carries only what *changed* since the last one, which is what makes
   * `bars` the right input for `series.update()` and for the bar clock, and the wrong input for
   * anything that asks a question about a bar later. A bar that opened after the page loaded and has
   * since closed is in no frame and in no fetched window; without this it exists only inside the
   * chart's own series, where nothing can look it up. The wick tool looks bars up by name on hover,
   * which is how that showed.
   *
   * Reassigned rather than mutated, so a computed reading it is rebuilt when the feed moves. A later
   * frame overwrites an earlier state of the same `time`: that is how a bar last seen unfinished is
   * corrected.
   *
   * Bounded by the session, not by the connection: a reconnect's bars are the same bars. What does
   * end it is a different Instrument or Timeframe — see the watcher at the bottom.
   */
  const history = ref<ReadonlyMap<number, Candle>>(new Map()) as Ref<ReadonlyMap<number, Candle>>

  let socket: WebSocket | null = null
  let retry: ReturnType<typeof setTimeout> | null = null
  let backoff = RETRY_MIN_MS

  /** `apiBase` is the same origin the fetches use; only the scheme differs. */
  function url() {
    const base = new URL(apiBase, import.meta.client ? location.href : undefined)
    base.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:'
    base.pathname = '/ws/candles'
    base.search = new URLSearchParams({
      symbol: toValue(symbol),
      timeframe: toValue(timeframe),
    }).toString()
    return base.toString()
  }

  function clearRetry() {
    if (retry === null) return
    clearTimeout(retry)
    retry = null
  }

  /** Drops the socket without touching `connected`, so both a user close and a reconnect use it. */
  function close() {
    clearRetry()
    if (!socket) return
    // Cleared first: `onclose` fires on a close we asked for too, and would schedule a retry.
    socket.onclose = null
    socket.onerror = null
    socket.onmessage = null
    socket.close()
    socket = null
  }

  function open() {
    // The socket is a browser object, and SSR has no live edge to show anyway.
    if (!import.meta.client) return
    close()
    status.value = 'connecting'

    const next = new WebSocket(url())
    socket = next

    next.onopen = () => {
      status.value = 'open'
      error.value = null
      backoff = RETRY_MIN_MS
    }

    next.onmessage = (event) => {
      const frame = JSON.parse(event.data) as Frame
      if (frame.type === 'error') {
        error.value = frame.detail ?? 'erro no servidor'
        status.value = 'error'
        return
      }
      // Ordering is the route's contract, and the chart depends on it: `update()` refuses a
      // bar older than the one before it.
      if (frame.candles?.length) {
        bars.value = frame.candles

        const seen = new Map(history.value)
        for (const candle of frame.candles) seen.set(candle.time, candle)
        history.value = seen
      }
    }

    next.onerror = () => {
      error.value = 'não foi possível conectar'
      status.value = 'error'
    }

    next.onclose = () => {
      socket = null
      // A close we did not ask for. `connected` is still true, so the user still wants live.
      if (!connected.value) {
        status.value = 'off'
        return
      }
      status.value = 'connecting'
      retry = setTimeout(open, backoff)
      backoff = Math.min(backoff * 2, RETRY_MAX_MS)
    }
  }

  function connect() {
    connected.value = true
    open()
  }

  function disconnect() {
    connected.value = false
    close()
    status.value = 'off'
    error.value = null
    // Left as it is: the bar the chart already drew stays drawn, and clearing this would only
    // make the watcher fire with `null`.
  }

  function toggle() {
    if (connected.value) disconnect()
    else connect()
  }

  // The socket is per Instrument and Timeframe, so changing either is a different connection.
  watch([() => toValue(symbol), () => toValue(timeframe)], () => {
    // And a different history: a bar `time` is only comparable within one Instrument and Timeframe,
    // so keeping the old feed's bars would put `5m` bars on an `1h` chart's scale. Cleared here and
    // nowhere else — a reconnect is the same feed, and dropping the record on every backoff retry
    // would be the very hole this map exists to close.
    history.value = new Map()
    if (connected.value) open()
  })

  onScopeDispose(close)

  return { connected, status, error, bars, history, connect, disconnect, toggle }
}
