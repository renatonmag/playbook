<script setup lang="ts">
import type {
  IChartApi,
  ISeriesApi,
  MouseEventParams,
  SeriesType,
  Time,
  UTCTimestamp,
} from 'lightweight-charts'
import type { Candle } from '~/types/candle'
import type { Ruler } from '~/utils/ruler'
import type { RulerEnd, RulerMark } from '~/utils/ruler-segments'
import { Rulers } from '~/utils/ruler-segments'

/**
 * The ruler: a line the reader draws between two points of the chart, labelled with how far apart
 * they are in points and in bars.
 *
 * Renders no markup, reaches the chart through `inject` and draws through the chart API — the same
 * shape as every overlay here. What makes it not an overlay in the page's registry is that there is
 * no Series behind it: it draws nothing the engine produced, has no Points, no colour from the
 * palette and no producer. It joins the page the way the wick tool does, through a key of its own.
 *
 * Two clicks make one. The first anchors an end on the bar under the cursor; the second drops the
 * other end and the measurement is finished — at which point the tool **turns itself off**, so the
 * clicks that follow mean what they mean with no tool armed. Arming it again is a press on the
 * ruler icon, deliberately: a tool that re-armed would turn every later click on the pane into the
 * start of a line nobody asked for, and the pane's clicks already mean three other things.
 *
 * Both ends stay draggable afterwards, and the drag is `TrendLinesOverlay`'s down to the constants
 * — the threshold before a press becomes a drag, suspending the chart's own pan on the *press*
 * rather than at the threshold, `Escape` abandoning, and the synthetic click the library makes out
 * of a release being claimed rather than swallowed. Each of those is there for a reason that
 * component documents at the line; what differs here is only where an end may land.
 *
 * Which is: the bar under the cursor, at the price under the cursor. X snaps so that a bar count is
 * a whole number; Y does not, for the reason `RulerEnd.price` gives — a ruler measures to where you
 * are looking, and snapping it to the nearest open/high/low/close would answer a different question
 * without saying so. This is the only thing in the app that reads `coordinateToPrice`.
 *
 * `rulers` is the page's list and not this component's, for the same reason a pin is: the `Trash`
 * floating over the pane has to be able to reach one, and that bar is about whatever is selected
 * across every drawing on the chart. What lives here is only what is mid-gesture — the draft and
 * the drag — which is over before anything else could want to read it.
 */
const props = defineProps<{
  /** The finished measurements, oldest first. Several may sit on the chart at once. */
  rulers: Ruler[]
  /**
   * The bars the chart is showing, by `time` — `barsByTime`. Read to refuse an end past the last
   * candle, where the library reports no bar and there is nothing to anchor to.
   */
  bars: ReadonlyMap<number, Candle>
  /**
   * The same bars by position, which is what a bar *count* is. See `barsBetween` for why elapsed
   * time divided by the timeframe is the wrong answer.
   */
  index: ReadonlyMap<number, number>
  /** The tool button's state: a measurement is being taken. */
  armed: boolean
  /** Which ruler the page holds selected, if any — `selectedIn`'s half of the page's selection. */
  selected: string | null
}>()

const emit = defineEmits<{
  /** A second click landed: this is the finished measurement. */
  add: [ruler: Ruler]
  /** An end was dragged somewhere else. Same id, new geometry. */
  move: [ruler: Ruler]
  /** A ruler was clicked — or, with `null`, the selection handed here no longer resolves. */
  select: [id: string | null]
  /** The measurement is finished, or was abandoned: the tool goes back off. */
  disarm: []
}>()

const chart = inject(CHART)!
const candleSeries = inject(CANDLE_SERIES)!

/** How near an end's dot a cursor has to be for a press to take hold of it, in CSS pixels. */
const GRAB_RADIUS = 9

/** How far the cursor must travel with the button down before a press becomes a drag. */
const GRAB_THRESHOLD = 3

/** The one colour a ruler is drawn in: it belongs to no Series, so it takes none of the palette. */
const RULER_COLOR = '#0f172a'

/**
 * The measurement being taken: the first end, and the second following the cursor.
 *
 * Here rather than on the page, unlike the finished list, because it is a gesture and not a
 * drawing — nothing outside this component can act on half a ruler, and a draft that outlived the
 * overlay would be a line the reader cannot finish or remove.
 */
const draft = ref<{ from: RulerEnd, to: RulerEnd } | null>(null)

/** The end being carried, with the whole ruler it belongs to so the drawing can follow it. */
const dragging = ref<(Ruler & { end: 'from' | 'to', changed: boolean }) | null>(null)

