<script setup lang="ts">
import type {
  IChartApi,
  ISeriesApi,
  Logical,
  MouseEventParams,
  SeriesType,
  Time,
  UTCTimestamp,
} from 'lightweight-charts'
import type { Candle } from '~/types/candle'
import type { Tag } from '~/utils/tag'
import { useElementSize } from '@vueuse/core'
import { LegSpans, type LegSpan } from '~/utils/leg-spans'
import { barSpacing } from '~/utils/level-segments'
import { RepaintHook } from '~/utils/repaint-hook'

/**
 * The tags: grey bars the reader lays across a stretch of the chart, to mark it.
 *
 * **Each tag is a `div`, not a drawing on the canvas** — `ChartToolbar`'s kind of thing, laid over
 * the pane. That buys what the toolbar's docblock names: a press on one never reaches the chart's
 * own listeners, so dragging a tag cannot pan the chart, clicking one cannot read as a click on the
 * pane, and none of the canvas overlays' machinery — hit tests, suspending the chart's pan on the
 * press, claiming the synthetic click a release makes — is needed. The cursor, the hover and the
 * grips are CSS.
 *
 * What it costs is registration: a `div` does not move when the chart does. The tags are placed
 * from their bars and their price on every repaint — see `RepaintHook` for why a repaint and not a
 * list of events — so they follow a pan, a zoom and an autoscale exactly as a drawing would. They
 * sit in a layer clipped to the plot pane, so a tag scrolled past an edge is cut there rather than
 * spilling over the price scale or the time axis.
 *
 * **Two clicks make one**, as with the ruler, and those clicks are still the chart's: the first
 * fixes the start bar *and the price*, the second the other end. Between them the draft stretches
 * after the cursor along the time axis only. The tool turns itself off when a tag is finished.
 *
 * **Two gestures, told apart by where the press lands.** On either end's grip it stretches that end,
 * bar by bar, and nothing else moves. Anywhere else it carries the whole tag, by whole bars across
 * and any price up and down. Both stay horizontal because `Tag` has one price.
 *
 * **The selected tag is open**: a card beside its bar holds a combobox of the strategy tags kept at
 * `/tags`, and the ones picked, as badges beneath it — `TagLabels`. It rides on the selection rather
 * than on a state of its own, so everything that already closes a selection — a click on nothing,
 * on another tag, the `Trash` — closes the card too, and there is one open at most. The card is
 * not inside the bar, so the bar stays the mark it was and still moves and stretches; it sits under
 * the bar, or above it where under would run off the pane — the layer clips, so a card past the
 * edge would be cut. The combobox's own list is portaled out of the layer, and flips by itself.
 *
 * **The hover is the leg-recap wash** — the tag's bars, full height, under the candles — drawn by a
 * `LegSpans` on the chart. That one stays a drawing: it is about the candles and belongs under them.
 */
const props = defineProps<{
  /** The placed tags, oldest first. */
  tags: Tag[]
  /** The bars the chart is showing, by `time` — read to refuse an end past the last candle. */
  bars: ReadonlyMap<number, Candle>
  /** The same bars as a list, in order — which is what a bar *position* is. `RulerOverlay`'s. */
  times: readonly number[]
  /** The tool button's state: the next two clicks lay a tag. */
  armed: boolean
  /** Every tag is off the chart for now, and out of reach of the cursor. */
  hidden: boolean
  /** Which tag the page holds selected, if any. */
  selected: string | null
}>()

const emit = defineEmits<{
  /** A second click landed: this is the finished tag. */
  add: [tag: Tag]
  /** A tag was dragged somewhere else. Same id, new place. */
  move: [tag: Tag]
  /**
   * A tag was pressed and let go — or, with `null`, the selection handed here no longer resolves.
   * A DOM press, never a chart click: the page must not count it as one. See `selectTag`.
   */
  select: [id: string | null]
  /** The tag is finished, or was abandoned: the tool goes back off. */
  disarm: []
  /** The strategy tags filed under this tag changed, from its open panel. */
  label: [id: string, labels: string[]]
}>()

const chart = inject(CHART)!
const candleSeries = inject(CANDLE_SERIES)!

/** How far the cursor must travel with the button down before a press becomes a drag. */
const GRAB_THRESHOLD = 3

/** The bar's height, in CSS pixels — fixed at every zoom: a tag is a mark on the picture. */
const HEIGHT = 10

