import type { LineData, UTCTimestamp } from 'lightweight-charts'
import { SECONDS, type Candle, type Timeframe } from '~/types/candle'

/**
 * Indicators: lines read off the candles themselves, with nothing behind them on the server.
 *
 * Not Patterns, and the distinction is the whole reason this file is not in `pattern_engine`. A
 * Pattern is a claim the pipeline makes about a Series — it is run, validated and answered for. An
 * indicator is arithmetic over the bars the browser already holds, recomputed on every tick, and
 * the only correct place for it is the browser: sending the same closes back to the API to have
 * them averaged would buy nothing and cost the round trip that makes "on tick" impossible.
 *
 * Pure, and takes the bars rather than reaching for them — `useLineOverlay`'s rule read one level
 * up. The caller owns which bars count (the loaded window, the live edge, the replay's cut), and a
 * function that knew how to decide that would have to learn the whole of `monitor.vue`.
 */

/** The indicators this page can draw. One today; a second is a `kind` here and an overlay. */
export type IndicatorKind = 'wma'

/**
 * One indicator on the chart: which kind, how it is set, and whether it is drawn.
 *
 * An instance rather than a slot, which is the whole of the shape. Two weighted averages of
 * different periods on one chart is the ordinary way these are read — the short one against the
 * long one — so "the WMA" is not a thing there is one of. Each carries its own settings and its own
 * `id`, and the id is what the chip, the dialog and the overlay all name it by; nothing is keyed by
 * kind, because kind is not unique.
 *
 * `visible` and not `on`: the eye on the chip hides a line that still exists, with its settings and
 * its place in the strip intact. Removing one is the `✕`, and that is a different act.
 */
export interface Indicator {
  id: string
  kind: IndicatorKind
  period: number
  color: string
  width: number
  visible: boolean
  /**
   * The bars this is averaged over, or `null` for the ones the chart is showing.
   *
   * `null` rather than a copy of the chart's current Timeframe, so that an indicator nobody has
   * touched follows a Timeframe switch instead of quietly turning into an aggregation the first
   * time the chart is moved under it. Set, it means the bars are grouped into that Timeframe's
   * buckets before being averaged — the hourly average read against five-minute candles, which is
   * the ordinary way a slow average is used.
   */
  timeframe: Timeframe | null
}

/** What the combobox offers, in the order it lists them. */
export const INDICATOR_KINDS: { kind: IndicatorKind, label: string }[] = [
  { kind: 'wma', label: 'Média ponderada' },
]

/**
 * The bucket length an indicator is really averaged over, in seconds, or `undefined` for one
 * bucket per bar — the single answer the overlay draws by and the legend names by.
 *
 * Coarser only. A 15m indicator is still on the list when the chart is switched to `1h`, and five
 * minutes cannot be recovered from an hourly bar: the honest answer there is the chart's own bars,
 * which is also what `indicatorLabel` will then say. Guarding it in one place is what keeps the
 * line and its label from disagreeing about what was drawn.
 */
export function aggregationSeconds(timeframe: Timeframe | null, chart: Timeframe): number | undefined {
  if (timeframe === null) return undefined
  return SECONDS[timeframe] > SECONDS[chart] ? SECONDS[timeframe] : undefined
}

/**
 * The name on the chip: the kind and the one setting that tells two of the same kind apart.
 *
 * Not a name somebody types. Two averages on one chart differ by their period and by nothing else
 * anybody thinks in — the period *is* the name, it is how these are spoken about out loud, and a
 * label that had to be maintained by hand would go stale the first time a period was edited.
 *
 * The Timeframe joins it only when it is actually doing something. An `1h` suffix on an `1h` chart
 * would be naming the chart rather than the line, and on a chart too coarse to aggregate into it
 * would be naming something that is not drawn.
 */
export function indicatorLabel(indicator: Indicator, chart: Timeframe): string {
  const name = `${indicator.kind}-${indicator.period}`
  return aggregationSeconds(indicator.timeframe, chart) === undefined ? name : `${name} · ${indicator.timeframe}`
}

/** The smallest period worth averaging. One bar is the close; zero and below are not periods. */
const MIN_PERIOD = 2