/** A button held on an end that has not travelled far enough to be a drag yet. */
let pressed: { ruler: Ruler, end: 'from' | 'to', x: number, y: number } | null = null

/** The end a press would take hold of right now, as the cursor last reported it. */
let grabbable: { ruler: Ruler, end: 'from' | 'to' } | null = null

/**
 * The ruler a release just finished moving, so the click the library makes out of that release can
 * be claimed rather than left to deselect what the gesture was about. `TrendLinesOverlay`'s.
 */
let justDragged: string | null = null

/** The ids currently handed to the primitive, which is exactly what a click can name. */
let drawnIds = new Set<string>()

/**
 * Where an end would land for this cursor: the bar under it, at the price under it.
 *
 * `null` past the last candle or off the pane — an end has to sit on a bar, or the bar count it is
 * half of would mean nothing.
 */
function endAt(param: MouseEventParams<Time>): RulerEnd | null {
  const series = candleSeries.value
  const y = param.point?.y
  if (!series || y === undefined) return null
  if (typeof param.time !== 'number') return null
  if (!props.bars.has(param.time)) return null

  const price = series.coordinateToPrice(y)
  if (price === null) return null

  return { time: param.time as UTCTimestamp, price }
}

/** Which of a ruler's two ends is within reach of the cursor, or `null`. `TrendLinesOverlay`'s. */
function nearestEnd(ruler: Ruler, point: { x: number, y: number }): 'from' | 'to' | null {
  const series = candleSeries.value
  const timeScale = chart.value?.timeScale()
  if (!series || !timeScale) return null

  let best: 'from' | 'to' | null = null
  let nearest = GRAB_RADIUS

  for (const end of ['from', 'to'] as const) {
    const at = ruler[end]

    const x = timeScale.timeToCoordinate(at.time)
    if (x === null) continue

    const y = series.priceToCoordinate(at.price)
    if (y === null) continue

    const gap = Math.hypot(x - point.x, y - point.y)
    if (gap > nearest) continue

    best = end
    nearest = gap
  }

  return best
}

/** The ruler as it stands right now: the page's copy, unless a drag is carrying one of its ends. */
function current(ruler: Ruler): Ruler {
  const drag = dragging.value
  return drag && drag.id === ruler.id ? { id: drag.id, from: drag.from, to: drag.to } : ruler
}

/** What the primitive draws: the finished rulers, plus the one being taken. */
function marksToDraw(): RulerMark[] {
  const marks: RulerMark[] = props.rulers.map((ruler) => {
    const at = current(ruler)
    return {
      id: at.id,
      from: at.from,
      to: at.to,
      label: rulerLabel(at.from, at.to, barsBetween(at.from.time, at.to.time, props.index)),
      selected: at.id === props.selected,
    }
  })

  const open = draft.value
  if (open) {
    marks.push({
      // Never selectable and never emitted, so the id only has to be one nothing else can hold.
      id: 'ruler:draft',
      from: open.from,
      to: open.to,
      label: rulerLabel(open.from, open.to, barsBetween(open.from.time, open.to.time, props.index)),
      selected: false,
      draft: true,
    })
  }

  return marks
}

/**
 * The cursor moved. One of three things, in this order: an end is being carried, a measurement is
 * being taken, or the selected ruler is being offered a grab.
 *
 * The `sourceEvent` guard is `TrendLinesOverlay`'s and is load-bearing for the same reason — the
 * library re-fires this after every repaint, including the repaints this handler itself asks for,
 * and those echoes carry no `hoveredInfo` at all. Acting on one would throw away what the real
 * mouse move established a frame earlier, and with a rubber-banding line every frame is one.
 */
function onCrosshairMove(param: MouseEventParams<Time>) {
  if (!param.sourceEvent) return

  if (dragging.value) {
    dragTo(param)
    return
  }

  const open = draft.value
  if (open) {
    const end = endAt(param)
    if (!end) return

    // Every move inside one bar at one pixel reports the same end; only a change is worth a repaint.
    if (end.time === open.to.time && end.price === open.to.price) return

    draft.value = { from: open.from, to: end }
    return
  }

  // The grab affordance, read off the *selection* rather than off what the cursor is over: the
  // selected ruler's dots are already drawn, and all the cursor decides is which of them a press
  // would take. Pushed straight at the primitive, not through the watcher — a dot growing by two
  // pixels is not a reason to rebuild every mark on the pane.
  const ruler = props.selected === null
    ? null
    : props.rulers.find(item => item.id === props.selected) ?? null

  const end = ruler && param.point ? nearestEnd(ruler, param.point) : null
  grabbable = ruler && end ? { ruler, end } : null
  if (ruler) primitive?.setHandle({ id: ruler.id, active: end })
}