/** The space between a bar and its open card, in CSS pixels. */
const GAP = 4

/** A bar and a price — where a click lands, or where a dragged tag is carried to. */
interface Spot { time: UTCTimestamp, price: number }

/** What a press takes hold of: one end, which stretches, or the body, which carries the whole tag. */
type Hold = 'from' | 'to' | 'body'

/** A tag's box inside the plot pane, in CSS pixels. */
interface Box { left: number, top: number, width: number }

/** The tag being laid: the first click's bar and price, and the bar the cursor is over now. */
const draft = ref<{ from: UTCTimestamp, to: UTCTimestamp, price: number } | null>(null)

/**
 * What is being carried. `origin` is the tag as the press found it and `anchor` what was under the
 * pointer then — the shift is applied to the first, measured from the second, so a slow drag does
 * not creep. `RulerOverlay.dragging`'s reasoning.
 */
const dragging = ref<(Tag & { hold: Hold, origin: Tag, anchor: Spot, changed: boolean }) | null>(null)

/** A button held on a tag that has not travelled far enough to be a drag yet. */
let pressed: { tag: Tag, hold: Hold, anchor: Spot, x: number, y: number } | null = null

/** The tag the pointer is over, for the wash. Held apart from a drag, which keeps it on. */
const hoveredId = ref<string | null>(null)

/**
 * The plot pane's size, and every tag's box inside it — refreshed on each repaint, written only when
 * something changed so a still chart costs Vue nothing.
 */
const pane = shallowRef<{ width: number, height: number }>({ width: 0, height: 0 })
const boxes = shallowRef<ReadonlyMap<string, Box>>(new Map())

/** The clip layer — the plot pane's box on the page, which pointer coordinates are measured in. */
const layer = ref<HTMLElement | null>(null)

/** The bar and price under a chart crosshair, or `null` past the last candle or off the pane. */
function spotAt(param: MouseEventParams<Time>): Spot | null {
  const series = candleSeries.value
  const y = param.point?.y
  if (!series || y === undefined) return null
  if (typeof param.time !== 'number') return null
  if (!props.bars.has(param.time)) return null

  const price = series.coordinateToPrice(y)
  if (price === null) return null

  return { time: param.time as UTCTimestamp, price }
}

/**
 * The bar and price under a pointer, from its client coordinates — the DOM's half of `spotAt`.
 *
 * The bar is the nearest one, clamped into the window: a drag that runs past either end of the data
 * keeps the end it reached rather than dropping the tag, which is the ruler's edge behaviour.
 */
function spotUnder(event: PointerEvent): Spot | null {
  const api = chart.value
  const series = candleSeries.value
  const frame = layer.value?.getBoundingClientRect()
  if (!api || !series || !frame || props.times.length === 0) return null

  const logical = api.timeScale().coordinateToLogical(event.clientX - frame.left)
  const price = series.coordinateToPrice(event.clientY - frame.top)
  if (logical === null || price === null) return null

  const index = Math.min(Math.max(Math.round(logical as Logical), 0), props.times.length - 1)
  const time = props.times[index]
  if (time === undefined) return null

  return { time: time as UTCTimestamp, price }
}

/** Where each bar of the window sits in it, by `time`. A `computed`: a drag asks on every move. */
const positions = computed(() => {
  const map = new Map<number, number>()
  props.times.forEach((time, position) => map.set(time, position))
  return map
})

/** The tag as it stands right now: the page's copy, unless a drag is carrying it. */
function current(tag: Tag): Tag {
  const drag = dragging.value
  return drag && drag.id === tag.id
    ? { id: drag.id, from: drag.from, to: drag.to, price: drag.price, labels: drag.labels }
    : tag
}

/** What is on the pane: the placed tags as they stand, plus the draft. The draft's id is its own. */
const shown = computed<(Tag & { draft?: boolean })[]>(() => {
  if (props.hidden) return []

  const list: (Tag & { draft?: boolean })[] = props.tags.map(current)
  const open = draft.value
  if (open) list.push({ id: 'tag:draft', ...open, labels: [], draft: true })
  return list
})

/**
 * A tag's box in pane pixels: each end covers its whole candle, so a one-bar tag is that bar's
 * width; centred on its price. `null` when a bar or the price is off what the scales map.
 */
