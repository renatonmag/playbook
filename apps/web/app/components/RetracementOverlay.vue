<script setup lang="ts">
import type { MouseEventParams, Time } from 'lightweight-charts'
import type { Retracement } from '~/types/pattern'

/**
 * Draws one retracement Series: the percentage of the previous move each leg gave back, written
 * beside the pivot that closes the leg.
 *
 * Renders no markup. It reaches the chart through `inject` and the shared marker plugin.
 *
 * **Markers, not a canvas primitive.** `SeriesMarker.text` is the one library feature this app had
 * not used, and it is exactly the drawing wanted — a short string held clear of a bar, on the side
 * away from the candles. Going through `useMarkerOverlay` rather than a primitive of its own is
 * what makes the two retracement Series *stack* when they put a number on one bar instead of
 * drawing on top of each other, which is `createMarkerRegistry`'s whole reason.
 *
 * `always` is the sidebar's switch. Off — the default — only the leg closing on the hovered candle
 * shows its number; on, every measurable leg does. The reason for that default is density: this
 * Pattern answers about every leg, and the simple-leg Series marks a leg roughly every three bars,
 * so a five-day window drawn in full is a wall of numbers rather than a reading. The zigzag Series
 * is several times sparser and is the one worth leaving on.
 *
 * No pins, no selection and no click of any kind, unlike the primitives: a number is a reading and
 * there is nothing about one to keep. Which is also why it takes no `namespace` — nothing here
 * mints an id, so the two instances have nothing to collide over.
 */
const props = withDefaults(
  defineProps<{
    points: Retracement[]
    visible: boolean
    color?: string
    /** Draw every measured leg's number, rather than only the one under the cursor. */
    always?: boolean
  }>(),
  { color: '#0d9488', always: false },
)

const chart = inject(CHART, shallowRef(null))

/**
 * The bar time under the cursor, or `null`.
 *
 * A `ref` rather than a plain `let` for the reason `CandleLevelsOverlay`'s `hovered` is one: it is a
 * dependency of the drawing, and the whole feature is that moving the mouse redraws.
 *
 * A bar time and nothing else — no y-test, unlike that overlay's. What is being asked here is
 * "which candle is the cursor on", which the crosshair answers outright; narrowing it to the pivot
 * itself would mean the number only appeared once the mouse was already on the thing it labels.
 */
const hovered = shallowRef<number | null>(null)

function onCrosshairMove(param: MouseEventParams<Time>) {
  // The library re-fires this after every repaint with no source event, which would clear the
  // hover on its own redraw — the guard every handler on this chart repeats.
  if (!param.sourceEvent) return

  const next = typeof param.time === 'number' ? param.time : null
  if (next === hovered.value) return
  hovered.value = next
}

watch(
  chart,
  (api, _previous, onCleanup) => {
    if (!api) return
    api.subscribeCrosshairMove(onCrosshairMove)
    onCleanup(() => api.unsubscribeCrosshairMove(onCrosshairMove))
  },
  { immediate: true },
)

// `hovered` is read inside the getter, so it is a dependency of the marker set and the redraw is
// the subscription's only job. `useMarkerOverlay` owns the slot and the timing.
useMarkerOverlay(
  () => retracementMarkers(props.points, props.color, hovered.value, props.always),
  () => props.visible,
)
</script>

<template>
  <!-- Nothing. The markers draw through the chart API, not the DOM. -->
</template>
