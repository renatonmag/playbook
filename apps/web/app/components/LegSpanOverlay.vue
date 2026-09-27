<script setup lang="ts">
import type { ISeriesApi, SeriesType, Time } from 'lightweight-charts'
import { LegSpans, type LegSpan } from '~/utils/leg-spans'

/**
 * Draws the leg a panel line is being hovered over: a full-height light-blue wash across its bars,
 * with the bar it reached its extreme on picked out.
 *
 * Renders no markup. It reaches the chart through `inject` and draws through the chart API — the
 * shape every overlay here has.
 *
 * **The only overlay with no Series behind it**, and the one thing to understand about it.
 * `CandleLevelsOverlay` and `RulerOverlay` are already not Pattern-driven, but each answers about
 * something on the chart. This answers about where the *cursor* is, in a panel that is teleported
 * out of the chart entirely — so it takes no `points`, no `color` from the palette and no
 * `visible`. `null` is how it is hidden, and `null` is what it holds most of the time.
 *
 * No `visible` prop for that reason: a hover has no "on" state to be switched off. The page hands
 * over a span or it does not, and there is nothing a checkbox could mean here.
 */
const props = defineProps<{
  /** The leg under the cursor, or `null` when the pointer is not on a line. */
  span: LegSpan | null
}>()

const candleSeries = inject(CANDLE_SERIES, shallowRef(null))

// The primitive hangs on the candlestick series like the others, although it reads only the time
// scale: a primitive is attached to a series or to nothing, and there is no series of its own here
// to make. What it does with that series is nothing — see `LegSpans.attached`, which keeps the
// chart and drops it.
let primitive: LegSpans | null = null

// Same reason the other overlays wait on their ref: the candlestick series is created in the
// parent's `onMounted`, which runs after this component's.
watch(
  [candleSeries, () => props.span],
  ([bars]) => {
    if (!bars) return

    if (!primitive) {
      primitive = new LegSpans()
      // The cast is the same one the other overlays make: the candlestick series is declared on
      // the chart's generic horizontal scale, and a primitive is typed on `Time`.
      ;(bars as ISeriesApi<SeriesType, Time>).attachPrimitive(primitive)
    }

    // Hidden by holding no span rather than by detaching — the `setBoxes([])` precedent, and the
    // reason it matters more here: this changes on every pointer move across the panel, and
    // attaching and detaching at that rate would be churn for a drawing that is already a no-op.
    primitive.setSpan(props.span)
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  // Only matters when this overlay is unmounted while the chart lives on. When the whole chart
  // goes, `chart.remove()` has already taken the series and everything attached to it.
  const bars = candleSeries.value
  if (primitive && bars) (bars as ISeriesApi<SeriesType, Time>).detachPrimitive(primitive)
  primitive = null
})
</script>

<template>
  <!-- Draws through the chart API, not the DOM. -->
</template>