function boxOf(tag: Tag, api: IChartApi, series: ISeriesApi<SeriesType, Time>): Box | null {
  const timeScale = api.timeScale()

  const a = timeScale.timeToCoordinate(tag.from)
  const b = timeScale.timeToCoordinate(tag.to)
  const y = series.priceToCoordinate(tag.price)
  if (a === null || b === null || y === null) return null

  const half = (barSpacing(timeScale) ?? 0) / 2
  const left = Math.min(a, b) - half

  return { left, top: y - HEIGHT / 2, width: Math.max(a, b) + half - left }
}

/** Re-place every tag against the scales as they are now. Runs inside the chart's paint. */
function place() {
  const api = chart.value
  const series = candleSeries.value as ISeriesApi<SeriesType, Time> | null
  if (!api || !series) return

  const size = api.paneSize(0)
  if (size.width !== pane.value.width || size.height !== pane.value.height) {
    pane.value = { width: size.width, height: size.height }
  }

  const next = new Map<string, Box>()
  for (const tag of shown.value) {
    const box = boxOf(tag, api, series)
    if (box) next.set(tag.id, box)
  }

  if (!sameBoxes(next, boxes.value)) boxes.value = next
}

function sameBoxes(one: ReadonlyMap<string, Box>, other: ReadonlyMap<string, Box>): boolean {
  if (one.size !== other.size) return false
  for (const [id, box] of one) {
    const was = other.get(id)
    if (!was || was.left !== box.left || was.top !== box.top || was.width !== box.width) return false
  }
  return true
}

/** The tag whose card is open: the selected one, as it stands, and never the draft. */
const openTag = computed(() => shown.value.find(tag => !tag.draft && tag.id === props.selected) ?? null)

/** The open card, measured — its height grows with the badges, and the flip has to follow it. */
const panel = ref<HTMLElement | null>(null)
const { width: panelWidth, height: panelHeight } = useElementSize(panel, undefined, { box: 'border-box' })

/**
 * Where the open card goes in the pane: under its bar, unless it would run past the bottom and
 * fits above; failing both, on whichever side has more room. Centred on the bar, slid in where
 * that would cross either side. Read from `boxes` and `pane`, which every repaint refreshes,
 * so the card follows a pan, a zoom or a drag with nothing of its own subscribed.
 *
 * Before its first measurement the card's height reads 0 and it lays out below; the next frame
 * has the real height and corrects it — which is why the `v-if` cannot wait on a measurement.
 */
const panelAt = computed<{ left: number, top: number } | null>(() => {
  const tag = openTag.value
  const box = tag ? boxes.value.get(tag.id) : undefined
  if (!box) return null

  const { width, height } = pane.value
  const below = box.top + HEIGHT + GAP
  const above = box.top - GAP - panelHeight.value

  let top: number
  if (below + panelHeight.value <= height) top = below
  else if (above >= 0) top = above
  else top = height - (box.top + HEIGHT) >= box.top ? below : Math.max(above, 0)

  const centred = box.left + box.width / 2 - panelWidth.value / 2
  const left = Math.min(Math.max(centred, 0), Math.max(0, width - panelWidth.value))

  return { left, top }
})

/**
 * The two primitives and the chart they subscribe on. Declared above the `watchEffect` below and
 * the `immediate` watcher further down, both of which run during setup — a `let` read before its
 * declaration throws.
 */
let subscribed: IChartApi | null = null
let hook: RepaintHook | null = null
let wash: LegSpans | null = null

/** The span the wash is showing, kept so an unchanged one is not handed over again. */
let washed: LegSpan | null = null

/** Wash this tag's bars, or none. An unchanged span is dropped: every hand-over is a repaint. */
function washOver(tag: Tag | null) {
  const span = tag ? { from: tag.from, to: tag.to } : null
  if (span === washed || (span && washed && span.from === washed.from && span.to === washed.to)) return

  washed = span
  wash?.setSpan(span)
}

/** The wash follows the hovered tag, or the carried one, wherever it now stands. */
watchEffect(() => {
  const drag = dragging.value
  const id = drag?.id ?? hoveredId.value
  const tag = id === null ? null : shown.value.find(item => item.id === id && !item.draft) ?? null
  washOver(tag)
})

/** A crosshair move while a tag is being laid: the draft's free end follows across, never up. */
function onCrosshairMove(param: MouseEventParams<Time>) {
  if (!param.sourceEvent) return

  const open = draft.value
  if (!open) return

  const spot = spotAt(param)
  if (spot && spot.time !== open.to) draft.value = { ...open, to: spot.time }
}

