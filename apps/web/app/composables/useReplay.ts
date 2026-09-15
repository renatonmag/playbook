import type { MaybeRefOrGetter } from 'vue'
import type { Window } from '~/composables/useWindow'
import type { Candle } from '~/types/candle'

/**
 * A replay: one bar time the whole view reads through, so the chart and the pipeline can be walked
 * back to an older bar and stepped forward from there.
 *
 * The state is a cutoff and nothing else. No bar is refetched, no array is copied forward and
 * nothing is mutated — the browser already holds every bar of the loaded window plus everything
 * the socket has opened since, so a replay is a `filter` over that list and a `to` for the
 * pipeline's window. That is the same shape `at` already has on the monitor: one value, and every
 * read hangs off it.
 *
 * Two states rather than one, and the difference matters on screen. `on` is armed — the transport
 * is up and the next click on the pane chooses a bar; `cut` is the bar it chose. Arming without a
 * cut has to be a state you can be in, because the bar has to be visible *before* there is
 * anything to step through, or there is nowhere for the instruction to appear.
 *
 * It knows nothing about the socket, the fetches or the chart. Ending a replay restores a cutoff,
 * not a page: a live feed dropped on the way in is the caller's to bring back, because only the
 * caller knows whether it was running.
 */
export function useReplay(bars: MaybeRefOrGetter<Candle[]>) {
  /** Whether the transport is up. Independent of `cut`: armed and unpicked is a real state. */
  const on = ref(false)

  /** The bar the replay stands on, or `null` while armed and waiting for a click. */
  const cut = ref<number | null>(null)

  /**
   * Whether the last move was a step, which is what decides how the chart redraws.
   *
   * A jump — arming, clicking a bar, ending — is a new picture and gets framed like any other: the
   * history behind the cut is a different number of bars and keeping the old zoom would leave most
   * of the pane empty. A step is the same picture with one bar more or less, and framing *that*
   * would rescale the whole chart on every press. So the two are told apart here, where the
   * difference is known, rather than guessed at from the size of the change by whoever draws it.
   */
  const steady = ref(false)

  /** The bars up to and including the cut, which is what the chart draws and the overlays read. */
  const shown = computed(() => {
    const all = toValue(bars)
    const at = cut.value
    return at === null ? all : all.filter(bar => bar.time <= at)
  })

  /**
   * Where the cut sits in the full history, or `-1` when there is no cut or the bar it names is
   * gone — a timeframe switch, or a window that no longer reaches back this far.
   */
  const index = computed(() => {
    const at = cut.value
    return at === null ? -1 : toValue(bars).findIndex(bar => bar.time === at)
  })

  const canBack = computed(() => index.value > 0)
  const canForward = computed(() => index.value >= 0 && index.value < toValue(bars).length - 1)

  /**
   * The `to` the pipeline's window should end at, or `null` when nothing is cut.
   *
   * The cut's own timestamp, with nothing added — and the bar-length that used to be added here is
   * worth spelling out, because the route's own words invite it back. `/patterns` says it reads
   * closed bars only and that a bar is closed when a later bar exists, which reads as a test made
   * within the window: end on the selected bar and lose it, so add a witness after it.
   *
   * That is not where the test is made. `load_closed_candles` drops rows older than
   * `newest_candle_time`, which is the newest row in the *table* rather than in the window — and
   * that function states the consequence outright: a window ending before the live edge loses
   * nothing. A replay's window always does. So every bar asked for reaches the engine, the witness
   * was simply one more bar to read, and the Patterns came back a bar ahead of the last candle
   * drawn. The route's bounds are inclusive at both ends, so `to = cut` already means "through the
   * bar on screen".
   *
   * One case survives, and it is the monitor's familiar one rather than a new one: standing on the
   * newest row while the feed is running makes the cut the forming bar, which is withheld, and the
   * run ends a bar behind.
   */
  const at = computed(() => {
    const value = cut.value
    return value === null ? null : new Date(value * 1000).toISOString()
  })

  /**
   * The window the pipeline should run over while this replay is on, or `null` when it is not.
   *
   * `from` is the first bar the browser holds rather than `useWindow`'s flat subtraction, and that
   * is the one place a replay has to disagree with it. That subtraction is taken from `to`, so a
   * cut walking backwards drags the run's start back with it while the loaded candles stay where
   * they are — the run then answers about bars that were never fetched and the overlays draw Points
   * before the first candle on screen, stretching the time scale off the left of the chart.
   *
   * Pinned to the loaded history instead, a replay means exactly what it looks like: the pipeline
   * over the bars you can see, ending on the one you are standing on. The cost is stated rather
   * than hidden — a cut near the left edge has little history behind it, and thin Patterns there
   * are the truth about that, not a defect.
   */
  const runWindow = computed<Window | null>(() => {
    const end = at.value
    const first = toValue(bars)[0]
    if (end === null || !first) return null

    return { from: new Date(first.time * 1000).toISOString(), to: end }
  })

  /** A bar was clicked: stand on it. Ignored unless armed, so a normal click still means nothing. */
  function pick(time: number) {
    if (!on.value) return
    cut.value = time
    steady.value = false
  }

  /**
   * One bar on or off, by position in the history rather than by arithmetic on the time.
   *
   * Bar times are not evenly spaced — a weekend, an overnight and a session's close all sit
   * between two adjacent bars — so the neighbour of a bar is the next entry in the list and never
   * `time ± SECONDS`.
   */
  function step(delta: number) {
    const all = toValue(bars)
    const from = index.value
    if (from < 0) return

    const next = all[from + delta]
    if (!next) return

    cut.value = next.time
    steady.value = true
  }

  function start() {
    on.value = true
    steady.value = false
  }

  /** Out of replay entirely: the transport goes and the cutoff with it, so every read is whole. */
  function stop() {
    on.value = false
    cut.value = null
    steady.value = false
  }

  return { on, cut, shown, runWindow, steady, canBack, canForward, pick, step, start, stop }
}
