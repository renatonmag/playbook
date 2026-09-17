import type {
  IChartApi,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesApi,
  ISeriesPrimitive,
  PrimitiveHoveredItem,
  PrimitivePaneViewZOrder,
  SeriesAttachedParameter,
  SeriesType,
  Time,
  UTCTimestamp,
} from 'lightweight-charts'
import type { RenderTarget } from './level-segments'
import { distanceTo, type SegmentBounds } from './trend-segments'

/**
 * The measuring line: two ends the reader placed by hand, and a label saying how far apart they are.
 *
 * A fourth primitive rather than an option on `TrendSegments`, which it otherwise resembles down to
 * the arithmetic — and the reason is what the two drawings *are*. A trend line is a claim about the
 * market that the engine proposed and a drag corrects, so it is hinged on Points, it extends to the
 * live edge, it snaps to a bar's open/high/low/close, and its id says which Pattern it came from. A
 * ruler is a question the reader asked: it comes from nowhere, it ends exactly where it was put,
 * its price is whatever the cursor was over rather than any candle's, and the only thing it can say
 * is its own length. Folding the second into the first would mean a `measuring?: boolean` reaching
 * into every branch of a class whose whole subject is Pattern lines.
 *
 * What it does share is `distanceTo` and `SegmentBounds`, imported rather than copied for the reason
 * `level-segments.ts` states about `barSpacing`: a second copy of point-to-segment distance is a
 * second answer to "which line did I click", and the two would drift.
 *
 * Knows nothing about points, bars, or Portuguese. The label arrives formatted — see `rulerLabel`.
 */
export interface RulerEnd {
  /** The bar this end sits on. X snaps to a bar centre so a bar count is a whole number. */
  time: UTCTimestamp
  /**
   * The price it sits at — read off the cursor, not off the bar.
   *
   * Deliberately unsnapped, unlike `TrendLinesOverlay`'s ends. A ruler measures to wherever you are
   * looking, which is usually not an open, high, low or close; snapping it would silently answer a
   * different question from the one asked, and the error would be invisible.
   */
  price: number
}

export interface RulerMark {
  /**
   * Minted once when the ruler is made and kept for its whole life, including across drags —
   * unlike a trend line, whose id is its geometry and so is re-minted every time an end lands on
   * another bar. Nothing here is derived from a Point, so there is nothing for geometry to say.
   */
  id: string
  from: RulerEnd
  to: RulerEnd
  /** What the box at the far end reads. Already formatted; this class cannot compute it. */
  label: string
  /** The one being worked on: drawn solid and wearing its two dots. The rest are dashed and bare. */
  selected: boolean
  /**
   * A measurement still being taken — the first end placed and the second following the cursor.
   *
   * Drawn like any other, and it is the caller that keeps it out of `hitTest`'s reach by never
   * giving it an id anything can select. Its own flag only because a draft is never the selected
   * one and so would otherwise lose its dots at the moment they say most about what a click does.
   */
  draft?: boolean
}

/** The dots on one ruler; `active` is the end a press would take hold of. See `TrendHandle`. */
export interface RulerHandle {
  id: string
  active: 'from' | 'to' | null
}

export interface RulerOptions {
  /** Stroke width in CSS pixels; scaled to the device's bitmap at draw time. */
  lineWidth: number
  /** The line, the dots and the label's background. One colour: a ruler belongs to no Series. */
  color: string
}

/** How far from a ruler a cursor still counts as being on it, in CSS pixels. `TrendSegments`'. */
const HIT_TOLERANCE = 4

/** The grab handle's radius in CSS pixels, and the larger one for the end within reach. */
const HANDLE_RADIUS = 4
const HANDLE_ACTIVE_RADIUS = 6

/** What the handle is ringed in: the pane's own background, so the dot reads as sitting on top. */
const HANDLE_RING = '#ffffff'

/** The dash a ruler that is not selected is drawn in, in CSS pixels: on, off. */
const DASH: [number, number] = [4, 3]

/** The label's box, in CSS pixels. */
const LABEL_FONT = '11px ui-sans-serif, system-ui, sans-serif'
const LABEL_PADDING_X = 6
const LABEL_PADDING_Y = 4
const LABEL_RADIUS = 4
/** How far the box is held off the end it belongs to, so the dot under it stays visible. */
const LABEL_GAP = 10
const LABEL_TEXT = '#ffffff'

/**
 * A ruler's two ends in pixels, shared by the drawing, the label and the hit test so none of the
 * three can disagree about where the line is — `boundsOf`'s reasoning in `trend-segments.ts`,
 * without the `extend` branch: a ruler is exactly as long as it was drawn.
 *
 * `null` means an end's bar or price is outside what the scales can map.
 */