/** A chart click: half of a new tag while armed. A click on a tag never gets here — it is DOM. */
function onClick(param: MouseEventParams<Time>) {
  if (!props.armed) return

  const spot = spotAt(param)
  if (!spot) return

  const open = draft.value
  if (!open) {
    // Left unclaimed on purpose; the page's `onPaneClick` does not deselect while a tool is armed.
    draft.value = { from: spot.time, to: spot.time, price: spot.price }
    return
  }

  const tag: Tag = { id: nextTagId(), from: open.from, to: spot.time, price: open.price, labels: [] }
  draft.value = null
  // Selected by the page on `add`, not here: this one is a chart click, and only the page can
  // claim it as one. See `selectTag`.
  emit('add', tag)
  emit('disarm')
}

/**
 * The button went down on a tag — its body, or one of its grips. Not a drag yet; see
 * `GRAB_THRESHOLD`. The pointer is captured so the rest of the gesture comes here wherever it goes.
 */
function onPointerDown(event: PointerEvent, tag: Tag, grip: 'left' | 'right' | null) {
  if (event.button !== 0) return

  const anchor = spotUnder(event)
  if (!anchor) return

  // Left and right are turned into `from` and `to` here: the two are stored in the order they were
  // placed, and only the tag can say which one is on which side.
  const leftIsFrom = tag.from <= tag.to
  const hold: Hold = grip === null
    ? 'body'
    : (grip === 'left') === leftIsFrom ? 'from' : 'to'

  pressed = { tag, hold, anchor, x: event.clientX, y: event.clientY }
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)

  // Otherwise the drag selects the page's text as it passes over it — `useFloatingBar`'s.
  event.preventDefault()
}

function onPointerMove(event: PointerEvent) {
  if (!pressed) return

  if (!dragging.value) {
    if (Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) < GRAB_THRESHOLD) return
    dragging.value = {
      ...pressed.tag,
      hold: pressed.hold,
      origin: pressed.tag,
      anchor: pressed.anchor,
      changed: false,
    }
  }

  const drag = dragging.value
  if (!drag) return

  const at = spotUnder(event)
  if (!at) return

  // An end takes the bar under the pointer and nothing else: the other end and the price stay put,
  // and the two may cross — the box takes the min and the max.
  const next = drag.hold === 'body'
    ? slid(drag, at)
    : drag.hold === 'from'
      ? { from: at.time, to: drag.to, price: drag.price }
      : { from: drag.from, to: at.time, price: drag.price }
  if (!next) return

  if (next.from === drag.from && next.to === drag.to && next.price === drag.price) return

  dragging.value = { ...drag, ...next, changed: true }
}

/**
 * The tag carried by the pointer's travel since the press: whole bars across, any price up and
 * down. Both ends take one `shiftBars`, clamped to the window — `RulerOverlay.slid`'s reasoning.
 */
function slid(drag: { origin: Tag, anchor: Spot }, at: Spot) {
  const { origin, anchor } = drag

  const held = positions.value.get(anchor.time)
  const start = positions.value.get(origin.from)
  const end = positions.value.get(origin.to)
  const now = positions.value.get(at.time)
  if (held === undefined || start === undefined || end === undefined || now === undefined) return null

  const shiftBars = Math.min(
    Math.max(now - held, -Math.min(start, end)),
    props.times.length - 1 - Math.max(start, end),
  )

  const from = props.times[start + shiftBars]
  const to = props.times[end + shiftBars]
  if (from === undefined || to === undefined) return null

  return {
    from: from as UTCTimestamp,
    to: to as UTCTimestamp,
    price: origin.price + (at.price - anchor.price),
  }
}

/** The release: a press that never travelled is a click and selects; a drag lands and selects. */
function onPointerUp() {
  const held = pressed
  const drag = dragging.value
  pressed = null
  dragging.value = null

  if (!held) return

  if (drag?.changed) {
    emit('move', { id: drag.id, from: drag.from, to: drag.to, price: drag.price, labels: drag.labels })
  }

  emit('select', held.tag.id)
}

/** `Escape`: a drag goes back, a half-laid tag is dropped, an idle armed tool turns off. */
function onKeyDown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return

  if (pressed || dragging.value) {
    pressed = null
    dragging.value = null
    return
  }

  if (draft.value) {
    draft.value = null
    return
  }

  if (props.armed) emit('disarm')
}

