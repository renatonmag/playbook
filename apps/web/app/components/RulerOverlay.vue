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
 * Both ends stay draggable afterwards, and so is the line between them — a press anywhere along a
 * ruler slides the whole thing, both ends together, and the reading it gives does not change on the
 * way. That is the difference between the two gestures rather than a detail of them: an end is for
 * correcting *what* was measured, and the line is for correcting *where* the same question was
 * asked. Any ruler answers the second, not only the selected one; a press that never travels is
 * still the click that selects, so the one press can mean both without either being in the way.
 *
 * The drag is `TrendLinesOverlay`'s down to the constants
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
   * The same bars again as a list, in order — which is what a bar *position* is.
   *
   * Both directions are wanted here and only this one is a prop: a label counts bars between two
   * times, and a line drag turns a shifted position back into the time to put an end on. The page
   * holds one array and this holds the `Map` over it, rather than the page holding two things that
   * could disagree. See `barsBetween` for why elapsed time over the timeframe is not the answer.
   */
  times: readonly number[]
  /** The tool button's state: a measurement is being taken. */
  armed: boolean
  /** Which ruler the page holds selected, if any — `selectedIn`'s half of the page's selection. */
  selected: string | null
}>()

const emit = defineEmits<{
  /** A second click landed: this is the finished measurement. */
  add: [ruler: Ruler]
  /** An end, or the whole line, was dragged somewhere else. Same id, new geometry. */
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

/** What a press takes hold of: one of the two ends, or the line, which is both of them at once. */
type Hold = 'from' | 'to' | 'line'

/**
 * What is being carried: the ruler as it is right now, plus what a release owes the page.
 *
 * `origin` and `anchor` are the line drag's, and they are the reason this is not simply the live
 * geometry. A whole-line drag is a *shift*, and a shift has to be applied to where the ruler stood
 * when the press landed — applied to the live geometry instead, each frame's rounding to a whole bar
 * would be measured against the last frame's, and a slow drag across the pane would creep. `anchor`
 * is what was under the cursor at that same moment, which is what the shift is measured from: the
 * cursor is somewhere along the line and almost never on either end, so neither end can stand in
 * for it.
 *
 * An end drag carries both unused rather than splitting this into two shapes for one gesture.
 */
const dragging = ref<(Ruler & {
  hold: Hold
  origin: { from: RulerEnd, to: RulerEnd }
  anchor: RulerEnd
  changed: boolean
}) | null>(null)

/** A button held on something that has not travelled far enough to be a drag yet. */
let pressed: { ruler: Ruler, hold: Hold, anchor: RulerEnd, x: number, y: number } | null = null

/** What a press would take hold of right now, as the cursor last reported it. */
let grabbable: { ruler: Ruler, hold: Hold } | null = null

/**
 * The bar and price under the cursor, as of its last real move.
 *
 * Kept because the press cannot ask: `pointerdown` carries client pixels and nothing else, and the
 * bar under them is the library's to say. The same reason the drag itself reads its position from
 * the crosshair rather than from the pointer events that drive it.
 */
let hovered: RulerEnd | null = null

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

/**
 * Where each bar of the window sits in it, by `time` — the other direction of `times`.
 *
 * A `computed` and not a function, because both readers ask it a bar at a time: a label asks twice
 * per ruler per frame, and a line drag asks three times on every mouse move.
 */
const positions = computed(() => {
  const map = new Map<number, number>()
  props.times.forEach((time, position) => map.set(time, position))
  return map
})

/** The ruler as it stands right now: the page's copy, unless a drag is carrying part of it. */
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
      label: rulerLabel(at.from, at.to, barsBetween(at.from.time, at.to.time, positions.value)),
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
      label: rulerLabel(open.from, open.to, barsBetween(open.from.time, open.to.time, positions.value)),
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

  // What a press would take, and what the drawing should say about it. Two questions of the same
  // move, and the answers are pushed straight at the primitive rather than through the watcher — a
  // dot growing by two pixels is not a reason to rebuild every mark on the pane.
  hovered = endAt(param)

  // The ends are the *selected* ruler's, read off the selection rather than off what the cursor is
  // over: its two dots are already drawn, and all the cursor decides is which of them is in reach.
  const chosen = props.selected === null
    ? null
    : props.rulers.find(item => item.id === props.selected) ?? null

  const end = chosen && param.point ? nearestEnd(chosen, param.point) : null
  if (chosen) primitive?.setHandle({ id: chosen.id, active: end })

  if (chosen && end) {
    grabbable = { ruler: chosen, hold: end }
    return
  }

  // Otherwise the line under the cursor, whichever ruler it belongs to. Below the ends and not
  // beside them: within a dot's reach the cursor is over both, and taking hold of one end is the
  // finer of the two things it could mean — the line is grabbable everywhere else along its length.
  //
  // `hoveredInfo.objectId` is whatever the primitives' hit tests last returned, and every primitive
  // on the pane reports into that one field, which is what the `drawnIds` check is for.
  const id = param.hoveredInfo?.objectId
  const under = typeof id === 'string' && drawnIds.has(id)
    ? props.rulers.find(item => item.id === id) ?? null
    : null

  grabbable = under ? { ruler: under, hold: 'line' } : null
}

