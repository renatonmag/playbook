<script setup lang="ts">
import { GripVertical, Trash } from '@lucide/vue'

/**
 * The actions for whatever line is selected on the chart, as a small bar floating over the pane.
 *
 * It knows nothing about Patterns, lines or pins — only that something is selected and that there
 * are buttons. What each button means is the page's, which is why they leave here as bare emits:
 * a bar that knew what `remover` removes would have to know all three drawings it can be opened
 * over, and there will be more of both.
 *
 * The grip, the drag and the clamping are `useFloatingBar`'s — this is not the only bar that
 * floats over the pane any more, and the reasoning behind that arithmetic lives there.
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

const { root, onPointerDown } = useFloatingBar(
  () => ({ x: props.x, y: props.y }),
  (x, y) => emit('move', x, y),
)
</script>

<template>
  <div
    ref="root"
    class="absolute z-10 flex items-center gap-0.5 rounded-lg border border-gray-50 bg-white p-1 shadow-md"
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
