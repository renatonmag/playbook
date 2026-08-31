import type {
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesApi,
  ISeriesPrimitive,
  IChartApi,
  ITimeScaleApi,
  PrimitiveHoveredItem,
  PrimitivePaneViewZOrder,
  SeriesAttachedParameter,
  SeriesType,
  Time,
  UTCTimestamp,
} from 'lightweight-charts'
import { barSpacing, lastBarEdge, type RenderTarget } from './level-segments'

/**
 * A filled rectangle spanning a band of prices and a fixed number of bars.
 *
 * The second series primitive in this app, and it exists for the reason the first one does: the
 * library draws lines, markers and series, and a *region* is none of the three. A band bounded by
 * two prices cannot be a `LineSeries` — that holds one value per time — and a marker has neither
 * height nor length.
 *
 * It is a sibling of `LevelSegments` rather than an option on it. The two share their arithmetic
 * about the *time* axis — `barSpacing`, `lastBarEdge`, the whole-candle span, the `extend` rule —
 * and are imported from there rather than copied, but they differ in everything else: a box has
 * two prices where a segment has one, it fills where a segment strokes, it sits *under* the
 * candles where a segment sits over them, and its hit test is containment rather than proximity.
 * Folding the two together would be a class with a mode flag and two of every field.
 *
 * Knows nothing about Patterns, deliberately, exactly as `LevelSegments` does not. The caller maps
 * — see `gapBoxes`.
 */

export interface PriceBox {
  /**
   * What this box *is*, for the caller's benefit and nothing else. Opaque here; handed back
   * through `hitTest` as the hovered object's `externalId`. See `gapBoxId`, which mints these.
   */
  id: string
  /** The bar the box starts on. Its own candle is the **first** of the span, not the middle. */
  time: UTCTimestamp
  /** The upper edge. Nothing checks that it is above `bottom`; the caller orders the pair. */
  top: number
  bottom: number
  /** One plain colour. The fill is this at `options.fillOpacity`, the border is this at full. */
  color: string
  /**
   * Runs to the right-hand end of the data instead of stopping after `options.bars`.
   *
   * Length is the only thing a caller may vary per box, the same restraint `LevelSegment.extend`
   * takes: the band's *height* is a measurement and must never be a display choice, and a heavier
   * fill would read as a stronger claim about the gap rather than as "this one is selected".
   */
  extend?: boolean
}

export interface LevelBoxesOptions {
  /** How many candles a box covers, counting the one it starts on. */
  bars: number
  /** Border stroke width in CSS pixels; scaled to the device's bitmap at draw time. */
  borderWidth: number
  /** Alpha the interior is painted at, `0`–`1`. The border is always opaque. */
  fillOpacity: number
}

/** Where a box lies in media (CSS) space: the same numbers the renderer paints, unscaled. */
interface BoxBounds {
  left: number
  right: number
  top: number
  bottom: number
}

/**
 * One box's rectangle, shared by the drawing and the hit test so the two cannot disagree about
 * where a band is — the same argument `boundsOf` in `level-segments.ts` makes, and the same
 * failure it prevents: a box you can see but cannot click.
 *
 * Whole candles horizontally, so the span covers exactly the bars it claims to, and the `extend`
 * rule is `LevelSegments`': never *before* where the fixed span would have ended, so a box found
 * near the live edge does not come out shorter than the stub it replaced.
 *
 * `top`/`bottom` are named for the screen, not for the prices: the price scale runs downwards, so
 * the higher price is the smaller coordinate. They are ordered here rather than trusted, because a
 * degenerate rectangle is invisible and a caller that swapped them would see nothing and have
 * nothing to look at.
 *
 * `null` means the bar or one of the prices is outside what the scales can map — off-screen, not
 * wrong.
 */
function boundsOf(
  box: PriceBox,
  timeScale: ITimeScaleApi<Time>,
  series: ISeriesApi<SeriesType, Time>,
  spacing: number,
  bars: number,
  edge: number | null,
): BoxBounds | null {
  const x = timeScale.timeToCoordinate(box.time)
  if (x === null) return null

  const high = series.priceToCoordinate(box.top)
  const low = series.priceToCoordinate(box.bottom)
  if (high === null || low === null) return null

  const span = x + (bars - 0.5) * spacing

  return {
    left: x - spacing / 2,
    right: box.extend && edge !== null ? Math.max(edge, span) : span,
    top: Math.min(high, low),
    bottom: Math.max(high, low),
  }
}

class LevelBoxesRenderer implements IPrimitivePaneRenderer {
  constructor(
    private readonly boxes: readonly PriceBox[],
    private readonly options: LevelBoxesOptions,
    private readonly chart: IChartApi | null,
    private readonly series: ISeriesApi<SeriesType, Time> | null,
  ) {}

