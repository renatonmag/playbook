import type {
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesApi,
  ISeriesPrimitive,
  IChartApi,
  ITimeScaleApi,
  Logical,
  PrimitiveHoveredItem,
  PrimitivePaneViewZOrder,
  SeriesAttachedParameter,
  SeriesType,
  Time,
  UTCTimestamp,
} from 'lightweight-charts'

/**
 * A short horizontal line at one price, starting on one bar and running a fixed number of bars.
 *
 * The library has no built-in for this, and neither of the two things this app already draws can
 * stand in. A marker from `createSeriesMarkers` is a shape at a bar and has no length. A
 * `LineSeries` — what `useLineOverlay` wraps — holds **one value per time**, and these segments
 * collide on a time routinely: consecutive `LegWindow`s overlap, so two legs put points within a
 * few bars of each other, and the same bar can be a point of two legs outright. One of the two
 * would be dropped in silence. A series per segment is the other way out, and means a couple of
 * hundred series on a wide window.
 *
 * So this is a **series primitive** — the library's plugin interface, and the same machinery the
 * markers already use, reached directly rather than through a factory. It draws on the pane's
 * canvas, so nothing above constrains two segments from sharing a bar.
 *
 * Knows nothing about Patterns, deliberately, for the reason `useLineOverlay` gives for taking
 * `LineData` rather than Points: a drawing primitive that knew how to read a `price` off one
 * Point type would have to learn every one of them in turn. The caller maps.
 */
/**
 * The canvas handle a pane renderer is given, taken off the interface being implemented rather
 * than imported by name.
 *
 * It is `CanvasRenderingTarget2D` from `fancy-canvas`, which lightweight-charts depends on and
 * re-exports nothing of. pnpm does not hoist a transitive dependency, so naming the module here
 * would not resolve without adding a direct dependency on somebody else's implementation detail.
 * Reading it off `draw` costs nothing and cannot drift from the signature it has to match.
 */
type RenderTarget = Parameters<IPrimitivePaneRenderer['draw']>[0]

export interface LevelSegment {
  /**
   * What this segment *is*, for the caller's benefit and nothing else.
   *
   * Opaque here — the primitive never parses it. It is handed back through `hitTest` as the
   * hovered object's `externalId`, which is how a click on the canvas becomes a click on a
   * particular thing in the caller's world. See `extremeSegments`, which mints these.
   */
  id: string
  /** The bar the segment starts on. Its own candle is the **first** of the span, not the middle. */
  time: UTCTimestamp
  price: number
  color: string
  /**
   * Runs to the right-hand end of the data instead of stopping after `options.bars`.
   *
   * Length is the only thing a caller may vary per segment, and deliberately so: colour already
   * carries which of the three levels a line is, and width would read as a heavier claim about the
   * price rather than as "this one is selected".
   */
  extend?: boolean
}

export interface LevelSegmentsOptions {
  /** How many candles a segment covers, counting the one it starts on. */
  bars: number
  /** Stroke width in CSS pixels; scaled to the device's bitmap at draw time. */
  lineWidth: number
}

/** How far from a segment's line a cursor still counts as being on it, in CSS pixels. */
const HIT_TOLERANCE = 4

/** Where a segment lies in media (CSS) space: the same numbers the renderer strokes, unscaled. */
interface SegmentBounds {
  left: number
  right: number
  y: number
}

/**
 * The pixel distance between adjacent bar centres, or `null` when the scale cannot answer.
 *
 * Derived from the scale itself rather than taken from `TimeScaleOptions.barSpacing`: this is that
 * distance *by definition*, whatever the option means under zoom or conflation, and it is one call
 * per frame instead of one per segment. Both ends of the pair are off-screen at most zoom levels,
 * which is fine — the mapping is linear and defined outside the viewport.
 */
function barSpacing(timeScale: ITimeScaleApi<Time>): number | null {
  const first = timeScale.logicalToCoordinate(0 as Logical)
  const second = timeScale.logicalToCoordinate(1 as Logical)
  if (first === null || second === null) return null

  const spacing = second - first
  return Number.isFinite(spacing) && spacing > 0 ? spacing : null
}

/**
 * The right edge of the newest bar the attached series holds, or `null` when there is none.
 *
 * This is what "the current bar" means to a segment that runs to it, and it needs no clock and no
 * prop to say so: the candlestick series carries every bar including the one still open, and the
 * live feed's `update` is what moves it. Recomputed per frame beside `barSpacing`, so an extended
 * line grows with the feed on its own.
 */
function lastBarEdge(
  timeScale: ITimeScaleApi<Time>,
  series: ISeriesApi<SeriesType, Time>,
  spacing: number,
): number | null {
  const last = series.data().at(-1)
  if (last === undefined) return null

  const x = timeScale.timeToCoordinate(last.time)
  return x === null ? null : x + spacing / 2
}

/**
 * One segment's box, shared by the drawing and the hit test so the two cannot disagree about where
 * a level is. A second copy of this arithmetic would drift, and the symptom would be a line you can
 * see but cannot click.
 *
 * Whole candles, not centre to centre: the span starts at the left edge of its own bar and ends at
 * the right edge of the `bars`-th one, so what is drawn covers exactly the candles it claims to.
 *
 * An `extend` segment ends at `edge` instead — the current bar — but never *before* where the span
 * would have put it: `max`, so a level found a bar or two from the live edge does not come out
 * shorter than the stub it replaced.
 *
 * `null` means the bar or the price is outside what the scales can map — off-screen, not wrong.
 */
