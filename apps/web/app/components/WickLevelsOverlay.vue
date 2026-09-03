<script setup lang="ts">
import type { IChartApi, ISeriesApi, MouseEventParams, SeriesType, Time } from 'lightweight-charts'
import type { Candle } from '~/types/candle'

/**
 * Draws the wick levels of whichever bar the cursor is on: a line where each wick leaves the body
 * and another where it stopped, both running from that bar to the current candle.
 *
 * Renders no markup. It reaches the chart through `inject` and draws through the chart API — the
 * same shape as the seven Pattern overlays.
 *
 * It is not one of them, and that is the only structural thing to know about it: there is no
 * producer, no Points prop, no pipeline run behind it. It reads the candles, which arrive here as a
 * map by `time` because a bar is looked up by name — the hovered one, and the ones with pins — and
 * never scanned.
 *
 * The fourth user of `LevelSegments`, and the first to draw at the cursor rather than at what a
 * server found. Every segment it hands over is `extend: true`: see `wickLevels`.
 */
const props = withDefaults(
  defineProps<{
    /** The loaded window plus the live bars, by `time`. The page owns the merge. */
    bars: ReadonlyMap<number, Candle>
    visible: boolean
    /** Which wicks to draw. Absent means both. */
    sides?: WickSide[]
    /** Ids of the levels to keep drawn once the cursor has moved on. */
    pinned?: string[]
    /**
     * Whether the cursor draws.
     *
     * Off, the tool holds still: the pinned levels stay on the chart, and passing over a bar adds
     * nothing. That is the state you want once the lines you were hunting for are pinned — until
     * then the cursor is the whole tool, which is why absent means on.
     *
     * It does not silence the mouse. A pinned level is still drawn, so it is still hit-testable, so
     * a click still takes it off — see `onClick`.
     */
    tracking?: boolean
  }>(),
  {
    sides: () => ['high', 'low'],
    pinned: () => [],
    tracking: true,
  },
)

/**
 * A level was clicked. The id is `wickLevelId`'s, and what to do about it — pin, unpin — is the
 * page's business: this component has no memory of its own and is redrawn from `pinned`.
 */
const emit = defineEmits<{ pin: [id: string] }>()

const candleSeries = inject(CANDLE_SERIES, shallowRef(null))
const chart = inject(CHART, shallowRef(null))

/**
 * The bar under the cursor, or `null`.
 *
 * A `ref` rather than a plain `let`, unlike `drawnIds`, for the reason `TrendLinesOverlay`'s
 * `hovered` is one: it is a dependency of the redraw watcher, and the whole feature is that moving
 * the mouse redraws.
 */
const hovered = shallowRef<number | null>(null)

/**
 * The cursor moved: draw the bar it is on.
 *
 * **Except while it is on one of these lines.** A level runs from its bar to the live edge, so
 * reaching one means moving away from the bar that produced it — and tracking the cursor across
 * those columns would swap the lines out from under it. The line you were about to click would be
 * gone by the time you arrived, at every bar between here and the edge, so nothing but the strip
 * directly above its own candle could ever be pinned.
 *
 * So a cursor on a drawn line holds the bar it came from. `hoveredInfo.objectId` is whatever the
 * primitives' hit tests last returned, and `drawnIds` is what keeps another primitive's drawing from
 * freezing this one — every primitive on the chart reports into that one field. Moving off the line
 * resumes tracking on the next event, which is the same frame's worth of latency the freeze took.
 */
function onCrosshairMove(param: MouseEventParams<Time>) {
  // The switch, and the first thing asked: with it off there is no hovered bar to hold and none to
  // take up, so the freeze below never comes into it.
  if (!props.tracking) return

  const id = param.hoveredInfo?.objectId
  if (typeof id === 'string' && drawnIds.has(id)) return

  // A bar time is a number on this chart's scale; off the pane, or past the last bar, there is no
  // bar to draw and the lines go with it.
  const next = typeof param.time === 'number' ? param.time : null

  // This fires on every mouse move across the pane. Only a change is worth reshaping and repainting.
  if (next === hovered.value) return
  hovered.value = next
}

