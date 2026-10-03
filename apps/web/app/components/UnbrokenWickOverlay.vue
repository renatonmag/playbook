<script setup lang="ts">
import type { UTCTimestamp } from 'lightweight-charts'
import type { Candle } from '~/types/candle'
import type { UnbrokenWick } from '~/types/pattern'
import { CANDLE_SERIES, CHART } from '~/utils/chart'

/**
 * A glowing, pulsing circle on the one wick `unbroken-wick` names — the level of the last six bars
 * nobody has closed beyond yet — and on every copy of it somebody made. It exists to pull the eye,
 * so it moves when nothing else does.
 *
 * The first overlay on this chart that renders **markup** rather than drawing through the chart
 * API, and the reason is the animation. A series primitive is painted on the pane's canvas, and
 * making it pulse would mean asking the library to repaint the whole pane on every frame; a DOM
 * node pulses on the compositor for free. What that costs is that the node does not know where the
 * chart has moved to, so a frame loop asks — see `follow`.
 *
 * Being DOM is also what makes the glows easy to grab. A press on one never reaches the chart's own
 * listeners, which are on the canvas, so clicking a glow cannot pan the chart or count as a click on
 * nothing — the same property `useFloatingBar` leans on for the toolbar.
 *
 * Green on a high, red on a low, and not the palette slot: like the direction badges, the circle
 * says a *side*, and the pane already speaks sides in green and red. `color` is declared because the
 * page hands every overlay one; it is not read.
 *
 * `hideAtEdge` drops the Pattern's own circle when the wick is the newest closed bar, `lastTime`.
 * That bar always survives — nothing after it can have closed beyond it — so when it is the answer
 * the Series is saying only that the window had no older level left standing, and a pulse there
 * pulls the eye to nothing. Off by default: the page decides, and the Series itself still says what
 * it says. Copies are never hidden by it — somebody put each of them where it is.
 *
 * **Copies** are the page's (`useStoredWickCopies`); this draws them and reports two things about
 * them — which glow was pressed, and which bar a copy was dropped on. A copy is a bar and a side,
 * never a price, so a drag can only land on a wick: the bar under the cursor, at its high for a
 * green glow and its low for a red one. The Pattern's own glow selects but does not drag — it is the
 * Series' answer, and moving it would draw a claim the Series never made.
 */
const props = withDefaults(
  defineProps<{
    points: UnbrokenWick[]
    visible: boolean
    color?: string
    hideAtEdge?: boolean
    lastTime?: number | null
    copies?: { id: string, time: number, side: 'high' | 'low' }[]
    bars?: Map<number, Candle>
    /** The glow selected in this overlay: `ORIGINAL` for the Pattern's own, a copy's id otherwise. */
    selected?: string | null
    onSelect?: (id: string) => void
    onMove?: (id: string, time: number) => void
  }>(),
  {
    color: '#0ea5e9',
    hideAtEdge: false,
    lastTime: null,
    copies: () => [],
    bars: () => new Map(),
    selected: null,
    onSelect: undefined,
    onMove: undefined,
  },
)

/** The segment id the Pattern's own glow is selected under. A copy's id is a UUID, never this. */
const ORIGINAL = 'wick'

const chart = inject(CHART, shallowRef(null))
const candleSeries = inject(CANDLE_SERIES, shallowRef(null))

/**
 * The one wick, or `null` — also when the switch is on and it sits on the newest closed bar. The
 * Series never holds more than one Point.
 */
const wick = computed(() => {
  const at = props.points.at(-1) ?? null
  if (at && props.hideAtEdge && at.time === props.lastTime) return null
  return at
})

/**
 * A copy being dragged: its id and the bar it is over right now. Local until the release, so a drag
 * across forty bars is one write to storage rather than forty.
 */
const dragging = ref<{ id: string, time: number } | null>(null)

interface Mark {
  id: string
  time: number
  price: number
  side: 'high' | 'low'
  copy: boolean
}