function boundsOf(
  segment: LevelSegment,
  timeScale: ITimeScaleApi<Time>,
  series: ISeriesApi<SeriesType, Time>,
  spacing: number,
  bars: number,
  edge: number | null,
): SegmentBounds | null {
  const x = timeScale.timeToCoordinate(segment.time)
  if (x === null) return null

  const y = series.priceToCoordinate(segment.price)
  if (y === null) return null

  const span = x + (bars - 0.5) * spacing

  return {
    left: x - spacing / 2,
    right: segment.extend && edge !== null ? Math.max(edge, span) : span,
    y,
  }
}

class LevelSegmentsRenderer implements IPrimitivePaneRenderer {
  constructor(
    private readonly segments: readonly LevelSegment[],
    private readonly options: LevelSegmentsOptions,
    private readonly chart: IChartApi | null,
    private readonly series: ISeriesApi<SeriesType, Time> | null,
  ) {}

  draw(target: RenderTarget): void {
    const { chart, series, segments, options } = this
    if (!chart || !series || segments.length === 0) return

    const timeScale = chart.timeScale()

    const spacing = barSpacing(timeScale)
    if (spacing === null) return

    const edge = lastBarEdge(timeScale, series, spacing)

    // Bitmap space rather than media space, which is what the library's own thin strokes use: a
    // 2px line placed on CSS coordinates lands between device pixels on a HiDPI screen and comes
    // out as a soft grey smear instead of a line.
    target.useBitmapCoordinateSpace(({ context, horizontalPixelRatio, verticalPixelRatio }) => {
      for (const segment of segments) {
        const box = boundsOf(segment, timeScale, series, spacing, options.bars, edge)
        if (box === null) continue

        const width = Math.max(1, Math.round(options.lineWidth * verticalPixelRatio))

        const left = box.left * horizontalPixelRatio
        const right = box.right * horizontalPixelRatio
        const top = Math.round(box.y * verticalPixelRatio) - Math.floor(width / 2)

        context.fillStyle = segment.color
        context.fillRect(Math.round(left), top, Math.round(right) - Math.round(left), width)
      }
    })
  }
}

class LevelSegmentsPaneView implements IPrimitivePaneView {
  constructor(private readonly primitive: LevelSegments) {}

  /** Above the candles: a level hidden behind a body is a level nobody can read. */
  zOrder(): PrimitivePaneViewZOrder {
    return 'top'
  }

  renderer(): IPrimitivePaneRenderer {
    return this.primitive.renderer()
  }
}

export class LevelSegments implements ISeriesPrimitive<Time> {
  private segments: readonly LevelSegment[] = []
  private chart: IChartApi | null = null
  private series: ISeriesApi<SeriesType, Time> | null = null
  private requestUpdate: (() => void) | null = null

  // Rebuilt on every data change, never mutated. The library caches `paneViews()` on the array's
  // **identity**, so handing back the same array forever would let a stale frame survive, and
  // building a fresh one every call would defeat the cache entirely. A new array exactly when
  // something changed is what the contract asks for.
  private views: readonly IPrimitivePaneView[]

  constructor(private readonly options: LevelSegmentsOptions) {
    this.views = [new LevelSegmentsPaneView(this)]
  }

  setSegments(segments: readonly LevelSegment[]): void {
    this.segments = segments
    this.views = [new LevelSegmentsPaneView(this)]
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
    return new LevelSegmentsRenderer(this.segments, this.options, this.chart, this.series)
  }

  /**
   * Which segment the cursor is on, so a click can name one.
   *
   * The library calls this on mouse move and hands the winner's `externalId` to every click and
   * crosshair subscriber. Without it a click on the pane carries a time and a price and nothing
   * about what was drawn there — and these segments overlap routinely, so "nearest by price at
   * this bar" reconstructed by a subscriber would be this arithmetic written a second time.
   *
   * One hit, not all of them: the interface asks for the top-most, and nearest wins because two
   * levels a pixel apart are two answers to "which line did I click" and only one can be right.
   */
  hitTest(x: number, y: number): PrimitiveHoveredItem | null {
    const { chart, series, segments, options } = this
    if (!chart || !series || segments.length === 0) return null

    const timeScale = chart.timeScale()

    const spacing = barSpacing(timeScale)
    if (spacing === null) return null

    const edge = lastBarEdge(timeScale, series, spacing)

    let hit: LevelSegment | null = null
    // Doubles as the running minimum and as the tolerance: a segment further than this is not a
    // hit at all, so the first comparison is the same test as every later one.
    let distance = HIT_TOLERANCE

    for (const segment of segments) {
      const box = boundsOf(segment, timeScale, series, spacing, options.bars, edge)
      if (box === null) continue
      if (x < box.left || x > box.right) continue

      const gap = Math.abs(y - box.y)
      if (gap > distance) continue

      hit = segment
      distance = gap
    }

    if (hit === null) return null

    return {
      externalId: hit.id,
      zOrder: 'top',
      cursorStyle: 'pointer',
      distance,
      // Line-style, per the interface's own scale — these are strokes, not markers.
      hitTestPriority: 1,
      itemType: 'primitive',
    }
  }

  // No `autoscaleInfo`. Every price handed to this primitive is already a `high`, `low` or
  // `close` of a bar the chart is drawing, so a segment can never fall outside the candles' own
  // range and has nothing to add to the scale. Stated rather than left as an omission: it runs on
  // every scroll, and it is the thing to reach for the day that stops being true.
}
