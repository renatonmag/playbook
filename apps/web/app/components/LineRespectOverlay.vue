<script setup lang="ts">
import type { ISeriesApi, SeriesType, Time } from 'lightweight-charts'
import type { LineRespect } from '~/types/pattern'

/**
 * Draws one line-respect Series: a rounded 10px pill over every run of bars that held a pinned
 * line — green below the run when it held the line from above, light red above the run when it held
 * it from below. The pill goes on the far side from the line, which is the only empty air a run
 * has; `PLACEMENT` in `line-respect.ts` is that decision and its reasoning.
 *
 * Renders no markup. It reaches the chart through `inject` and draws through the chart API — the
 * same shape as the six overlays before it.
 *
 * The **fourth series primitive** in this app, after `LevelSegments`, `LevelBoxes` and
 * `TrendSegments`, and the first placed in pixels rather than at a price. See `respect-pills.ts`
 * for why that is not an implementation detail, and what it costs.
 *
 * `sides` is the sidebar's filter, the shape `directions` and `states` take on the other overlays.
 * Absent means both, so a caller that knows nothing about respect gets the whole Series.
 *
 * No `pinned` and no `onlyPinned`. A pill is a label with nothing behind it: there is no second
 * reading to unfold, nothing to drag, and so nothing a click on one could do. That is also why
 * `RespectPills` has no `hitTest` — the two decisions are one, and the note there is the long
 * version of this one.
 */
const props = withDefaults(
  defineProps<{
    points: LineRespect[]
    visible: boolean
    /**
     * Accepted and unused: the pills draw in `RESPECT_HUES`, because which side held is the whole
     * content of the mark and a Series colour would say nothing that the position does not.
     *
     * Declared anyway, because the page hands every overlay in `OVERLAYS` a colour without asking
     * which ones read it, and a prop refused here would be a warning in the console on every draw.
     */
    color?: string
    /** Which sides to draw. Both absent means both drawn. */
    sides?: LineRespect['side'][]
  }>(),
  {
    color: undefined,
    sides: () => ['above', 'below'],
  },
)

const candleSeries = inject(CANDLE_SERIES, shallowRef(null))

/**
 * The namespace ids are minted under — one Series' pills cannot collide with another's.
 *
 * A constant today, because nothing hit-tests a pill and so no id ever leaves this component. It
 * is here so that the ids are already right on the day one does, rather than being a rename away
 * from it. Two `line-respect` Series in one pipeline is the case it guards.
 */
const NAMESPACE = 'line-respect'

// The primitive hangs on the candlestick series: it is positioned against the series it is
// attached to, and this overlay owns no series of its own.
let primitive: RespectPills | null = null

// Same reason the other overlays wait on their refs: the candlestick series is created in the
// parent's `onMounted`, which runs after this component's.
watch(
  [candleSeries, () => props.points, () => props.visible, () => props.sides],
  ([bars]) => {
    if (!bars) return

    if (!primitive) {
      primitive = new RespectPills({
        height: PILL_HEIGHT,
        gap: PILL_GAP,
        pitch: PILL_PITCH,
        radius: PILL_RADIUS,
      })
      // The cast is the same one the other overlays make: the candlestick series is declared on
      // the chart's generic horizontal scale, and a primitive is typed on `Time`.
      ;(bars as ISeriesApi<SeriesType, Time>).attachPrimitive(primitive)
    }

    // Hidden by holding no pills rather than by detaching — the `setBoxes([])` precedent.
    primitive.setPills(
      props.visible ? respectPills(NAMESPACE, props.points, props.sides) : [],
    )
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
