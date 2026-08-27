import type {
  Coordinate,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesApi,
  ISeriesPrimitive,
  IChartApi,
  Logical,
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
  /** The bar the segment starts on. Its own candle is the **first** of the span, not the middle. */
  time: UTCTimestamp
  price: number
  color: string
}

export interface LevelSegmentsOptions {
  /** How many candles a segment covers, counting the one it starts on. */
  bars: number
  /** Stroke width in CSS pixels; scaled to the device's bitmap at draw time. */
  lineWidth: number
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

    // The pixel distance between adjacent bar centres, read once for the whole frame.
    //
    // Derived from the scale itself rather than taken from `TimeScaleOptions.barSpacing`: this is
    // that distance *by definition*, whatever the option means under zoom or conflation, and it
    // is one call per draw instead of one per segment. Both ends of the pair are off-screen at
    // most zoom levels, which is fine — the mapping is linear and defined outside the viewport.
    const first = timeScale.logicalToCoordinate(0 as Logical)
    const second = timeScale.logicalToCoordinate(1 as Logical)
    if (first === null || second === null) return

    const spacing = second - first
    if (!Number.isFinite(spacing) || spacing <= 0) return

    // Bitmap space rather than media space, which is what the library's own thin strokes use: a
    // 2px line placed on CSS coordinates lands between device pixels on a HiDPI screen and comes
    // out as a soft grey smear instead of a line.
    target.useBitmapCoordinateSpace(({ context, horizontalPixelRatio, verticalPixelRatio }) => {
      const width = Math.max(1, Math.round(options.lineWidth * verticalPixelRatio))

      for (const segment of this.segments) {
        const x = timeScale.timeToCoordinate(segment.time)
        // The bar is outside the loaded range, so there is no coordinate to draw at. Skipped in
        // silence: it is off-screen, not wrong.
        if (x === null) continue

        const y = series.priceToCoordinate(segment.price)
        if (y === null) continue

        // Whole candles, not centre to centre: the span starts at the left edge of its own bar
        // and ends at the right edge of the `bars`-th one, so what is drawn covers exactly the
        // candles it claims to.
        const left = (x - spacing / 2) * horizontalPixelRatio
        const right = (x + (options.bars - 0.5) * spacing) * horizontalPixelRatio
        const top = Math.round((y as Coordinate) * verticalPixelRatio) - Math.floor(width / 2)

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

  // No `autoscaleInfo`. Every price handed to this primitive is already a `high`, `low` or
  // `close` of a bar the chart is drawing, so a segment can never fall outside the candles' own
  // range and has nothing to add to the scale. Stated rather than left as an omission: it runs on
  // every scroll, and it is the thing to reach for the day that stops being true.
}