/**
 * The cursor moved with something in hand: an end goes where the cursor is, and a line goes as far
 * as the cursor has travelled since the press.
 */
function dragTo(param: MouseEventParams<Time>) {
  const drag = dragging.value
  if (!drag) return

  const at = endAt(param)
  if (!at) return

  const next = drag.hold === 'line'
    ? slid(drag, at)
    : drag.hold === 'from'
      ? { from: at, to: drag.to }
      : { from: drag.from, to: at }

  if (!next) return

  // Every mouse move inside one bar at one pixel reports the same geometry; only a change is worth
  // reshaping the marks and repainting for.
  if (same(next.from, drag.from) && same(next.to, drag.to)) return

  dragging.value = { ...drag, ...next, changed: true }
}

/** Two ends at the same bar and the same price. */
function same(one: RulerEnd, other: RulerEnd): boolean {
  return one.time === other.time && one.price === other.price
}

/**
 * The whole ruler carried by however far the cursor has come since the press: the same number of
 * bars across and the same distance in price, applied to where it stood then.
 *
 * Which is what keeps the measurement itself out of it. Both ends take one `shiftBars` and one
 * `shiftPrice`, so the points and the bars the label reads are the ones it read before the press —
 * by construction, rather than by two roundings that happen to cancel. Moving a ruler asks the same
 * question somewhere else; changing the question is what the end handles are for.
 *
 * The shift across is clamped to the window, so the ruler slides up against its edge and stops
 * there rather than running off. Both ends must sit on a real bar — an end past the last candle is
 * a bar count that counts bars nobody drew — and refusing the move outright instead would stop the
 * drag dead the moment either end reached an edge, with the cursor still travelling.
 *
 * `null` when an end's bar has left the window under it, which a replay cut or a new window can do
 * mid-drag: there is no position to shift from, and the ruler is left where it was.
 */
function slid(drag: { origin: { from: RulerEnd, to: RulerEnd }, anchor: RulerEnd }, at: RulerEnd) {
  const { origin, anchor } = drag

  const held = positions.value.get(anchor.time)
  const start = positions.value.get(origin.from.time)
  const end = positions.value.get(origin.to.time)
  const now = positions.value.get(at.time)
  if (held === undefined || start === undefined || end === undefined || now === undefined) return null

  const shiftBars = Math.min(
    Math.max(now - held, -Math.min(start, end)),
    props.times.length - 1 - Math.max(start, end),
  )
  const shiftPrice = at.price - anchor.price

  const from = props.times[start + shiftBars]
  const to = props.times[end + shiftBars]
  if (from === undefined || to === undefined) return null

  return {
    from: { time: from as UTCTimestamp, price: origin.from.price + shiftPrice },
    to: { time: to as UTCTimestamp, price: origin.to.price + shiftPrice },
  }
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

  // A line drag is measured from what was under the cursor when the button went down, and only the
  // crosshair can say what that was — see `hovered`. Without one there is nothing to measure
  // against, so the press is not offered: past the last candle there is no bar to slide along.
  if (grabbable.hold === 'line' && !hovered) return

  pressed = {
    ...grabbable,
    anchor: hovered ?? grabbable.ruler.from,
    x: event.clientX,
    y: event.clientY,
  }

  // Here and not at the threshold below: the library starts its own pan on the press, and an option
  // changed a frame later does not call it off — the chart would slide under the ruler for as long
  // as the button was down. It costs a click nothing, since a press that stays a click never panned.
  chart.value?.applyOptions({ handleScroll: false, handleScale: false })
}

function onPointerMove(event: PointerEvent) {
  if (!pressed || dragging.value) return
  if (Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) < GRAB_THRESHOLD) return

  dragging.value = {
    ...pressed.ruler,
    hold: pressed.hold,
    origin: { from: pressed.ruler.from, to: pressed.ruler.to },
    anchor: pressed.anchor,
    changed: false,
  }
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

  // And the ruler that was moved is the one being worked on, which is only news when the drag began
  // on a ruler that was not selected — the line is grabbable on any of them. Emitted here rather
  // than left to the synthetic click above, which the library does not always make: a drag that
  // ended with the ruler still unselected left its two dots on some *other* ruler, which is the
  // drawing saying the wrong thing about what a press would take next.
  emit('select', drag.id)
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
    () => props.times,
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
    // A line drag grows neither dot: nothing in particular is in reach during one, and the ruler is
    // moving as a whole rather than by one of its ends.
    const carried = dragging.value
    primitive.setHandle(
      carried
        ? { id: carried.id, active: carried.hold === 'line' ? null : carried.hold }
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