watch(
  [candleSeries, chart],
  ([bars, api]) => {
    if (!bars) return

    if (!hook) {
      hook = new RepaintHook(place)
      wash = new LegSpans()
      ;(bars as ISeriesApi<SeriesType, Time>).attachPrimitive(wash)
      ;(bars as ISeriesApi<SeriesType, Time>).attachPrimitive(hook)
    }

    if (api && !subscribed) {
      api.subscribeClick(onClick)
      api.subscribeCrosshairMove(onCrosshairMove)
      window.addEventListener('keydown', onKeyDown)
      subscribed = api
    }

    place()
  },
  { immediate: true },
)

// A change on this side — a tag added, moved, dragged, hidden — re-places at once rather than
// waiting for the chart's next paint, which a still chart may not have for a while.
watch(shown, place)

// A selection that no longer resolves — removed, or hidden — is handed back, so the page does not
// float a `Trash` over a tag nobody can see.
watch(
  [() => props.selected, () => props.tags, () => props.hidden],
  () => {
    const id = props.selected
    if (id === null) return
    if (props.hidden || !props.tags.some(tag => tag.id === id)) emit('select', null)
  },
)

// The tool switched off mid-tag: the draft goes with it, the ruler's reason.
watch(
  () => props.armed,
  (armed) => {
    if (!armed) draft.value = null
  },
)

onBeforeUnmount(() => {
  const bars = candleSeries.value as ISeriesApi<SeriesType, Time> | null
  if (bars && hook) bars.detachPrimitive(hook)
  if (bars && wash) bars.detachPrimitive(wash)
  hook = null
  wash = null

  subscribed?.unsubscribeClick(onClick)
  subscribed?.unsubscribeCrosshairMove(onCrosshairMove)
  subscribed = null
  window.removeEventListener('keydown', onKeyDown)
})
</script>

<template>
  <!-- The plot pane's box and nothing more: the price scale and the time axis are outside it, so a
       tag scrolled past an edge is cut there. Transparent to the pointer itself, so the chart under
       it still pans, zooms and takes clicks everywhere a tag is not.

       `z-[5]`: above the library's canvases, which stack over anything unindexed in this box, and
       below the toolbars at `z-10`, so a tag dragged under one never covers its buttons. -->
  <div
    ref="layer"
    class="pointer-events-none absolute left-0 top-0 z-[5] overflow-hidden"
    :style="{ width: `${pane.width}px`, height: `${pane.height}px` }"
  >
    <template v-for="tag in shown" :key="tag.id">
      <div
        v-if="boxes.get(tag.id)"
        class="absolute"
        :class="[
          tag.draft ? 'opacity-55' : 'pointer-events-auto cursor-move touch-none',
          tag.id === openTag?.id ? 'bg-gray-500' : 'bg-gray-400',
        ]"
        :style="{
          left: `${boxes.get(tag.id)!.left}px`,
          top: `${boxes.get(tag.id)!.top}px`,
          width: `${boxes.get(tag.id)!.width}px`,
          height: `${HEIGHT}px`,
        }"
        @pointerdown="onPointerDown($event, tag, null)"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
        @pointerenter="hoveredId = tag.id"
        @pointerleave="hoveredId = hoveredId === tag.id ? null : hoveredId"
      >
        <!-- The grips: a strip at each end that stretches that end. Inside the bar rather than
             hanging off it, so the bar is exactly as wide as the bars it marks. `.stop` so the
             body's handler does not take the press a second time as a move. -->
        <template v-if="!tag.draft">
          <div
            class="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize"
            @pointerdown.stop="onPointerDown($event, tag, 'left')"
          />
          <div
            class="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize"
            @pointerdown.stop="onPointerDown($event, tag, 'right')"
          />
        </template>
      </div>
    </template>

    <!-- The open tag's card, beside its bar rather than inside it. `.stop` on the press: typing,
         picking and removing a label must not start a drag of the tag, nor read as a click that
         selects it again. -->
    <div
      v-if="openTag && panelAt"
      ref="panel"
      class="pointer-events-auto absolute z-10 w-72 cursor-default rounded-md border bg-white p-2 shadow-md"
      :style="{ left: `${panelAt.left}px`, top: `${panelAt.top}px` }"
      @pointerdown.stop
    >
      <TagLabels
        :labels="openTag.labels"
        @update:labels="(labels: string[]) => emit('label', openTag!.id, labels)"
      />
    </div>
  </div>
</template>