function boundsOf(
  mark: RulerMark,
  chart: IChartApi,
  series: ISeriesApi<SeriesType, Time>,
): SegmentBounds | null {
  const timeScale = chart.timeScale()

  const x1 = timeScale.timeToCoordinate(mark.from.time)
  if (x1 === null) return null

  const y1 = series.priceToCoordinate(mark.from.price)
  if (y1 === null) return null

  const x2 = timeScale.timeToCoordinate(mark.to.time)
  if (x2 === null) return null

  const y2 = series.priceToCoordinate(mark.to.price)
  if (y2 === null) return null

  return { x1, y1, x2, y2 }
}

class RulersRenderer implements IPrimitivePaneRenderer {
  constructor(
    private readonly marks: readonly RulerMark[],
    private readonly handle: RulerHandle | null,
    private readonly options: RulerOptions,
    private readonly chart: IChartApi | null,
    private readonly series: ISeriesApi<SeriesType, Time> | null,
  ) {}

  draw(target: RenderTarget): void {
    const { chart, series, marks, handle, options } = this
    if (!chart || !series || marks.length === 0) return

    // Read once, outside both passes: the label pass needs the same numbers the stroke pass used,
    // and asking the scales twice across two coordinate spaces is how a box ends up beside a line
    // it is supposed to be attached to.
    const drawn: [mark: RulerMark, bounds: SegmentBounds][] = []
    for (const mark of marks) {
      const bounds = boundsOf(mark, chart, series)
      if (bounds !== null) drawn.push([mark, bounds])
    }

    if (drawn.length === 0) return

    // Bitmap space for the strokes, for the reason every sibling gives: a thin line placed on CSS
    // coordinates lands between device pixels on a HiDPI screen and comes out a soft grey smear.
    target.useBitmapCoordinateSpace(({ context, horizontalPixelRatio, verticalPixelRatio }) => {
      for (const [mark, bounds] of drawn) {
        context.beginPath()
        context.strokeStyle = options.color
        context.lineWidth = Math.max(1, Math.round(options.lineWidth * verticalPixelRatio))

        // Solid is what "this is the one selected" says, here as on the trend lines — except that a
        // draft is solid too, because it is the one the cursor is carrying and nothing else on the
        // chart is competing with it for attention.
        context.setLineDash(
          mark.selected || mark.draft
            ? []
            : DASH.map(step => Math.round(step * horizontalPixelRatio)),
        )

        context.moveTo(bounds.x1 * horizontalPixelRatio, bounds.y1 * verticalPixelRatio)
        context.lineTo(bounds.x2 * horizontalPixelRatio, bounds.y2 * verticalPixelRatio)
        context.stroke()

        // Left set, the next primitive on the pane would inherit it — the canvas is shared.
        context.setLineDash([])
      }

      // After every line, so a dot is never hidden under one a ruler happens to cross.
      for (const [mark, bounds] of drawn) {
        // The dots are the selected ruler's — that is what says it is selected — and the draft's,
        // where they show the end just placed and the end being carried.
        if (!mark.selected && !mark.draft) continue

        context.fillStyle = options.color
        context.strokeStyle = HANDLE_RING
        context.lineWidth = Math.max(1, Math.round(verticalPixelRatio))

        const active = handle && handle.id === mark.id ? handle.active : null

        const dots: [end: 'from' | 'to', x: number, y: number][] = [
          ['from', bounds.x1, bounds.y1],
          ['to', bounds.x2, bounds.y2],
        ]

        for (const [end, x, y] of dots) {
          const radius = (end === active ? HANDLE_ACTIVE_RADIUS : HANDLE_RADIUS) * verticalPixelRatio

          context.beginPath()
          context.arc(x * horizontalPixelRatio, y * verticalPixelRatio, radius, 0, Math.PI * 2)
          context.fill()
          context.stroke()
        }
      }
    })

    // The first text this chart draws, and the one thing here that is *not* in bitmap space: a font
    // size is a CSS measurement and `measureText` answers in the same units the layout is written
    // in, so a box sized in media space fits its text on every device ratio without the scaling
    // being spelled out at each of the eight places a box has a corner.
    target.useMediaCoordinateSpace(({ context, mediaSize }) => {
      context.font = LABEL_FONT
      context.textBaseline = 'middle'

      for (const [mark, bounds] of drawn) {
        if (mark.label === '') continue

        const width = context.measureText(mark.label).width + LABEL_PADDING_X * 2
        const height = 11 + LABEL_PADDING_Y * 2

        // Carried away from the line along its own direction, so the box sits past the second end
        // rather than on top of the dot the reader is about to grab. A ruler with both ends on one
        // bar has no direction to speak of; it gets pushed straight right.
        const dx = bounds.x2 - bounds.x1
        const dy = bounds.y2 - bounds.y1
        const length = Math.hypot(dx, dy)
        const ux = length === 0 ? 1 : dx / length
        const uy = length === 0 ? 0 : dy / length

        // Carried out by half the box as well as by the gap, so the box *clears* the end rather
        // than being centred on a point a little past it: at `LABEL_GAP` alone it sat on top of the
        // dot the reader is about to grab, which is the one thing the label must not cover.
        //
        // Clamped into the pane rather than flipped to the line's other side: a box that jumps
        // across the line as the cursor nears an edge is a box that moves for reasons the reader
        // did not cause, and mid-drag that reads as the measurement itself having changed.
        const x = Math.min(
          Math.max(bounds.x2 + ux * (LABEL_GAP + width / 2) - width / 2, 2),
          Math.max(2, mediaSize.width - width - 2),
        )
        const y = Math.min(
          Math.max(bounds.y2 + uy * (LABEL_GAP + height / 2) - height / 2, 2),
          Math.max(2, mediaSize.height - height - 2),
        )

        context.beginPath()
        context.fillStyle = options.color
        context.roundRect(x, y, width, height, LABEL_RADIUS)
        context.fill()

        context.fillStyle = LABEL_TEXT
        context.fillText(mark.label, x + LABEL_PADDING_X, y + height / 2)
      }
    })
  }
}

