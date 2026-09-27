import type {
  IChartApi,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesPrimitive,
  ITimeScaleApi,
  PrimitivePaneViewZOrder,
  SeriesAttachedParameter,
  SeriesType,
  Time,
  UTCTimestamp,
} from 'lightweight-charts'
import { barSpacing, type RenderTarget } from './level-segments'

/**
 * A full-height wash over a run of bars, with one bar inside it picked out.
 *
 * The third series primitive here, and the first that is about the **time axis alone**. `LevelBoxes`
 * is the near relative and the difference is the whole of this file: a box is bounded by two prices
 * a Pattern measured, and this is bounded by nothing — it says *these bars*, and says nothing
 * whatever about price. So its height is the pane's, taken from the bitmap scope's `bitmapSize`
 * rather than from `priceToCoordinate`. That is the first use of `bitmapSize` in this app and it is
 * deliberate: deriving a top and a bottom from the run's own highs and lows would draw a band, and a
 * band is a claim about a price range that nothing here has made.
 *
 * It is also the first primitive that is not a **drawing** but a **pointer**. Everything else on this
 * chart is there because a Pattern found something or a person pinned something, and stays until one
 * of those changes. This exists only while a cursor rests on a line in the monitor's panel, and
 * vanishes when it leaves. Two consequences follow from that and are taken rather than worked
 * around — see `hitTest` and the alphas below.
 *
 * Holds **one span or none**, unlike every other primitive here, which holds a list. One line can be
 * hovered; a second would mean the pointer was in two places.
 *
 * Knows nothing about Patterns, like its two siblings. The caller maps a `LegRecap` to the three
 * times — see `recapReadings` in `pages/monitor.vue`.
 */

/**
 * The hover highlight's colour.
 *
 * A light blue, which is what was asked for, and it has to be argued clear of `GAP_HUES.open`
 * (`#38bdf8`) because that is also a light blue painted under the candles. Two things separate
 * them and neither is the hue:
 *
 * - **A gap box is a measurement and this is a pointer.** The box is on the chart because a Pattern
 *   found an untraded band, and it stays there. This is on the chart because a cursor is resting on
 *   a sentence, and it is gone a moment later. Nothing that persists is ever this colour.
 * - **The shapes cannot be confused.** A gap box is four bars wide and as tall as the band it
 *   measures; this runs the length of a leg and the full height of the pane. At a glance they are
 *   not the same object even before the hue is read.
 *
 * Clear of the rest by construction: `EXTREME_HUES` is violet/cyan/lime, `LEVEL_HUES` is
 * brown/rose/indigo/slate, `BAR_HUES` is sky/amber/pink/grey — its sky is a *marker* on one bar and
 * never a region — and `RESPECT_HUES` is green/red.
 */
export const SPAN_HUE = '#7dd3fc'

/**
 * How present the two fills are.
 *
 * The run is far lighter than `BarGapOverlay`'s established `0.25`, and the reason is length rather
 * than taste: that alpha is set over three bars, and the same wash over a leg of twenty would be the
 * loudest thing on the chart while being the least specific. It has to be enough to find and not
 * enough to read as a finding.
 *
 * The extreme's bar is roughly three times the run's, which is what makes it legible *through* the
 * run it sits inside — the two fills stack on that column, so what is seen there is the sum. Both
 * stay under the candles; see `LegSpansPaneView`.
 */
const RUN_ALPHA = 0.1
const BAR_ALPHA = 0.22

export interface LegSpan {
  /** The leg's first bar and its last — the ends of the run, and both inside it. */
  from: UTCTimestamp
  to: UTCTimestamp
  /**
   * The bar the leg's extreme was made on, painted heavier inside the run.
   *
   * Always between `from` and `to`, since a leg's extreme is one of its own bars — but nothing here
   * checks it, the restraint `PriceBox` takes about the order of its two prices. A caller that
   * handed in a bar outside the run would get a second column drawn beside it, which is a visible
   * bug rather than a silent one.
   */
  at: UTCTimestamp
}

interface SpanBounds {
  left: number
  right: number
  barLeft: number
  barRight: number
}

/**
 * The run's two edges and the extreme bar's, in media pixels — or `null` when any of the three bars
 * is not on the chart at all.
 *
 * Half a bar past each end, which is the whole-candle convention every primitive here keeps: a bar's
 * coordinate is its centre, so a run that stopped at the centres would leave half of its first and
 * last candles outside the thing that is supposed to contain them.
 *
 * **A coordinate off the left or right of the pane is not `null` and must not be treated as one.**
 * `timeToCoordinate` answers with a *negative* or overlarge number for a bar the chart holds but is
 * not currently showing, and reserves `null` for a time its data does not contain. That distinction
 * is the whole of this guard, and it is the useful behaviour rather than a quirk to work around: a
 * leg scrolled half off the left edge draws the half that is visible, clipped by the canvas, which
 * is exactly what somebody hovering a line to *find* that leg needs to see. Rejecting an off-screen
 * coordinate would blank the highlight at the moment it is most wanted.
 *
 * So `null` here means the leg is about bars this chart is not drawing — the panel's rows and the
 * pane's candles come from different places and a replay cut can put them out of step — and then
 * there is genuinely nothing to point at.
 */