/**
 * A click on one of *this* tool's levels, and nothing else.
 *
 * Unlike `TrendLinesOverlay` there is no second meaning for a click that misses — this tool asks
 * nothing of a bar that the cursor does not already answer by hovering it.
 *
 * The id check is not a formality: with four primitives on the chart, a click on a level, a gap or a
 * trend line reports into the same field and would otherwise read as a click here.
 *
 * `hoveredInfo` is a mouse affordance, so a touch that never hovers pins nothing. Acceptable, and
 * the same trade the other three pinnable overlays make — though here it is the whole tool, since
 * the drawing is a hover in the first place.
 */
function onClick(param: MouseEventParams<Time>) {
  const id = param.hoveredInfo?.objectId
  if (typeof id !== 'string') return
  if (!drawnIds.has(id)) return
  emit('pin', id)
}

/**
 * The switch went off: forget the bar it was on.
 *
 * Dropped rather than parked, the choice `toggleFocusMode` makes about its own bar: the lines are
 * gone from the chart either way, and a remembered hover would come back on the next redraw as a
 * stale answer to a question nobody is asking. Switching back on takes up the bar under the cursor
 * on its first move, which is the one being asked about.
 *
 * Ahead of the redraw watcher so the clear lands before the draw it triggers, rather than being a
 * mutation inside a watcher's own dependency list.
 */
watch(
  () => props.tracking,
  (on) => {
    if (!on) hovered.value = null
  },
)

/** The ids currently handed to the primitive: what a click can name, and what the freeze holds on. */
let drawnIds = new Set<string>()

/**
 * The chart this is subscribed to, so the unsubscribe cannot go to a different one. Declared above
 * the watcher, which runs `immediate` — a `let` read before its declaration is a ReferenceError.
 */
let subscribed: IChartApi | null = null

// The primitive hangs on the candlestick series: it is positioned by `time` and `price` against the
// series it is attached to, and this overlay owns no series of its own.
let primitive: LevelSegments | null = null

// Same reason the other overlays wait on their refs: the candlestick series is created in the
// parent's `onMounted`, which runs after this component's.
watch(
  [
    candleSeries,
    chart,
    () => props.bars,
    () => props.visible,
    () => props.sides,
    () => props.pinned,
    () => props.tracking,
    hovered,
  ],
  ([bars, api]) => {
    if (!bars) return

    if (!primitive) {
      // `bars: 1` — the stub length is never reached, since every wick level extends to the live
      // edge. It stays the floor `boundsOf` measures against, which is this bar's own width.
      primitive = new LevelSegments({ bars: 1, lineWidth: 2 })
      // The cast is the same one the other overlays make: the candlestick series is declared on the
      // chart's generic horizontal scale, and a primitive is typed on `Time`.
      ;(bars as ISeriesApi<SeriesType, Time>).attachPrimitive(primitive)
    }

    if (api && !subscribed) {
      api.subscribeClick(onClick)
      api.subscribeCrosshairMove(onCrosshairMove)
      subscribed = api
    }

    // Hidden by holding no levels rather than by detaching — the `setMarkers([])` precedent, and the
    // same trade every primitive here makes: an empty draw is a `return`. With the tool off nothing
    // is drawn, so nothing is hit-testable and the cursor means what it always meant.
    const levels = props.visible
      ? wickLevels(props.bars, hovered.value, new Set(props.pinned), props.sides)
      : []
    drawnIds = new Set(levels.map(level => level.id))
    primitive.setSegments(levels)
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  // Only matters when this overlay is unmounted while the chart lives on. When the whole chart goes,
  // `chart.remove()` has already taken the series and everything attached to it.
  const bars = candleSeries.value
  if (primitive && bars) (bars as ISeriesApi<SeriesType, Time>).detachPrimitive(primitive)
  primitive = null

  // Unlike the primitive, these outlive the series: a subscription is held by the chart, and an
  // overlay that came and went would leave handlers firing into a dead component.
  subscribed?.unsubscribeClick(onClick)
  subscribed?.unsubscribeCrosshairMove(onCrosshairMove)
  subscribed = null
})
</script>

<template>
  <!-- Draws through the chart API, not the DOM. -->
</template>
