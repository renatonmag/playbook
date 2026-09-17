import type {
  IChartApi,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesApi,
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
 * A mark spanning a run of candles, held a fixed distance clear of a price.
 *
 * Two marks, which is one more than this file was born with: a filled rounded **pill**, and a
 * **sawtooth** stroke drawn inside exactly the box the pill would have occupied. Everything that
 * decides *where* the mark goes — the span, the side, the gap, the lane — is shared, and only the
 * shape drawn in that box differs. That is the whole design: the caller runs this primitive twice
 * over two Series that answer the same question about two different kinds of line, and the texture
 * is the channel left over once position and colour are spoken for. See `respectMark` for who picks
 * which, and `PLACEMENT` in `line-respect.ts` for why neither mark follows the line it reports.
 *
 * The filename and the class keep the pill's name. It is still the fourth series primitive in this
 * app and still the only one placed in pixels, and renaming it for a second shape would put the
 * count of shapes into a name that is about the drawing's role.
 *
 * The fourth series primitive in this app, and the first whose *vertical* placement is not a
 * price. `LevelSegments` sits at one, `LevelBoxes` between two, `TrendSegments` runs from one to
 * another — all three are drawings of the price scale. This one is a drawing **beside** it: the
 * price it is given is the extreme of the bars underneath, and the pill's whole job is to stay out
 * of their way by a constant number of pixels however far the scale is zoomed. A price offset
 * cannot say that; it would sit closer on a compressed scale and further on a stretched one, which
 * is exactly the reading a label must not have.
 *
 * That choice is what makes the omissions below cost something the other three do not pay, and
 * both are stated where they happen: `autoscaleInfo` (a pill can be clipped) and the span's ends
 * (a pill whose far end has scrolled off the scale is not drawn at all).
 *
 * Knows nothing about Patterns, deliberately, as its three siblings do not. The caller maps — see
 * `respectPills`.
 */

/** Which way from `price` a pill is placed. Named for the screen, not for a market direction. */
export type PillSide = 'above' | 'below'

/**
 * Which mark to draw in the box.
 *
 * A property of the whole Series and not of one run — every group a Series reports was held against
 * the same kind of line — so it rides in the options rather than on `RespectPill`.
 */
export type PillShape = 'pill' | 'sawtooth'

export interface RespectPill {
  /**
   * What this pill *is*, for the caller's benefit and nothing else. Opaque here. Nothing hit-tests
   * a pill yet, so unlike the other three primitives this id is carried and never handed back —
   * kept anyway, because it is what a `v-for`-free canvas has instead of a key.
   */
  id: string
  /** The first candle of the run. The span covers this whole candle, not its centre. */
  from: UTCTimestamp
  /** The last candle of the run. May equal `from`: a run of one bar is a run. */
  to: UTCTimestamp
  /** The price the pill keeps its distance from — the run's own extreme. See `options.gap`. */
  price: number
  /** Which way from `price` to place it: `above` is up the screen, which is *down* in coordinates. */
  side: PillSide
  /**
   * Which stacked slot, counting outward from `price`. `0` sits at `options.gap`, `1` a
   * `options.pitch` further out, and so on.
   *
   * Assigned by the caller rather than worked out here, because whether two pills collide is a
   * question about the runs they draw and not about the canvas: the primitive sees a flat list and
   * has no way to know that two of them belong to different lines over the same bars.
   */
  lane: number
  color: string
}

export interface RespectPillsOptions {
  /** How tall a pill is, in CSS pixels. The sawtooth's peak-to-peak swing is the same number. */
  height: number
  /** How far clear of `price` lane `0` sits, in CSS pixels. */
  gap: number
  /** How much further out each additional lane sits, in CSS pixels. */
  pitch: number
  /** Corner radius, in CSS pixels. Read by the pill alone. */
  radius: number
  /**
   * Which of the two marks this instance draws.
   *
   * Fixed at construction, which is safe rather than lucky: the page renders one overlay component
   * per producer (`:key="overlay.producer"`), a producer names its source Pattern, and a primitive
   * therefore never outlives the answer to this question.
   */
  shape: PillShape
  /** One full tooth, in CSS pixels. Read by the sawtooth alone. */
  period: number
  /** Stroke width, in CSS pixels. Read by the sawtooth alone. */
  width: number
}

/** Where a pill lies in media (CSS) space: the same numbers the renderer fills, unscaled. */
interface PillBounds {
  left: number
  right: number
  top: number
  bottom: number
}

/**
 * One pill's rectangle.
 *
 * Whole candles horizontally, the convention `LevelSegments` and `LevelBoxes` both keep, so a run
 * of one bar is one candle wide rather than a zero-width line at its centre.
 *
 * Vertically it is the one departure: `price` becomes a coordinate and everything after that is
 * pixels. The price scale runs downwards — the note `level-boxes.ts` makes — so `above` subtracts
 * and `below` adds, and the pill's own height is subtracted as well on the way up so that `gap` is
 * the distance to its *near* edge on both sides.
 *
 * `null` means an end of the span or the price is outside what the scales can map. On the price
 * that is ordinary. On the ends it costs something worth naming: a run whose first bar has scrolled
 * past the left edge of the data is not drawn at all, rather than drawn short — the same reading
 * `LevelBoxes` gives a box whose anchor has gone, and the alternative would be a pill claiming a
 * span it does not have.
 */
function boundsOf(
  pill: RespectPill,
  timeScale: ITimeScaleApi<Time>,
  series: ISeriesApi<SeriesType, Time>,
  spacing: number,
  options: RespectPillsOptions,
): PillBounds | null {
  const from = timeScale.timeToCoordinate(pill.from)
  const to = timeScale.timeToCoordinate(pill.to)
  if (from === null || to === null) return null

  const y = series.priceToCoordinate(pill.price)
  if (y === null) return null

  const clear = options.gap + pill.lane * options.pitch
  const top = pill.side === 'above' ? y - clear - options.height : y + clear

  return {
    left: from - spacing / 2,
    right: to + spacing / 2,
    top,
    bottom: top + options.height,
  }
}

/**
 * The sawtooth, stroked inside the box `boundsOf` worked out — in bitmap coordinates, so every
 * length here has already been scaled.
 *
 * Three things are decided here and nowhere else:
 *
 * **The phase is anchored at the span's left edge**, not at the canvas origin. The span moves with
 * the candles it covers, so the teeth ride the bars; phased off the canvas they would crawl through
 * the mark on every pan, which is the one animation a static verdict must not have.
 *
 * **It is inset by half the stroke.** The box is the pill's box, and a stroke centred on its edges
 * would spill a pixel past the lane it was given — enough for two adjacent lanes to touch. Where
 * the box is thinner than the stroke itself the two rails collapse onto its midline: a flat line
 * rather than a shape drawn outside its allowance.
 *
 * **The last tooth is cut, not dropped.** The final vertex is interpolated onto `right`, so the
 * mark ends exactly where the run does. A span narrower than one tooth is then a single rising
 * stroke — the same instinct as the pill's radius clamp, which would rather come out a lozenge
 * than come out as nothing.
 */
function strokeSawtooth(
  context: CanvasRenderingContext2D,
  rect: { left: number, right: number, top: number, bottom: number },
  color: string,
  options: RespectPillsOptions,
  horizontalPixelRatio: number,
  verticalPixelRatio: number,
): void {
  const stroke = Math.max(1, Math.round(options.width * verticalPixelRatio))
  const step = Math.max(1, (options.period / 2) * horizontalPixelRatio)

  let high = rect.top + stroke / 2
  let low = rect.bottom - stroke / 2
  if (low < high) high = low = (rect.top + rect.bottom) / 2

  context.beginPath()
  context.moveTo(rect.left, low)

  const teeth = Math.max(1, Math.ceil((rect.right - rect.left) / step))
  for (let i = 1; i <= teeth; i++) {
    const x = rect.left + i * step
    const y = i % 2 === 0 ? low : high
    if (x >= rect.right) {
      const previous = i % 2 === 0 ? high : low
      const along = (rect.right - (x - step)) / step
      context.lineTo(rect.right, previous + (y - previous) * along)
      break
    }
    context.lineTo(x, y)
  }

  context.strokeStyle = color
  context.lineWidth = stroke
  context.lineCap = 'round'
  context.lineJoin = 'round'
  context.stroke()
}

class RespectPillsRenderer implements IPrimitivePaneRenderer {
  constructor(
    private readonly pills: readonly RespectPill[],
    private readonly options: RespectPillsOptions,
    private readonly chart: IChartApi | null,
    private readonly series: ISeriesApi<SeriesType, Time> | null,
  ) {}

  draw(target: RenderTarget): void {
    const { chart, series, pills, options } = this
    if (!chart || !series || pills.length === 0) return

    const timeScale = chart.timeScale()

    const spacing = barSpacing(timeScale)
    if (spacing === null) return

    // Bitmap space for the reason the other three primitives use it: a shape placed on CSS
    // coordinates lands between device pixels on a HiDPI screen and comes out soft. It matters
    // more here than anywhere else, because a 10px bar has no interior to hide a blurred edge in.
    target.useBitmapCoordinateSpace(({ context, horizontalPixelRatio, verticalPixelRatio }) => {
      for (const pill of pills) {
        const rect = boundsOf(pill, timeScale, series, spacing, options)
        if (rect === null) continue

        const left = Math.round(rect.left * horizontalPixelRatio)
        const right = Math.round(rect.right * horizontalPixelRatio)
        const top = Math.round(rect.top * verticalPixelRatio)
        const bottom = Math.round(rect.bottom * verticalPixelRatio)

        const width = right - left
        const height = bottom - top
        if (width <= 0 || height <= 0) continue

        if (options.shape === 'sawtooth') {
          strokeSawtooth(
            context,
            { left, right, top, bottom },
            pill.color,
            options,
            horizontalPixelRatio,
            verticalPixelRatio,
          )
          continue
        }

        // The first use of `roundRect` in this app — the three primitives before it draw squares,
        // straight lines and circles. Scaled like every other CSS-pixel dimension, and clamped to
        // half the shorter side so a pill narrower than its own corners comes out as a lozenge
        // rather than as nothing: the canvas throws on a radius that does not fit.
        const radius = Math.min(
          options.radius * verticalPixelRatio,
          width / 2,
          height / 2,
        )

        context.beginPath()
        context.roundRect(left, top, width, height, radius)
        context.fillStyle = pill.color
        context.fill()
      }
    })
  }
}

class RespectPillsPaneView implements IPrimitivePaneView {
  constructor(private readonly primitive: RespectPills) {}

  /**
   * Over everything, like `LevelSegments` and unlike `LevelBoxes`.
   *
   * There is nothing for it to bury: the pill sits in the empty air past the run's extreme, so
   * `'top'` costs no candle and guarantees the one thing it must never do, which is disappear
   * behind another Series' drawing at the same height.
   */
  zOrder(): PrimitivePaneViewZOrder {
    return 'top'
  }

  renderer(): IPrimitivePaneRenderer {
    return this.primitive.renderer()
  }
}

export class RespectPills implements ISeriesPrimitive<Time> {
  private pills: readonly RespectPill[] = []
  private chart: IChartApi | null = null
  private series: ISeriesApi<SeriesType, Time> | null = null
  private requestUpdate: (() => void) | null = null

  // Rebuilt on every data change, never mutated — the library caches `paneViews()` on the array's
  // identity. See the same note on `LevelSegments`.
  private views: readonly IPrimitivePaneView[]

  constructor(private readonly options: RespectPillsOptions) {
    this.views = [new RespectPillsPaneView(this)]
  }

  setPills(pills: readonly RespectPill[]): void {
    this.pills = pills
    this.views = [new RespectPillsPaneView(this)]
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
    return new RespectPillsRenderer(this.pills, this.options, this.chart, this.series)
  }

  // No `hitTest`. A pill is a label, not a handle: there is nothing to pin, unpin or drag, and a
  // primitive that answered the cursor without having anything to do about it would only take the
  // click away from the candle underneath.

  // No `autoscaleInfo` either, and here the omission is not free — the three primitives before this
  // one each state that their prices are a bar's own and so can never fall outside the candles'
  // range. That argument does not hold here: the offset is in pixels, and the scale has no way to
  // reserve pixels. A run whose extreme sits at the very top of the pane draws its pill clipped
  // against the edge rather than scrolling the candles down to make room. Accepted, because the
  // alternative is worse: converting the gap back into a price to pad the range would make padding
  // move with the zoom, and the price scale would jump every time somebody scrolled.
}