function boundsOf(
  span: LegSpan,
  timeScale: ITimeScaleApi<Time>,
  spacing: number,
): SpanBounds | null {
  const from = timeScale.timeToCoordinate(span.from)
  const to = timeScale.timeToCoordinate(span.to)
  const at = timeScale.timeToCoordinate(span.at)
  if (from === null || to === null || at === null) return null

  const half = spacing / 2

  return {
    left: from - half,
    right: to + half,
    barLeft: at - half,
    barRight: at + half,
  }
}

class LegSpansRenderer implements IPrimitivePaneRenderer {
  constructor(
    private readonly span: LegSpan | null,
    private readonly chart: IChartApi | null,
  ) {}

  draw(target: RenderTarget): void {
    const { chart, span } = this
    if (!chart || span === null) return

    const timeScale = chart.timeScale()

    const spacing = barSpacing(timeScale)
    if (spacing === null) return

    const rect = boundsOf(span, timeScale, spacing)
    if (rect === null) return

    target.useBitmapCoordinateSpace(({ context, bitmapSize, horizontalPixelRatio }) => {
      const left = Math.round(rect.left * horizontalPixelRatio)
      const right = Math.round(rect.right * horizontalPixelRatio)
      const barLeft = Math.round(rect.barLeft * horizontalPixelRatio)
      const barRight = Math.round(rect.barRight * horizontalPixelRatio)

      // `save`/`restore` around the pair rather than around each: `globalAlpha` and `fillStyle` are
      // canvas-wide state and no later primitive may inherit either, which is `LevelBoxes`' note.
      // One pair suffices because nothing between the two fills reads them.
      context.save()
      context.fillStyle = SPAN_HUE

      // The whole pane, top to bottom. No `priceToCoordinate` anywhere in this file — see the
      // module docblock on why a height taken from the run's own prices would be a different and
      // unasked-for claim.
      context.globalAlpha = RUN_ALPHA
      context.fillRect(left, 0, right - left, bitmapSize.height)

      // And the extreme's own column, over the run rather than instead of it: the two alphas stack
      // there, which is what the pair was chosen to do.
      context.globalAlpha = BAR_ALPHA
      context.fillRect(barLeft, 0, barRight - barLeft, bitmapSize.height)

      context.restore()
    })
  }
}

class LegSpansPaneView implements IPrimitivePaneView {
  constructor(private readonly primitive: LegSpans) {}

  /**
   * Beneath the candles, `LevelBoxes`' choice and for a sharper version of its reason. A wash this
   * tall painted over the bodies would grey out the entire height of the pane across a whole leg —
   * burying the candles somebody is hovering the line precisely in order to look at.
   */
  zOrder(): PrimitivePaneViewZOrder {
    return 'bottom'
  }

  renderer(): IPrimitivePaneRenderer {
    return this.primitive.renderer()
  }
}

export class LegSpans implements ISeriesPrimitive<Time> {
  private span: LegSpan | null = null
  private chart: IChartApi | null = null
  private requestUpdate: (() => void) | null = null

  // Rebuilt on every change, never mutated — the library caches `paneViews()` on the array's
  // identity. `LevelBoxes` and `LevelSegments` carry the same note.
  private views: readonly IPrimitivePaneView[]

  constructor() {
    this.views = [new LegSpansPaneView(this)]
  }

  /** `null` is the hidden state: this primitive's version of `setBoxes([])`. */
  setSpan(span: LegSpan | null): void {
    this.span = span
    this.views = [new LegSpansPaneView(this)]
    this.requestUpdate?.()
  }

  /**
   * No `series` kept, unlike the other two.
   *
   * Everything here is on the time axis, and the time scale hangs off the chart. The series is what
   * a primitive asks for a *price* coordinate, and this one never has a price to convert.
   */
  attached(param: SeriesAttachedParameter<Time, SeriesType>): void {
    this.chart = param.chart
    this.requestUpdate = param.requestUpdate
  }

  detached(): void {
    this.chart = null
    this.requestUpdate = null
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return this.views
  }

  renderer(): IPrimitivePaneRenderer {
    return new LegSpansRenderer(this.span, this.chart)
  }

  // No `hitTest`, where `LevelBoxes` has one, and it is not an omission. This is drawn only while
  // the cursor is over the monitor's panel — a box of its own, teleported to `body` and outside the
  // chart entirely — so at no moment can a pointer be over both the wash and the pane. Answering
  // hit tests would be claiming clicks for something that cannot be pointed at, and would take them
  // from the candles underneath.

  // No `autoscaleInfo` either, and for a stronger reason than `LevelBoxes` gives: that one has
  // prices and argues they are already on the chart, while this one has no price at all. There is
  // nothing it could contribute to a range.
}