/**
 * The linearly weighted moving average of the closes — `Σ k·close / (N(N+1)/2)`, the newest close
 * weighted `N` and the oldest of the window weighted `1` — optionally over coarser bars than the
 * ones it is drawn on.
 *
 * Off the **close** and not the typical price: that is what "média móvel ponderada" means on every
 * chart this is read beside, and a mean of the four prices would be a different indicator wearing
 * the same label.
 *
 * `seconds` is the length of one bucket, and omitting it means one bucket per bar. Given `3600` on
 * a five-minute chart, the closes averaged are hourly closes while the line still carries a point
 * on every five-minute bar: a staircase that changes at the top of each hour. Buckets are
 * `floor(time / seconds)`, which is not a guess — it is the same cut the stored `1h` bars were
 * made with, so an hour aggregated here has the close the API would have given for it.
 *
 * Only closes are read, and that is what removes the hard case. The oldest bucket in the window is
 * usually joined halfway through — the loaded window starts mid-session — and a bucket cut off at
 * its *left* edge still has the right close, because its close is its last bar's close. Its open,
 * high and low would be wrong, which is exactly why nothing here builds a bucket into a Candle.
 *
 * **No look-ahead.** The value at a bar is the closed buckets behind it plus the bucket *in
 * progress, truncated at that bar* — never that bucket's eventual close. That is what makes the
 * right-hand end move on every tick, and it is the only honest drawing of the history too: a line
 * that used each hour's final close from its first minute would show a shape nobody could have
 * seen at the time.
 *
 * The line starts where there are `N` buckets to average, not at bar one. A shorter window
 * averaged with whatever it had would draw a 30-bar average out of three bars for the first
 * stretch of the chart — a number that moves like nothing the setting describes, and looks exactly
 * like the real thing. Leaving those bars empty says what is true: there is not enough history
 * yet. Aggregating makes that bite: the `5m` window holds about five sessions, so roughly fifty
 * hourly buckets, and a period above that draws nothing at all.
 *
 * Total in the sense `parseRule` is: a period below `MIN_PERIOD`, a non-integer, or a list too
 * short all give an empty line rather than a throw. The period reaches here from a number input
 * somebody is in the middle of typing, so "not a usable period yet" is the ordinary case.
 *
 * One pass, on two rolling sums over the last `N - 1` *closed* closes. `weighted` is `Σ k·close`
 * over them and `total` is `Σ close`; a bucket closing drops the departing close out of every
 * weight at once, which is what `weighted - total` does, then adds the arriving one at the full
 * weight. The bar being read is added at weight `N` and never stored, since the next bar of the
 * same bucket replaces it. This runs over the entire merged history on every tick, so the
 * quadratic spelling is not an option.
 *
 * With `seconds` omitted every bucket holds one bar and this is exactly the plain average it was
 * before — same first point at bar `N`, same values. That equivalence is why there is one function
 * here and not two: a second spelling of the same average is a second chance for the two to
 * disagree.
 */
export function weightedAverage(bars: Candle[], period: number, seconds?: number): LineData<UTCTimestamp>[] {
  if (!Number.isInteger(period) || period < MIN_PERIOD || bars.length < period) return []

  const divisor = (period * (period + 1)) / 2
  /** How many *closed* buckets the window holds. The bar being read is the `N`th. */
  const span = period - 1

  const closed: number[] = []
  let weighted = 0
  let total = 0

  /** The bucket the previous bar fell in, and its close — which becomes that bucket's close. */
  let bucket: number | null = null
  let latest = 0

  const line: LineData<UTCTimestamp>[] = []

  for (const bar of bars) {
    const current = seconds === undefined ? bar.time : Math.floor(bar.time / seconds) * seconds

    // A bar in a new bucket is the proof the previous one closed — no clock is consulted, the same
    // rule `/patterns` reads a closed bar by.
    if (bucket !== null && current !== bucket) {
      if (closed.length >= span) {
        const leaving = closed[closed.length - span]!
        weighted += span * latest - total
        total += latest - leaving
      }
      else {
        // Still filling: nothing leaves, and the arrival takes the next weight up.
        weighted += (closed.length + 1) * latest
        total += latest
      }
      closed.push(latest)
    }

    bucket = current
    latest = bar.close

    if (closed.length >= span) {
      line.push({ time: bar.time as UTCTimestamp, value: (weighted + period * bar.close) / divisor })
    }
  }

  return line
}
