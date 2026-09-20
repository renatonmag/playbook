<script setup lang="ts">
import type { PanelEdge } from '~/composables/useFloatingPanel'
import { ChevronDown, ChevronUp } from '@lucide/vue'

/**
 * A window floating over the page: a title bar you drag it by, edges you pull it wider and taller
 * by, and a fold that leaves nothing behind but that bar.
 *
 * It knows nothing about what is inside it — that is the slot's, and the point. `/monitor` already
 * has two floating *bars*, and both are strips of buttons about one thing the chart is showing;
 * this is the other shape, the one that holds a panel's worth of content and needs a size of its
 * own to hold it in. What moves in first has not been decided, so nothing has.
 *
 * Framed by the viewport rather than by the chart's box, which is the whole reason it teleports:
 * a `fixed` element is positioned against the nearest transformed or filtered ancestor if it has
 * one, and the chart column is a stack of wrappers belonging to reka and `lightweight-charts` that
 * nobody here controls. Teleporting to `body` makes "framed by the viewport" true no matter what
 * those wrappers do to their own boxes tomorrow.
 *
 * The caller owns every number, as with `ChartToolbar` and for a longer version of the same
 * reason: the page persists them, and a panel that held its own position would have nothing to
 * persist and would forget its corner on every reload.
 */
const props = withDefaults(defineProps<{
  /** What the title bar reads. UI copy, so Portuguese. */
  title?: string
  /**
   * Where it sits in the viewport, in pixels from the top-left, or `null` for "never moved".
   *
   * `null` is not a coordinate the page could have computed instead: the resting place is a corner
   * inset from two edges, and insetting is something CSS does against a viewport nobody has
   * measured. Once the title bar has been dragged the two numbers take over for good.
   */
  x: number | null
  y: number | null
  /** Its size. Always numbers: there is no CSS resting size to defer to the way there is a corner. */
  width: number
  height: number
  /** Folded down to the title strip, the body still mounted behind it. */
  collapsed: boolean
}>(), { title: 'Painel' })

const emit = defineEmits<{
  /** The title bar was dragged. */
  move: [x: number, y: number]
  /** An edge or the corner was pulled. The height reported is the unfolded one. */
  resize: [width: number, height: number]
  /** The chevron: fold or unfold. Which of the two is the page's to work out — it holds the flag. */
  toggle: []
}>()

const { root, onDragPointerDown, onResizePointerDown } = useFloatingPanel(
  () => ({ x: props.x, y: props.y, width: props.width, height: props.height }),
  (x, y) => emit('move', x, y),
  (width, height) => emit('resize', width, height),
)

/** The strip the panel folds down to, and the title bar's height at every other moment. */
const STRIP_PX = 25

/**
 * Placed by CSS or by the two numbers, never by both.
 *
 * The height is the one field the fold touches: `collapsed` overrides it here rather than being
 * written into the stored height, so unfolding restores the box the reader had rather than the
 * strip they folded it to.
 */
const placement = computed(() => {
  const size = { width: `${props.width}px`, height: `${props.collapsed ? STRIP_PX : props.height}px` }
  if (props.x === null || props.y === null) return size
  return { ...size, left: `${props.x}px`, top: `${props.y}px` }
})

function onEdge(event: PointerEvent, edge: PanelEdge) {
  onResizePointerDown(event, edge)
}
</script>

<template>
  <Teleport to="body">
    <div
      ref="root"
      class="fixed z-30 flex flex-col overflow-hidden rounded-lg border border-gray-200 bg-white"
      :class="props.x === null || props.y === null ? 'right-6 top-24' : ''"
      :style="placement"
    >
      <!-- The whole bar is the grip, not an icon inside it. A window is dragged by its title bar,
           and at 25px a `GripVertical` would be decoration competing with the title for a strip
           with room for one thing. `select-none` because a drag that starts on text selects it. -->
      <div
        class="flex h-[25px] shrink-0 cursor-grab select-none items-center justify-between gap-2 border-b border-gray-100 bg-gray-50 pl-2.5 pr-1 active:cursor-grabbing"
        @pointerdown="onDragPointerDown"
      >
        <span class="truncate text-xs font-medium text-gray-600">{{ props.title }}</span>

        <!-- `.stop` on the press, not on the click: the drag begins on `pointerdown`, so without
             it every attempt to fold would also nudge the panel a pixel or two. -->
        <button
          class="flex size-5 shrink-0 cursor-pointer items-center justify-center rounded text-gray-400 hover:bg-gray-200 hover:text-gray-600"
          :aria-label="props.collapsed ? 'expandir painel' : 'recolher painel'"
          :title="props.collapsed ? 'Expandir' : 'Recolher'"
          @pointerdown.stop
          @click="emit('toggle')"
        >
          <component :is="props.collapsed ? ChevronUp : ChevronDown" class="size-3.5" />
        </button>
      </div>

      <!-- `v-show` rather than `v-if`: folding a window should put it away, not tear down whatever
           state its content was holding and rebuild it on the way back. -->
      <div v-show="!props.collapsed" class="min-h-0 flex-1 overflow-auto p-3">
        <slot />
      </div>

      <!-- Invisible, and only the far two edges plus the corner. A left or top edge moves the
           origin as well as the size, which is a second piece of arithmetic for an affordance the
           title bar already covers. Gone while folded: a strip has no height to give. -->
      <template v-if="!props.collapsed">
        <span
          class="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize"
          @pointerdown="onEdge($event, 'right')"
        />
        <span
          class="absolute inset-x-0 bottom-0 h-1.5 cursor-ns-resize"
          @pointerdown="onEdge($event, 'bottom')"
        />
        <span
          class="absolute bottom-0 right-0 size-3 cursor-nwse-resize"
          @pointerdown="onEdge($event, 'corner')"
        />
      </template>
    </div>
  </Teleport>
</template>