  draw(target: RenderTarget): void {
    const { chart, series, boxes, options } = this
    if (!chart || !series || boxes.length === 0) return

    const timeScale = chart.timeScale()

    const spacing = barSpacing(timeScale)
    if (spacing === null) return

    const edge = lastBarEdge(timeScale, series, spacing)

    // Bitmap space for the same reason `LevelSegments` uses it: a 1px border placed on CSS
    // coordinates lands between device pixels on a HiDPI screen and comes out as a grey smear.
    target.useBitmapCoordinateSpace(({ context, horizontalPixelRatio, verticalPixelRatio }) => {
      for (const box of boxes) {
        const rect = boundsOf(box, timeScale, series, spacing, options.bars, edge)
        if (rect === null) continue

        const left = Math.round(rect.left * horizontalPixelRatio)
        const right = Math.round(rect.right * horizontalPixelRatio)
        const top = Math.round(rect.top * verticalPixelRatio)
        const bottom = Math.round(rect.bottom * verticalPixelRatio)

        // The interior is the same colour at a low alpha rather than a second, pre-blended hue:
        // the candles show through it, and a hue picked to look right over white would be wrong
        // over a candle body. `save`/`restore` because `globalAlpha` is canvas-wide state and the
        // border on the next line — and every later primitive — must not inherit it.
        context.save()
        context.globalAlpha = options.fillOpacity
        context.fillStyle = box.color
        context.fillRect(left, top, right - left, bottom - top)
        context.restore()

        const width = Math.max(1, Math.round(options.borderWidth * verticalPixelRatio))
        context.lineWidth = width
        context.strokeStyle = box.color
        // Half a stroke inset, so the border lies *inside* the band it draws. Without it a 1px
        // line straddles the edge and the box reads as half a pixel taller than the gap is.
        context.strokeRect(
          left + width / 2,
          top + width / 2,
          Math.max(0, right - left - width),
          Math.max(0, bottom - top - width),
        )
      }
    })
  }
}

class LevelBoxesPaneView implements IPrimitivePaneView {
  constructor(private readonly primitive: LevelBoxes) {}

  /**
   * Beneath the candles — the opposite of `LevelSegments`, and for the same reason it chose 'top'.
   * A level hidden behind a body is unreadable, but a filled region *over* the bodies buries the
   * very bars the band is measured from, which is what somebody looking at a gap wants to see.
   *
   * This is about **paint only**. It is not what decides which click belongs to the box; `hitTest`
   * answers that question separately, and deliberately answers it differently. See the note there.
   */
  zOrder(): PrimitivePaneViewZOrder {
    return 'bottom'
  }

  renderer(): IPrimitivePaneRenderer {
    return this.primitive.renderer()
  }
}

export class LevelBoxes implements ISeriesPrimitive<Time> {
  private boxes: readonly PriceBox[] = []
  private chart: IChartApi | null = null
  private series: ISeriesApi<SeriesType, Time> | null = null
  private requestUpdate: (() => void) | null = null

  // Rebuilt on every data change, never mutated — the library caches `paneViews()` on the array's
  // identity. See the same note on `LevelSegments`.
  private views: readonly IPrimitivePaneView[]

  constructor(private readonly options: LevelBoxesOptions) {
    this.views = [new LevelBoxesPaneView(this)]
  }

  setBoxes(boxes: readonly PriceBox[]): void {
    this.boxes = boxes
    this.views = [new LevelBoxesPaneView(this)]
    this.requestUpdate?.()
  }

  attached(param: SeriesAttachedParameter<Time, SeriesType>): void {
    this.chart = param.chart
    this.series = param.series
    this.requestUpdate = param.requestUpdate
  }

  detached(): void {
    this.chart = null
    this.series = null
    this.requestUpdate = null
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return this.views
  }

  renderer(): IPrimitivePaneRenderer {
    return new LevelBoxesRenderer(this.boxes, this.options, this.chart, this.series)
  }

  /**
   * Which box the cursor is inside, so a click can name one.
   *
   * Containment, not proximity: a box has an interior, and "nearest edge" would let a click in the
   * empty middle of a wide band miss it. There is no tolerance for the same reason — the target is
   * the region itself and it is already many pixels tall.
   *
   * **The smallest box wins.** Overlapping triples produce nested bands routinely, and a click
   * inside two of them means the tighter one: the wider box is reachable everywhere its neighbour
   * is not, while a smaller one has nowhere else to be clicked.
   */
  hitTest(x: number, y: number): PrimitiveHoveredItem | null {
    const { chart, series, boxes, options } = this
    if (!chart || !series || boxes.length === 0) return null

    const timeScale = chart.timeScale()

    const spacing = barSpacing(timeScale)
    if (spacing === null) return null

    const edge = lastBarEdge(timeScale, series, spacing)

    let hit: PriceBox | null = null
    let smallest = Number.POSITIVE_INFINITY

    for (const box of boxes) {
      const rect = boundsOf(box, timeScale, series, spacing, options.bars, edge)
      if (rect === null) continue
      if (x < rect.left || x > rect.right) continue
      if (y < rect.top || y > rect.bottom) continue

      const area = (rect.right - rect.left) * (rect.bottom - rect.top)
      if (area >= smallest) continue

      hit = box
      smallest = area
    }

    if (hit === null) return null

    return {
      externalId: hit.id,
      // 'normal', where the pane view above says 'bottom' — the one place in this file where the
      // two disagree, and on purpose. The library reads them as answers to different questions:
      // the pane view's orders the *painting*, this one orders the *arbitration* between everything
      // the cursor is over. On the bottom layer a hit is only returned when nothing else in the
      // pane matched at all, and the candlestick series matches anywhere inside a bar's whole
      // high-to-low span — which is most of a gap box, because the middle bar of the triple is the
      // one whose range crosses the untraded band. Reporting 'bottom' here therefore gave away
      // every click over that bar's column and left the square clickable only at its ends.
      //
      // Not `isBackground`, which sounds right and is not: it moves the library's test to the
      // branch that runs *after* the series' own views and hands the click straight back.
      zOrder: 'normal',
      cursorStyle: 'pointer',
      // Containment has no distance to report, and the field is how the library ranks *within* one
      // primitive — which `smallest` above has already decided. Zero on every hit, deliberately.
      distance: 0,
      // Region-style, per the interface's own scale — below a marker, above nothing.
      hitTestPriority: 1,
      itemType: 'primitive',
    }
  }

  // No `autoscaleInfo`. Both prices of every box are a `high` or a `low` of a bar the chart is
  // already drawing, so a band can never fall outside the candles' own range. Stated rather than
  // left as an omission, the same way `LevelSegments` states it.
}