class RulersPaneView implements IPrimitivePaneView {
  /** Above the candles, for `TrendSegments`' reason — and a label behind a body reads as nothing. */
  zOrder(): PrimitivePaneViewZOrder {
    return 'top'
  }

  constructor(private readonly primitive: Rulers) {}

  renderer(): IPrimitivePaneRenderer {
    return this.primitive.renderer()
  }
}

export class Rulers implements ISeriesPrimitive<Time> {
  private marks: readonly RulerMark[] = []
  private handle: RulerHandle | null = null
  private chart: IChartApi | null = null
  private series: ISeriesApi<SeriesType, Time> | null = null
  private requestUpdate: (() => void) | null = null

  // Rebuilt on every change, never mutated: the library caches `paneViews()` on the array's
  // identity, so one array forever lets a stale frame survive. Every sibling honours this.
  private views: readonly IPrimitivePaneView[]

  constructor(private readonly options: RulerOptions) {
    this.views = [new RulersPaneView(this)]
  }

  setRulers(marks: readonly RulerMark[]): void {
    this.marks = marks
    this.views = [new RulersPaneView(this)]
    this.requestUpdate?.()
  }

  /**
   * Offer — or withdraw — the larger dot on one end.
   *
   * Its own method, and an unchanged handle is dropped on the floor, for the reason
   * `TrendSegments.setHandle` spells out at length: the library re-fires `crosshairMoved` after
   * every repaint, so answering each of those by setting the handle already held would ask for
   * another repaint, and the pane would redraw for as long as the cursor rested on it.
   */
  setHandle(handle: RulerHandle | null): void {
    const held = this.handle
    if (held === handle) return
    if (held && handle && held.id === handle.id && held.active === handle.active) return

    this.handle = handle
    this.views = [new RulersPaneView(this)]
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
    return new RulersRenderer(this.marks, this.handle, this.options, this.chart, this.series)
  }

  /**
   * Which ruler the cursor is on, so a click can name one. Nearest wins, as everywhere else.
   *
   * A draft is skipped: the click that would "select" it is the click that finishes it, and
   * reporting it here would have the overlay claim its own unfinished line.
   */
  hitTest(x: number, y: number): PrimitiveHoveredItem | null {
    const { chart, series, marks } = this
    if (!chart || !series || marks.length === 0) return null

    let hit: RulerMark | null = null
    // Doubles as the running minimum and as the tolerance: further than this is not a hit at all.
    let distance = HIT_TOLERANCE

    for (const mark of marks) {
      if (mark.draft) continue

      const bounds = boundsOf(mark, chart, series)
      if (bounds === null) continue

      const gap = distanceTo(bounds, x, y)
      if (gap > distance) continue

      hit = mark
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

  // No `autoscaleInfo`, and here the reason is stronger than the siblings': a ruler's prices come
  // from wherever the cursor was, so letting them widen the scale would let a measurement move the
  // candles it was taken against.
}