/** The cursor moved with an end in hand: put that end where it now is. */
function dragTo(param: MouseEventParams<Time>) {
  const drag = dragging.value
  if (!drag) return

  const end = endAt(param)
  if (!end) return

  const held = drag[drag.end]
  if (end.time === held.time && end.price === held.price) return

  dragging.value = drag.end === 'from'
    ? { ...drag, from: end, changed: true }
    : { ...drag, to: end, changed: true }
}

/**
 * A click on the pane. While armed it is one half of a measurement; otherwise it is a ruler being
 * selected, or nothing this component has anything to say about.
 *
 * `hoveredInfo.objectId` is whatever the primitives' hit tests last returned, and *every* primitive
 * on the chart reports into that one field — hence the `drawnIds` check, which is not a formality
 * with five of them on the pane. It is also a mouse affordance: a touch that never hovers leaves it
 * unset, which is the same caveat the other overlays carry.
 */
function onClick(param: MouseEventParams<Time>) {
  // The click the library makes out of a drag's release. It named a ruler but did not mean it, and
  // it is claimed rather than dropped, because an unclaimed click is what deselects.
  if (justDragged !== null) {
    emit('select', justDragged)
    justDragged = null
    return
  }

  if (props.armed) {
    const end = endAt(param)
    if (!end) return

    const open = draft.value
    if (!open) {
      // Nothing is emitted, so this click is deliberately left unclaimed — and the page's
      // `onPaneClick` refuses to read an unclaimed click as a deselect while the tool is armed.
      // Half a ruler is not a selection, and it must not cut the replay either.
      draft.value = { from: end, to: end }
      return
    }

    const ruler: Ruler = { id: nextRulerId(), from: open.from, to: end }
    draft.value = null
    emit('add', ruler)

    // The tool is for one measurement. Off again before the selection lands, so the button's state
    // and the pane's behaviour change together on the click that finished the line.
    emit('disarm')
    emit('select', ruler.id)
    return
  }

  const id = param.hoveredInfo?.objectId
  if (typeof id === 'string' && drawnIds.has(id)) emit('select', id)
}

/**
 * The button went down on an end that can be carried. Not a drag yet — see `GRAB_THRESHOLD`.
 *
 * DOM events rather than the chart's own subscriptions, which report clicks and crosshair moves and
 * have nothing to say about a button being held. `chartElement()` is the library's own node, so
 * this costs `CandleChart` nothing.
 */
function onPointerDown(event: PointerEvent) {
  // The primary button only. A right-click on the pane is the browser's business.
  if (event.button !== 0) return
  if (!grabbable) return

  pressed = { ...grabbable, x: event.clientX, y: event.clientY }

  // Here and not at the threshold below: the library starts its own pan on the press, and an option
  // changed a frame later does not call it off — the chart would slide under the ruler for as long
  // as the button was down. It costs a click nothing, since a press that stays a click never panned.
  chart.value?.applyOptions({ handleScroll: false, handleScale: false })
}

function onPointerMove(event: PointerEvent) {
  if (!pressed || dragging.value) return
  if (Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) < GRAB_THRESHOLD) return

  dragging.value = { ...pressed.ruler, end: pressed.end, changed: false }
}

/**
 * The release: what was being carried becomes the ruler's new shape.
 *
 * On `window` rather than on the pane, so a release outside the chart still ends the drag. The end
 * stays wherever the last bar under the cursor put it, which is the honest reading of letting go
 * off the edge of the pane.
 */
function onPointerUp() {
  const drag = dragging.value
  const held = pressed !== null
  pressed = null

  if (!drag) {
    // A press that never became a drag: give the chart its pan back and leave the click alone.
    if (held) chart.value?.applyOptions({ handleScroll: true, handleScale: true })
    return
  }

  const changed = drag.changed
  endDrag()

  // The library turns a mouse-up into a click of its own, and it arrives after this. Set before the
  // `changed` test and not after it, because both endings need it: one would deselect the ruler it
  // just moved, the other the ruler it failed to move.
  justDragged = drag.id
  setTimeout(() => {
    justDragged = null
  })

  if (!changed) return

  emit('move', { id: drag.id, from: drag.from, to: drag.to })
}

/** Give the chart its own drag back, and stop carrying anything. */
function endDrag() {
  chart.value?.applyOptions({ handleScroll: true, handleScale: true })
  dragging.value = null

  // Back to the selected ruler's own two dots rather than to none: the drag is over and the ruler
  // is still selected, so `null` here would take its dots away until the cursor next moved.
  primitive?.setHandle(props.selected === null ? null : { id: props.selected, active: null })
}