/** Every glow to draw: the Pattern's, then each copy whose bar is in the window. */
const marks = computed<Mark[]>(() => {
  const list: Mark[] = []
  const at = wick.value
  if (at) list.push({ id: ORIGINAL, time: at.time, price: at.price, side: at.direction, copy: false })

  for (const copy of props.copies) {
    const time = dragging.value?.id === copy.id ? dragging.value.time : copy.time
    const bar = props.bars.get(time)
    // Its bar is outside the loaded window: nowhere to stand, so not drawn. Not removed either.
    if (!bar) continue
    list.push({ id: copy.id, time, price: copy.side === 'high' ? bar.high : bar.low, side: copy.side, copy: true })
  }
  return list
})

const HUE = {
  high: { glow: '34, 197, 94', label: 'máxima' },
  low: { glow: '239, 68, 68', label: 'mínima' },
} as const

function titleOf(mark: Mark) {
  const what = mark.copy ? 'Marcação copiada' : 'Pavio não rompido'
  return `${what}: ${HUE[mark.side].label} ${mark.price.toLocaleString('pt-BR')}`
}

/** The rendered glows, by id — what the frame loop moves. Filled by the function ref below. */
const nodes = new Map<string, HTMLElement>()

function bind(id: string, el: unknown) {
  if (el instanceof HTMLElement) nodes.set(id, el)
  else nodes.delete(id)
}

/**
 * Puts every glow on its wick, once per frame, for as long as there is a glow to show.
 *
 * A loop rather than a subscription because no single chart event covers what moves a wick on
 * screen: a pan and a zoom fire one, but an autoscale after a new bar, a resize of the panel, and a
 * drag of the price axis do not all fire the same one. A few coordinate lookups a frame is cheaper
 * than being wrong about which events to listen to. It writes the style directly and never touches
 * reactive state, so a frame costs no render.
 */
let frame: number | null = null

function follow() {
  frame = requestAnimationFrame(follow)
  const timeScale = chart.value?.timeScale()
  const series = candleSeries.value
  if (!timeScale || !series) return

  for (const mark of marks.value) {
    const el = nodes.get(mark.id)
    if (!el) continue
    const x = timeScale.timeToCoordinate(mark.time as UTCTimestamp)
    const y = series.priceToCoordinate(mark.price)
    // Scrolled off either axis: hide rather than pin to an edge, which would claim a place it is not.
    if (x === null || y === null) {
      el.style.visibility = 'hidden'
      continue
    }
    el.style.visibility = 'visible'
    el.style.transform = `translate(${x}px, ${y}px)`
  }
}

function stop() {
  if (frame !== null) cancelAnimationFrame(frame)
  frame = null
}

watch(
  () => props.visible && marks.value.length > 0,
  (running) => {
    stop()
    if (running) frame = requestAnimationFrame(follow)
  },
  { immediate: true },
)

onBeforeUnmount(stop)

/**
 * A press on a glow: select it, and if it is a copy, start carrying it.
 *
 * `stopPropagation` is belt and braces — the canvas is a sibling, not an ancestor, so the chart
 * would not hear this anyway. Pointer capture is what keeps the drag ours once the cursor leaves the
 * glow and crosses the canvas: the moves keep arriving here, and the chart never sees a press to pan
 * with, which is why this does not have to switch `handleScroll` off as the line drags do.
 */
function onPointerDown(mark: Mark, event: PointerEvent) {
  if (event.button !== 0) return
  event.stopPropagation()
  props.onSelect?.(mark.id)
  if (!mark.copy) return

  const target = event.currentTarget as HTMLElement
  target.setPointerCapture(event.pointerId)
  dragging.value = { id: mark.id, time: mark.time }
}

/**
 * The bar under the cursor, if it is one of the window's. Measured against the chart's own element,
 * which is the frame `coordinateToTime` speaks — not against the glow's `offsetParent`, which is the
 * glow's own wrapper, translated onto the wick and so a moving origin.
 */
