<script setup lang="ts">
import type { Candle, Timeframe } from '~/types/candle'

/**
 * Draws the weighted moving average of the closes: one line, at whatever period, colour and weight
 * the indicators dialog is set to.
 *
 * Renders no markup. It reaches the chart through `inject` and draws through the chart API — the
 * same shape as the Pattern overlays.
 *
 * It is not one of them, and that is the structural thing to know about it: there is no producer,
 * no Points prop and no pipeline run behind it. Like `CandleLevelsOverlay` it reads the candles —
 * but as a list rather than as a map by `time`, because this one is scanned end to end on every
 * redraw instead of looking up a bar somebody pointed at.
 *
 * The list it is handed includes the forming bar, so the right-hand end of the line moves with the
 * last trade. That is the whole point of an average on a live chart, and it is the caller's doing:
 * see the page's note on why it passes the replay's bars and not the chart's.
 *
 * It draws one point per bar even when the average is over coarser buckets, which is what makes an
 * hourly average on a five-minute chart a staircase rather than ten sloped points a session. The
 * step it climbs at each hour is a bar wide, so the risers read as vertical without the series
 * having to be told it is a step line.
 */
const props = defineProps<{
  /** The loaded window plus the live bars, in time order. The page owns the merge and the cut. */
  bars: Candle[]
  period: number
  color: string
  width: number
  visible: boolean
  /** The bars to average, or `null` for the ones on the chart. See `aggregationSeconds`. */
  timeframe: Timeframe | null
  /** What the chart is showing, which is what `timeframe` has to be coarser than to mean anything. */
  chartTimeframe: Timeframe
}>()

/**
 * Computed rather than a getter inlined into the call, which is the one departure from the Pattern
 * overlays worth naming: they map a list the server already shaped, while this walks every bar on
 * the chart. Caching it means a colour change re-applies an option instead of re-averaging.
 */
const points = computed(() =>
  weightedAverage(props.bars, props.period, aggregationSeconds(props.timeframe, props.chartTimeframe)),
)

useLineOverlay(points, () => props.visible, () => props.color, () => props.width)
</script>

<template>
  <!-- Draws through the chart API, not the DOM. -->
</template>
