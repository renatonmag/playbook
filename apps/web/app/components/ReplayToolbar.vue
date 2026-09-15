<script setup lang="ts">
import { ArrowBigLeftDash, ArrowBigRightDash, GripVertical, Square } from '@lucide/vue'

/**
 * The controls for a replay in progress, as a small bar floating over the bottom of the pane.
 *
 * `ChartToolbar`'s sibling, and deliberately not a mode of it: that bar is the actions for a
 * selected line and opens over whatever was clicked, this one is the transport for a replay and
 * belongs under the candles it steps through. They can be on screen at once — a line stays
 * selectable while the replay runs — so one component wearing two hats would have to be in two
 * places at the same time. What they do share is `useFloatingBar`, which is the half that was
 * worth sharing.
 *
 * It knows nothing about candles, cutoffs or the pipeline. Whether a step is possible is the
 * page's answer, arriving as `canBack`/`canForward`; both being false is what a replay that has
 * been armed but not yet pointed at a bar looks like, and that is the bar telling the reader it
 * is waiting on a click rather than broken.
 */
const props = defineProps<{
  /** Where the bar sits inside the chart's box, or `null` for "never moved" — the bottom centre. */
  x: number | null
  y: number | null
  /** Whether an earlier bar exists to step back to. */
  canBack: boolean
  /** Whether a later bar is already loaded to step forward onto. */
  canForward: boolean
}>()

const emit = defineEmits<{
  /** The grip was dragged. The page holds the position, so the bar stays put across replays. */
  move: [x: number, y: number]
  /** One bar off the end. */
  back: []
  /** End the replay and put the window back the way it was. */
  stop: []
  /** One bar on. */
  forward: []
}>()

const { root, onPointerDown } = useFloatingBar(
  () => ({ x: props.x, y: props.y }),
  (x, y) => emit('move', x, y),
)

/** The two arrows differ in one word and one icon; the rest is the same button twice. */
const action = 'flex size-7 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900 disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-gray-500'
</script>

<template>
  <div
    ref="root"
    class="absolute z-10 flex items-center gap-0.5 rounded-lg border border-gray-50 bg-white p-1 shadow-md"
    :class="props.x === null || props.y === null ? 'bottom-3 left-1/2 -translate-x-1/2' : ''"
    :style="props.x === null || props.y === null ? undefined : { left: `${props.x}px`, top: `${props.y}px` }"
  >
    <!-- Not a button, for the reason `ChartToolbar`'s grip is not one: the cursor is the whole of
         what it says. -->
    <span
      class="cursor-grab px-0.5 text-gray-400 active:cursor-grabbing"
      aria-hidden="true"
      @pointerdown="onPointerDown"
    >
      <GripVertical class="size-4" />
    </span>

    <span class="mx-0.5 h-5 w-px bg-gray-200" />

    <button
      :class="action"
      :disabled="!props.canBack"
      aria-label="voltar um candle"
      title="Voltar um candle"
      @click="emit('back')"
    >
      <ArrowBigLeftDash class="size-4" />
    </button>

    <!-- Never disabled, unlike the arrows either side of it: the way out of a replay has to work
         from every state the replay can be in, including the one where nothing has been picked. -->
    <button
      :class="action"
      aria-label="encerrar replay"
      title="Encerrar replay"
      @click="emit('stop')"
    >
      <Square class="size-4" />
    </button>

    <button
      :class="action"
      :disabled="!props.canForward"
      aria-label="avançar um candle"
      title="Avançar um candle"
      @click="emit('forward')"
    >
      <ArrowBigRightDash class="size-4" />
    </button>
  </div>
</template>
