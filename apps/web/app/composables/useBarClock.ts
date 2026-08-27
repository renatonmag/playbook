import type { MaybeRefOrGetter, Ref } from 'vue'
import type { Candle } from '~/types/candle'

/**
 * Counts how many times the live feed has opened a *new* bar.
 *
 * The socket sends the forming bar over and over — the ingestor writes every second or so, and
 * every write that changes the bar is another frame carrying the same `time`. Anything that wants
 * to act once per bar therefore cannot count frames; it has to watch the bar's `time` and notice
 * when it moves. That is the whole of this composable.
 *
 * `epoch` is a counter rather than a timestamp because its only job is to be a reactive dependency:
 * something reads it to be recomputed when a bar opens. `last` is the running high-water mark, and
 * it is exported because the page wants to say when the last run happened.
 *
 * Adjacency is deliberately not checked. `SECONDS` in `~/types/candle` could tell a genuine
 * neighbour from a bar on the far side of a weekend, but both are new bars here — the question is
 * "did the edge move", not "did it move by exactly one".
 *
 * `seed` is where the mark starts: the last bar already on screen, from the window the view opened
 * with. Without it the socket's very first frame would read as a new bar and spend a pipeline run
 * on the bar that had just been drawn. With it, that first frame only counts if it genuinely is
 * ahead of the loaded window — which is a new bar, and re-running is right.
 */
export function useBarClock(
  bars: MaybeRefOrGetter<Candle[]>,
  seed: MaybeRefOrGetter<number | null>,
) {
  /** The newest bar time seen so far, or `null` until either the seed or a frame supplies one. */
  const last = ref<number | null>(null) as Ref<number | null>

  const epoch = ref(0)

  /**
   * Forgets the mark, so the next seed or frame becomes the new baseline.
   *
   * Needed because bar times are not comparable across Instruments or Timeframes: a mark left by
   * an `1h` feed sits at the top of the hour, and the `5m` bars that follow it would read as old
   * news for the rest of that hour — new bars silently swallowed.
   *
   * `null` and not `toValue(seed)`, which is the tempting version and is wrong in the other
   * direction: at the moment the Timeframe changes the window fetch has not answered yet, so the
   * seed is still the *previous* Timeframe's last bar. Coming back `1h → 5m` that mark is the top
   * of the hour, the forming `5m` bar is ahead of it, and the first frame after the switch spends
   * a pipeline run announcing a bar that was already drawn. Waiting for a real baseline costs
   * nothing, because both watchers below adopt one without counting it.
   */
  function reset() {
    last.value = null
  }

  // `immediate`, so the mark exists before the first frame can arrive. The window fetch may still
  // be in flight, in which case this lands `null` and the watcher below adopts the seed later.
  watch(() => toValue(seed), (value) => {
    if (last.value === null) last.value = value
  }, { immediate: true })

  // `bars` is replaced wholesale by each frame, so this fires once per frame.
  watch(() => toValue(bars), (frame) => {
    if (!frame.length) return

    // The frame's newest bar, not its last: ordering is the route's contract, but a high-water
    // mark that trusted it would be wrong in exactly the case it exists to catch.
    const newest = frame.reduce((max, bar) => Math.max(max, bar.time), Number.NEGATIVE_INFINITY)

    // No mark yet — the window fetch found nothing, or has not answered. Take the frame as the
    // baseline rather than as news: there is no earlier state for this bar to be newer *than*.
    if (last.value === null) {
      last.value = newest
      return
    }

    // A reconnect re-sends the recent bars, and the forming bar arrives many times over. Both are
    // `<=` the mark, and both are meant to do nothing.
    if (newest <= last.value) return

    last.value = newest
    epoch.value += 1
  })

  return { last, epoch, reset }
}
