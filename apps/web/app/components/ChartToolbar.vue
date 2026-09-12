<script setup lang="ts">
import { useResizeObserver } from '@vueuse/core'
import { GripVertical, Trash } from '@lucide/vue'

/**
 * The actions for whatever line is selected on the chart, as a small bar floating over the pane.
 *
 * It knows nothing about Patterns, lines or pins — only that something is selected and that there
 * are buttons. What each button means is the page's, which is why they leave here as bare emits:
 * a bar that knew what `remover` removes would have to know all three drawings it can be opened
 * over, and there will be more of both.
 *
 * DOM rather than a primitive drawn on the canvas, and that is what makes it cheap: a press here
 * never reaches the chart's own listeners, which are on `chartElement()`, so clicking the bar
 * cannot deselect the line the bar is about and dragging it cannot pan the chart.
 *
 * Rendered inside `CandleChart`'s slot, which is a sibling of the library-owned container — see the
 * `relative` on the tag in `pages/monitor.vue`, which is the box these coordinates are measured in.
 */
const props = defineProps<{
  /**
   * Where the bar sits inside that box, in pixels from its top-left, or `null` for "never moved".
   *
   * `null` is not a coordinate the page could have computed instead: the resting place is the top
   * centre, and centring is something CSS does against a width nobody here has measured. Once the
   * grip has been used the two numbers take over and the centring goes away for good.
   */
  x: number | null
  y: number | null
}>()

const emit = defineEmits<{
  /** The grip was dragged. The page holds the position, so the bar stays put across selections. */
  move: [x: number, y: number]
  /** The `Trash`: whatever is selected should go. */
  remove: []
}>()

const root = ref<HTMLElement | null>(null)

/**
 * What a drag in progress needs: the grab's offset inside the bar, and the box to stay within.
 *
 * Both measured at the press rather than per move. The pane does not resize while a button is
 * held, and reading two rects on every `pointermove` is a layout flush per frame for an answer
 * that cannot have changed.
 */
let drag: { dx: number, dy: number, frame: DOMRect, width: number, height: number } | null = null

function clamp(value: number, max: number) {
  return Math.min(Math.max(value, 0), Math.max(0, max))
}

function onPointerDown(event: PointerEvent) {
  // The primary button only. A right-click on the grip is the browser's business.
  if (event.button !== 0) return

  const el = root.value
  const parent = el?.offsetParent
  if (!el || !(parent instanceof HTMLElement)) return

  const box = el.getBoundingClientRect()
  const frame = parent.getBoundingClientRect()
  drag = {
    dx: event.clientX - box.left,
    dy: event.clientY - box.top,
    frame,
    width: box.width,
    height: box.height,
  }

  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)

  // Otherwise the drag selects the page's text as it passes over it.
  event.preventDefault()
}

/**
 * Clamped to the pane, so the bar cannot be put where it can no longer be reached — there is no
 * second way to bring it back, and a selection with its actions off-screen is a selection you can
 * only end by clicking elsewhere.
 */
function onPointerMove(event: PointerEvent) {
  if (!drag) return

  emit(
    'move',
    clamp(event.clientX - drag.dx - drag.frame.left, drag.frame.width - drag.width),
    clamp(event.clientY - drag.dy - drag.frame.top, drag.frame.height - drag.height),
  )
}

function onPointerUp() {
  drag = null
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
}

/**
 * The pane got smaller: pull the bar back inside it.
 *
 * The clamp on the drag is not enough on its own, and this is the case it misses — a position is
 * kept across selections and across layouts, so a bar parked low on a tall chart is a bar off the
 * bottom of a short one, with nothing that could bring it back. The same rule applied to the same
 * two numbers, just at the other moment they can go wrong.
 *
 * Only ever pulls in, never out: a bar that fits where it is stays exactly where it was put, so a
 * window widening again does not shuffle it around.
 */
function fit() {
  const el = root.value
  const parent = el?.offsetParent
  if (!el || !(parent instanceof HTMLElement)) return
  if (props.x === null || props.y === null) return

  const x = clamp(props.x, parent.clientWidth - el.offsetWidth)
  const y = clamp(props.y, parent.clientHeight - el.offsetHeight)
  if (x !== props.x || y !== props.y) emit('move', x, y)
}

/**
 * The box the bar is positioned in, taken once it exists.
 *
 * A ref filled at mount rather than the element read inline, because the observer below is set up
 * during setup — where this component's effect scope is — and `offsetParent` is not answerable
 * until there is a layout to ask about.
 */
const frame = ref<HTMLElement | null>(null)

// The chart's box is the caller's panel, which a splitter drag and the window both resize.
useResizeObserver(frame, fit)

onMounted(() => {
  const parent = root.value?.offsetParent
  frame.value = parent instanceof HTMLElement ? parent : null
  fit()
})

// A drag cut short by the bar closing under the cursor — the selection cleared from elsewhere —
// would otherwise leave two listeners on the window moving a component that is gone.
onBeforeUnmount(onPointerUp)
</script>

<template>
  <div
    ref="root"
    class="absolute z-10 flex items-center gap-0.5 rounded-lg border border-gray-200 bg-white p-1 shadow-md"
    :class="props.x === null || props.y === null ? 'left-1/2 top-3 -translate-x-1/2' : ''"
    :style="props.x === null || props.y === null ? undefined : { left: `${props.x}px`, top: `${props.y}px` }"
  >
    <!-- Not a button: it opens nothing and does nothing on a click. The cursor is the whole of
         what it says, which is why it carries one rather than relying on the icon to imply it. -->
    <span
      class="cursor-grab px-0.5 text-gray-400 active:cursor-grabbing"
      aria-hidden="true"
      @pointerdown="onPointerDown"
    >
      <GripVertical class="size-4" />
    </span>

    <span class="mx-0.5 h-5 w-px bg-gray-200" />

    <button
      class="flex size-7 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-red-600"
      aria-label="remover linha"
      title="Remover"
      @click="emit('remove')"
    >
      <Trash class="size-4" />
    </button>
  </div>
</template>