function onPointerMove(event: PointerEvent) {
  const drag = dragging.value
  if (!drag) return
  const api = chart.value
  if (!api) return

  const x = event.clientX - api.chartElement().getBoundingClientRect().left
  const timeScale = api.timeScale()
  const time = timeScale.coordinateToTime(x)
  if (typeof time !== 'number' || !props.bars.has(time)) return
  if (time !== drag.time) dragging.value = { id: drag.id, time }
}

function onPointerUp(event: PointerEvent) {
  const drag = dragging.value
  if (!drag) return
  ;(event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId)
  dragging.value = null
  props.onMove?.(drag.id, drag.time)
}
</script>

<template>
  <!-- `left-0 top-0` and a translate: the chart's coordinates are measured from the pane's corner,
       which is this slot's corner too, and the node's own size is undone by the -50% on the dot.
       `visibility: hidden` until the first frame has placed it, so it never flashes at 0,0.

       The wrapper ignores the pointer and only the hit area takes it, so the 22px a ring swells to
       never swallows a click meant for the candle beside it. -->
  <template v-if="props.visible">
    <div
      v-for="mark in marks"
      :key="mark.id"
      :ref="(el) => bind(mark.id, el)"
      class="pointer-events-none absolute left-0 top-0 z-10"
      style="visibility: hidden"
      role="img"
      :title="titleOf(mark)"
      :aria-label="titleOf(mark)"
      :style="{ '--glow': HUE[mark.side].glow }"
    >
      <span class="wick-ring" />
      <span class="wick-ring wick-ring--late" />
      <span class="wick-dot" :class="{ 'wick-dot--selected': props.selected === mark.id }" />
      <span
        class="wick-hit"
        :class="mark.copy ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'"
        @pointerdown="onPointerDown(mark, $event)"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
      />
    </div>
  </template>
</template>

<style scoped>
.wick-dot,
.wick-ring,
.wick-hit {
  position: absolute;
  left: 0;
  top: 0;
  border-radius: 9999px;
  transform: translate(-50%, -50%);
}

.wick-dot {
  width: 5px;
  height: 5px;
  background: rgb(var(--glow));
  box-shadow: 0 0 3px 1px rgba(var(--glow), 0.9), 0 0 8px 3px rgba(var(--glow), 0.45);
  animation: wick-breathe 1.6s ease-in-out infinite;
}

.wick-ring {
  width: 5px;
  height: 5px;
  border: 1px solid rgba(var(--glow), 0.8);
  animation: wick-pulse 1.6s ease-out infinite;
}

/* Larger than the dot, so a 5px glow is still something a hand can land on. */
.wick-hit {
  width: 14px;
  height: 14px;
  pointer-events: auto;
  touch-action: none;
}

/* Selected: a white collar inside the glow, so it reads as picked without changing hue. */
.wick-dot--selected {
  outline: 1.5px solid white;
  outline-offset: 1px;
}

/* Half a period behind, so one ring is always on its way out and the pulse never goes quiet. */
.wick-ring--late {
  animation-delay: 0.8s;
}

@keyframes wick-pulse {
  from {
    width: 5px;
    height: 5px;
    opacity: 1;
  }
  to {
    width: 22px;
    height: 22px;
    opacity: 0;
  }
}

@keyframes wick-breathe {
  0%,
  100% {
    box-shadow: 0 0 3px 1px rgba(var(--glow), 0.9), 0 0 8px 3px rgba(var(--glow), 0.45);
  }
  50% {
    box-shadow: 0 0 5px 2px rgba(var(--glow), 1), 0 0 13px 5px rgba(var(--glow), 0.6);
  }
}

@media (prefers-reduced-motion: reduce) {
  .wick-dot,
  .wick-ring {
    animation: none;
  }
  .wick-ring--late {
    display: none;
  }
}
</style>
