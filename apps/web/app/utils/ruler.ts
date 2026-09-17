import type { UTCTimestamp } from 'lightweight-charts'
import type { RulerEnd } from './ruler-segments'

/**
 * A measurement the reader took: two ends and an identity, and nothing about how it is drawn.
 *
 * The page's shape rather than the primitive's — `RulerMark` is what `Rulers` draws, and it carries
 * the label text, the selection and the draft flag, all three of which are answers to "how does
 * this look right now" rather than parts of the measurement. Keeping them apart is what lets the
 * page hold a plain list it can add to and splice from.
 */
export interface Ruler {
  id: string
  from: RulerEnd
  to: RulerEnd
}

/**
 * The ids, minted by counting.
 *
 * Not derived from the geometry, which is how every other drawing on this chart is named — and the
 * difference is that those names mean something. A trend line's id says which two Points it runs
 * between, so two readers of the same Series arrive at the same name and a pin survives a re-run. A
 * ruler comes from nowhere the engine knows about and survives nothing; the only thing its id has
 * to do is tell it apart from the other rulers on the pane, including one drawn on exactly the same
 * two bars at prices a few ticks apart. A counter does that and, unlike a geometric name, does not
 * change under the reader's hand mid-drag.
 */
let minted = 0

export function nextRulerId(): string {
  minted += 1
  return `ruler:${minted}`
}

/**
 * Whole points, grouped for reading: `1.250`, the Brazilian way round, which is what the price axis
 * beside it already shows.
 */
const POINTS = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })

/**
 * What the box at the far end reads: how far the second end is from the first, in points and in
 * bars — `+320 pts · 14 barras`.
 *
 * Signed on the price and unsigned on the bars, and that asymmetry is the point of the tool. Which
 * way a move went is the thing being measured, so the sign carries it — with a real minus sign,
 * `−`, rather than the hyphen, because this is text set beside a chart and not a number to be
 * parsed. How many bars it took is a span, and a span has no direction: a ruler dragged right to
 * left measures the same fourteen candles as one dragged left to right.
 *
 * Rounded to whole points, which is a claim about this installation rather than about arithmetic:
 * the only Instrument here is `WIN@N`, quoted in whole points. An Instrument with a finer tick would
 * want its own precision, and it would come from the Instrument — not from counting the decimals
 * the cursor happened to land on.
 *
 * `bars` being `null` means one of the two ends is on a bar the chart no longer holds — a replay
 * cut, or a window that moved under a ruler. The points half still stands, so it is what gets said.
 */
export function rulerLabel(from: RulerEnd, to: RulerEnd, bars: number | null): string {
  const move = Math.round(to.price - from.price)
  const sign = move < 0 ? '−' : '+'
  const points = `${sign}${POINTS.format(Math.abs(move))} pts`

  if (bars === null) return points

  return `${points} · ${bars} ${bars === 1 ? 'barra' : 'barras'}`
}

/**
 * How many bars apart the two ends are, or `null` when either one is off the chart.
 *
 * Counted as *positions in the window*, not as elapsed time divided by the timeframe, and the
 * difference is every gap in the series: a ruler spanning a weekend or an overnight would otherwise
 * report the hours nobody traded as bars that were never drawn. The same reason `SECONDS` exists
 * for adjacency and is not used for counting.
 */
export function barsBetween(
  from: UTCTimestamp,
  to: UTCTimestamp,
  index: ReadonlyMap<number, number>,
): number | null {
  const start = index.get(from)
  const end = index.get(to)
  if (start === undefined || end === undefined) return null

  return Math.abs(end - start)
}
