import type {
  IChartApi,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesApi,
  ISeriesPrimitive,
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
 * A straight line between two bars at two prices — the first **sloped** thing this app draws.
 *
 * Neither existing primitive can stand in: `LevelSegments` and `LevelBoxes` are horizontal by
 * construction, since a level and a band are both one price. And a `LineSeries` — what
 * `useLineOverlay` wraps — is worse here than it was for those two: it holds one value per time,
 * and these lines overlap on times constantly, because every pivot is the start of several of them
 * and the middle of several more.
 *
 * So it is a third **series primitive**, a sibling of the other two rather than an option on
 * either. What it shares with them is the time-axis arithmetic — `barSpacing` and `lastBarEdge`,
 * imported rather than copied, which is why `level-segments.ts` exports them.
 *
 * Knows nothing about Patterns, deliberately, the rule both siblings state: a primitive that could
 * read a `price` off one Point type would have to learn every one of them. The caller maps — see
 * `trendSegments`.
 */
export interface TrendEnd {
  time: UTCTimestamp
  price: number
}

export interface TrendSegment {
  /**
   * What this line *is*, for the caller's benefit and nothing else. Opaque here; handed back
   * through `hitTest` as the hovered object's `externalId`, which is how a click on the canvas
   * becomes a click on a particular line. See `trendSegmentId`, which mints these.
   */
  id: string
  /** The near end — the bar the line is drawn from, and the price on it. */
  from: TrendEnd
  /** The far end. Both are real bars of the window; see `extend` for what happens past this one. */
  to: TrendEnd
  color: string
  /**
   * Carry the line's own slope past `to`, out to the right-hand end of the data.
   *
   * Length is the only thing a caller may vary per line, the rule `LevelSegment` states: colour
   * already carries which Series a line belongs to, and width would read as a heavier claim about
   * the line rather than as "this one is selected".
   *
   * The projection is computed **in coordinate space** — the slope in pixels, run out to
   * `lastBarEdge` — and never by inventing a `time` past the last bar. That is what keeps this
   * clear of ADR-0003's "projection into the future": both Points stay anchored on real Candles
   * and only the drawing runs past the second one, exactly as `extend` has meant since
   * `LevelSegments`. It is also the right answer under a logarithmic price scale, where the
   * visually straight line is the one that is straight in pixels.
   */
  extend?: boolean
}

export interface TrendSegmentsOptions {
  /** Stroke width in CSS pixels; scaled to the device's bitmap at draw time. */
  lineWidth: number
}

/** How far from a line a cursor still counts as being on it, in CSS pixels. */
const HIT_TOLERANCE = 4

/** The grab handle's radius in CSS pixels — big enough to aim at, small enough not to hide the bar. */
const HANDLE_RADIUS = 4

/** The end the cursor is on, or carrying, drawn bigger: which dot a press would take hold of. */
const HANDLE_ACTIVE_RADIUS = 6

/** What the handle is ringed in: the chart's own background, so the dot reads as sitting on top. */
const HANDLE_RING = '#ffffff'

/**
 * The dots drawn on one segment: what a caller offers when a line's ends can be taken hold of.
 *
 * **Both** ends get one, parked on the bars they are anchored to. They do not slide along the line
 * under the cursor — a handle that moves when the thing it grabs does not is a handle that lies
 * about what a press will do, and it also left the near end looking like no part of the drawing you
 * could touch. `active` is the end within reach of the cursor, drawn larger, or the end a drag is
 * carrying; `null` means the line is hovered but neither end is close enough to grab.
 *
 * Its own field rather than a fifth thing a `TrendSegment` can be, because it is not a property of
 * a line: it is a property of the cursor, and it changes on mouse moves that reshape nothing.
 */
export interface TrendHandle {
  id: string
  active: 'from' | 'to' | null
}

/** Where a line lies in media (CSS) space: the same numbers the renderer strokes, unscaled. */
interface SegmentBounds {
  x1: number
  y1: number
  x2: number
  y2: number
}

/**
 * One line's endpoints in pixels, shared by the drawing and the hit test so the two cannot disagree
 * about where a line is. A second copy of this arithmetic would drift, and the symptom would be a
 * line you can see but cannot click — the failure `level-segments.ts` names.
 *
 * Bar *centres*, not edges, unlike the horizontal siblings: a line is drawn through two prices at
 * two bars, and the bar a pivot sits on is a point on the line rather than a span it covers.
 *
 * An `extend` line runs to `edge` instead, along its own slope — and never *before* where its far
 * pivot already put it, so a line whose second pivot is a bar or two from the live edge does not
 * come out shorter than it was.
 *
 * `null` means an endpoint's bar or price is outside what the scales can map. Note that a bar
 * merely scrolled off-screen still maps: the scales are linear and defined outside the viewport,
 * which is the same property `barSpacing` relies on.
 */
function boundsOf(
  segment: TrendSegment,
  timeScale: ITimeScaleApi<Time>,
  series: ISeriesApi<SeriesType, Time>,
  edge: number | null,
): SegmentBounds | null {
  const x1 = timeScale.timeToCoordinate(segment.from.time)
  if (x1 === null) return null

  const y1 = series.priceToCoordinate(segment.from.price)
  if (y1 === null) return null

  const x2 = timeScale.timeToCoordinate(segment.to.time)
  if (x2 === null) return null

  const y2 = series.priceToCoordinate(segment.to.price)
  if (y2 === null) return null

  // `x2 === x1` would be a line between two marks on one bar, which `trend_lines` never emits —
  // guarded anyway, because the division below is the one place a bad Point would become a `NaN`
  // silently swallowed by the canvas.
  if (!segment.extend || edge === null || edge <= x2 || x2 === x1) {
    return { x1, y1, x2, y2 }
  }

  return { x1, y1, x2: edge, y2: y1 + ((y2 - y1) * (edge - x1)) / (x2 - x1) }
}

/**
 * The point of the segment nearest `(x, y)`, in CSS pixels — clamped to the segment, so it is a
 * point of the line that is actually drawn and not of the infinite line through it.
 *
 * Its own function because the hit test wants the point and `distanceTo` wants the distance to it,
 * and because it is the clamping that makes a near miss past a line's end still count as a hit on
 * the line — which is what lets a cursor a few pixels beyond an endpoint reach that endpoint's dot.
 */
function projectOnto(bounds: SegmentBounds, x: number, y: number): { x: number, y: number } {
  const dx = bounds.x2 - bounds.x1
  const dy = bounds.y2 - bounds.y1
  const length = dx * dx + dy * dy

  // A degenerate segment is a point; `boundsOf` guards the case that could produce one, and this
  // is the arithmetic's own guard against dividing by zero.
  const along
    = length === 0
      ? 0
      : Math.max(0, Math.min(1, ((x - bounds.x1) * dx + (y - bounds.y1) * dy) / length))

  return { x: bounds.x1 + along * dx, y: bounds.y1 + along * dy }
}

/** How far `(x, y)` is from the line segment, in CSS pixels. */
function distanceTo(bounds: SegmentBounds, x: number, y: number): number {
  const nearest = projectOnto(bounds, x, y)
  return Math.hypot(x - nearest.x, y - nearest.y)
}

class TrendSegmentsRenderer implements IPrimitivePaneRenderer {
  constructor(
    private readonly segments: readonly TrendSegment[],
    private readonly handle: TrendHandle | null,
    private readonly options: TrendSegmentsOptions,
    private readonly chart: IChartApi | null,
    private readonly series: ISeriesApi<SeriesType, Time> | null,
  ) {}

  draw(target: RenderTarget): void {
    const { chart, series, segments, handle, options } = this
    if (!chart || !series || segments.length === 0) return

    const timeScale = chart.timeScale()

    const spacing = barSpacing(timeScale)
    if (spacing === null) return

    const edge = lastBarEdge(timeScale, series, spacing)

    // Bitmap space rather than media space, for the reason `LevelSegments` gives: a thin stroke
    // placed on CSS coordinates lands between device pixels on a HiDPI screen and comes out as a
    // soft grey smear. `stroke` rather than `fillRect`, because this one is not axis-aligned.
    target.useBitmapCoordinateSpace(({ context, horizontalPixelRatio, verticalPixelRatio }) => {
      context.lineWidth = Math.max(1, Math.round(options.lineWidth * verticalPixelRatio))

      // The handle's own line, kept from the pass over the lines rather than looked up again: one
      // search of the fan, and the dots are guaranteed to belong to a line that was actually drawn.
      let held: TrendSegment | null = null

      for (const segment of segments) {
        const bounds = boundsOf(segment, timeScale, series, edge)
        if (bounds === null) continue

        if (handle && segment.id === handle.id) held = segment

        context.beginPath()
        context.strokeStyle = segment.color
        context.moveTo(bounds.x1 * horizontalPixelRatio, bounds.y1 * verticalPixelRatio)
        context.lineTo(bounds.x2 * horizontalPixelRatio, bounds.y2 * verticalPixelRatio)
        context.stroke()
      }

      // Last, so they sit on top of every line they cross — a handle hidden under the fan is a
      // handle nobody would think to grab.
      if (!handle || held === null) return

      // The *anchors*, not the stroke's ends. A moved line is always extended, so `held.x2` is the
      // projection's tip against the right-hand edge rather than the candle the end is attached to
      // — a dot there would be a dot on no bar at all, nowhere near where a press has to land.
      // `edge: null` is how `boundsOf` says "draw this one unextended".
      const anchors = boundsOf(held, timeScale, series, null)
      if (anchors === null) return

      // The line's own colour, ringed in the pane's background: a bare dot in the fan's hue reads
      // as a thickening of the stroke, and the ring is what makes it a thing to take hold of.
      context.fillStyle = held.color
      context.strokeStyle = HANDLE_RING
      context.lineWidth = Math.max(1, Math.round(verticalPixelRatio))

      const dots: [end: 'from' | 'to', x: number, y: number][] = [
        ['from', anchors.x1, anchors.y1],
        ['to', anchors.x2, anchors.y2],
      ]

      for (const [end, x, y] of dots) {
        const radius = (end === handle.active ? HANDLE_ACTIVE_RADIUS : HANDLE_RADIUS) * verticalPixelRatio

        context.beginPath()
        context.arc(x * horizontalPixelRatio, y * verticalPixelRatio, radius, 0, Math.PI * 2)
        context.fill()
        context.stroke()
      }
    })
  }
}

class TrendSegmentsPaneView implements IPrimitivePaneView {
  /**
   * Above the candles: a line hidden behind a body is a line nobody can read — `LevelSegments`'
   * reasoning. It also keeps this clear of the trap `level-boxes.ts` documents, where a `'bottom'`
   * hit is only reported when nothing else in the pane matched and the candlestick series swallows
   * every click over a bar's column.
   */
  zOrder(): PrimitivePaneViewZOrder {
    return 'top'
  }

  constructor(private readonly primitive: TrendSegments) {}

  renderer(): IPrimitivePaneRenderer {
    return this.primitive.renderer()
  }
}

export class TrendSegments implements ISeriesPrimitive<Time> {
  private segments: readonly TrendSegment[] = []
  private handle: TrendHandle | null = null
  private chart: IChartApi | null = null
  private series: ISeriesApi<SeriesType, Time> | null = null
  private requestUpdate: (() => void) | null = null

  // Rebuilt on every data change, never mutated — the library caches `paneViews()` on the array's
  // **identity**, so one array forever lets a stale frame survive and a fresh one per call defeats
  // the cache. Same contract both siblings honour.
  private views: readonly IPrimitivePaneView[]

  constructor(private readonly options: TrendSegmentsOptions) {
    this.views = [new TrendSegmentsPaneView(this)]
  }

  setSegments(segments: readonly TrendSegment[]): void {
    this.segments = segments
    this.views = [new TrendSegmentsPaneView(this)]
    this.requestUpdate?.()
  }

  /**
   * Offer — or withdraw — the grab handle on one line.
   *
   * Its own method rather than an argument to `setSegments`, and this is the reason it is worth
   * one: which line is hovered and which of its ends is in reach change on every mouse move, while
   * the lines themselves change only when the Pattern, the filters or the pins do. Reshaping the
   * whole fan to grow a dot by two pixels is work the cursor should not cost.
   *
   * An unchanged handle is dropped on the floor, and that is not an optimisation — it is what keeps
   * the pane from repainting forever. The library re-fires `crosshairMoved` after every repaint, so
   * a caller that answers each of those by setting the handle it already holds would ask for
   * another repaint, which fires another crosshair, and the fan is redrawn for as long as the
   * cursor rests anywhere on the pane.
   */
  setHandle(handle: TrendHandle | null): void {
    const held = this.handle
    if (held === handle) return
    if (held && handle && held.id === handle.id && held.active === handle.active) return

    this.handle = handle
    this.views = [new TrendSegmentsPaneView(this)]
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
    return new TrendSegmentsRenderer(
      this.segments,
      this.handle,
      this.options,
      this.chart,
      this.series,
    )
  }

  /**
   * Which line the cursor is on, so a click can name one.
   *
   * The library calls this on mouse move and hands the winner's `externalId` to every click
   * subscriber. Nearest wins, because two lines a pixel apart are two answers to "which line did I
   * click" and only one can be right — and these cross each other constantly, far more than the
   * levels do, which is what makes the clamped point-to-segment distance worth the arithmetic
   * over the levels' `Math.abs(y - box.y)`.
   */
  hitTest(x: number, y: number): PrimitiveHoveredItem | null {
    const { chart, series, segments } = this
    if (!chart || !series || segments.length === 0) return null

    const timeScale = chart.timeScale()

    const spacing = barSpacing(timeScale)
    if (spacing === null) return null

    const edge = lastBarEdge(timeScale, series, spacing)

    let hit: TrendSegment | null = null
    // Doubles as the running minimum and as the tolerance, the form `LevelSegments` uses: a line
    // further than this is not a hit at all, so the first comparison is every later one.
    let distance = HIT_TOLERANCE

    for (const segment of segments) {
      const bounds = boundsOf(segment, timeScale, series, edge)
      if (bounds === null) continue

      const gap = distanceTo(bounds, x, y)
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

  // No `autoscaleInfo`, for the reason both siblings state: every price handed here is a `high` or
  // a `low` of a bar the chart is already drawing, so a line between two of them cannot fall
  // outside the candles' own range. An *extended* line can leave it visually — the projection runs
  // past its far pivot — but that is a drawing, not a price, and the scale is right to ignore it.
}