/**
 * `Escape`: abandon whatever is in hand.
 *
 * Three things it can be, in order of what the reader most likely meant. A drag goes back to where
 * the ruler was and emits nothing. A half-taken measurement is dropped, leaving the tool armed —
 * the common case is a first click on the wrong bar, and re-arming it by hand would punish that.
 * An armed tool with nothing started turns itself off, which is the way out of the mode.
 */
function onKeyDown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return

  if (pressed || dragging.value) {
    pressed = null
    endDrag()
    return
  }

  if (draft.value) {
    draft.value = null
    return
  }

  if (props.armed) emit('disarm')
}

/**
 * The chart and its DOM node, held so the unsubscribe reaches the one the subscribe reached.
 * Declared above the watcher, which runs `immediate` — a `let` read before its declaration throws.
 */
let subscribed: IChartApi | null = null
let pane: HTMLElement | null = null

// The primitive hangs on the candlestick series: it is positioned by `time` and `price` against the
// series it is attached to, and this overlay owns no series of its own.
let primitive: Rulers | null = null

// The same wait every overlay makes: the candlestick series is created in the parent's `onMounted`,
// which runs after this component's.
watch(
  [
    candleSeries,
    chart,
    () => props.rulers,
    () => props.index,
    () => props.selected,
    draft,
    dragging,
  ],
  ([bars, api]) => {
    if (!bars) return

    if (!primitive) {
      primitive = new Rulers({ lineWidth: 1, color: RULER_COLOR })
      // The cast the other overlays make: the candlestick series is declared on the chart's generic
      // horizontal scale, and a primitive is typed on `Time`.
      ;(bars as ISeriesApi<SeriesType, Time>).attachPrimitive(primitive)
    }

    if (api && !subscribed) {
      api.subscribeClick(onClick)
      api.subscribeCrosshairMove(onCrosshairMove)

      // The drag's events, which the chart's own subscriptions do not report. `pointerup` and the
      // key go on `window`: a release or an `Escape` outside the pane still has to end the drag.
      pane = api.chartElement()
      pane.addEventListener('pointerdown', onPointerDown)
      pane.addEventListener('pointermove', onPointerMove)
      window.addEventListener('pointerup', onPointerUp)
      window.addEventListener('keydown', onKeyDown)

      subscribed = api
    }

    const marks = marksToDraw()
    drawnIds = new Set(props.rulers.map(ruler => ruler.id))
    primitive.setRulers(marks)

    // A selection that no longer resolves — the ruler was removed, or the window moved out from
    // under it — is handed back rather than left to rot: the page would otherwise float a control
    // bar over a line nobody can see. Not mid-drag, where the drawing is deliberately ahead.
    if (props.selected !== null && !dragging.value && !drawnIds.has(props.selected)) {
      emit('select', null)
    }

    // The selected ruler wears its dots for as long as it is selected — that is what says it is
    // selected. `active` is the cursor's business and is answered without coming back through here.
    const carried = dragging.value
    primitive.setHandle(
      carried
        ? { id: carried.id, active: carried.end }
        : props.selected !== null && drawnIds.has(props.selected)
          ? { id: props.selected, active: null }
          : null,
    )
  },
  { immediate: true },
)

// The tool switched off from the button while a measurement was half taken: the draft goes with it.
// A line with one end is not something to leave on the chart for the next arming to inherit.
watch(
  () => props.armed,
  (armed) => {
    if (!armed) draft.value = null
  },
)

onBeforeUnmount(() => {
  // A drag cut short by a navigation would otherwise leave the chart unable to pan.
  endDrag()

  // Only matters when this overlay is unmounted while the chart lives on. When the whole chart
  // goes, `chart.remove()` has already taken the series and everything attached to it.
  const bars = candleSeries.value
  if (primitive && bars) (bars as ISeriesApi<SeriesType, Time>).detachPrimitive(primitive)
  primitive = null

  subscribed?.unsubscribeClick(onClick)
  subscribed?.unsubscribeCrosshairMove(onCrosshairMove)
  subscribed = null

  pane?.removeEventListener('pointerdown', onPointerDown)
  pane?.removeEventListener('pointermove', onPointerMove)
  pane = null
  window.removeEventListener('pointerup', onPointerUp)
  window.removeEventListener('keydown', onKeyDown)
})
</script>

<template>
  <!-- Draws through the chart API, not the DOM. -->
</template>
