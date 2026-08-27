<script setup lang="ts">
import {
  CandlestickSeries,
  createChart,
  CrosshairMode,
  type CandlestickData,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts'
import type { Candle } from '~/types/candle'

/**
 * Canvas-only, so the caller must keep it out of SSR with `<ClientOnly>`. Deliberately *not*
 * named `.client.vue`: that plus a `<ClientOnly>` wrapper is two client-only boundaries, and the
 * inner one mounts a second instance whose template ref is still null — the chart never renders.
 *
 * Overlays go in the default slot. They receive the chart through `provide` rather than props,
 * so this component never learns what a zigzag is — adding a Pattern costs an overlay component
 * and a line in the page's registry, and nothing here.
 */
const props = defineProps<{
  candles: Candle[]
  /**
   * The bars from the live socket's latest frame, oldest first. Empty when nothing is streaming.
   *
   * A prop rather than a method on an exposed ref, because the chart lives inside `<ClientOnly>`
   * on every page that uses it and a template ref through that boundary is null on the first
   * render — exactly when the first bar would arrive.
   */
  liveBars?: Candle[]
}>()

const container = ref<HTMLDivElement | null>(null)

const chart = shallowRef<IChartApi | null>(null)
const series = shallowRef<ISeriesApi<'Candlestick'> | null>(null)

provide(CHART, chart)
provide(CANDLE_SERIES, series)

/**
 * The API already emits the library's bar shape, so this is a type assertion and not a
 * conversion — `time` is Unix seconds, which is what `UTCTimestamp` brands.
 */
function asBars(candles: Candle[]): CandlestickData<UTCTimestamp>[] {
  return candles as unknown as CandlestickData<UTCTimestamp>[]
}

/**
 * The time of the last bar the series holds, so a live bar older than it can be dropped.
 *
 * `update()` throws on a bar that predates the series rather than ignoring it, and the socket
 * can legitimately deliver one: reconnecting re-sends the recent bars, and a window pinned into
 * the past has a last bar far ahead of the live edge.
 */
const lastTime = ref<number | null>(null)

function draw(candles: Candle[]) {
  if (!series.value || !chart.value) return
  series.value.setData(asBars(candles))
  chart.value.timeScale().fitContent()
  lastTime.value = candles.at(-1)?.time ?? null
}

onMounted(() => {
  if (!container.value) return

  chart.value = createChart(container.value, {
    // The library owns sizing via its own ResizeObserver; the container sets the box in CSS.
    autoSize: true,
    layout: {
      background: { color: '#ffffff' },
      textColor: '#334155',
      // The library's licence asks for a TradingView link somewhere user-visible, and this logo
      // is the automatic way to satisfy it. Turned off deliberately — the attribution still has
      // to land somewhere before this ships to users.
      attributionLogo: false,
    },
    grid: {
      vertLines: { color: '#f1f5f9' },
      horzLines: { color: '#f1f5f9' },
    },
    // The library snaps the crosshair to the nearest bar's price by default. Free movement is
    // what lets a level be read off anywhere in the pane — between two bars, or above the wick —
    // which is the whole point of having one on a chart that draws levels.
    crosshair: { mode: CrosshairMode.Normal },
    rightPriceScale: {
      borderColor: '#e2e8f0',
      // The library reserves 20% of the pane above the highest high and 10% below the lowest low
      // by default, which squeezes the candles into the middle. Just enough for a wick to breathe.
      scaleMargins: { top: 0.1, bottom: 0.1 },
    },
    timeScale: {
      borderColor: '#e2e8f0',
      // Intraday timeframes are meaningless without the clock on the axis.
      timeVisible: true,
      secondsVisible: false,
    },
  })

  series.value = chart.value.addSeries(CandlestickSeries, {
    upColor: '#16a34a',
    downColor: '#dc2626',
    borderUpColor: '#16a34a',
    borderDownColor: '#dc2626',
    wickUpColor: '#16a34a',
    wickDownColor: '#dc2626',
  })

  draw(props.candles)
})

watch(() => props.candles, draw)

/**
 * A frame in, its bars drawn. Note what this deliberately does *not* do: `fitContent()`. The
 * watcher above calls it because a new window is a new picture, but doing it on every tick would
 * snap the viewport back from wherever the user had panned to.
 *
 * `continue` and not `return` on the guard: a frame that re-sends a bar the chart is already past
 * still has newer bars after it, and dropping the whole frame would lose them.
 */
watch(
  () => props.liveBars,
  (bars) => {
    if (!bars?.length || !series.value) return
    for (const bar of bars) {
      if (lastTime.value !== null && bar.time < lastTime.value) continue
      series.value.update(asBars([bar])[0]!)
      lastTime.value = bar.time
    }
  },
)

onBeforeUnmount(() => {
  // Takes every overlay's series with it, which is why an overlay's own cleanup only has to
  // handle the case where it is unmounted while the chart lives on.
  chart.value?.remove()
  chart.value = null
  series.value = null
})
</script>

<template>
  <div class="h-[520px] w-full">
    <!-- The library owns this node's children, so overlays — which render nothing — stay
         outside it. They draw through the chart API, not through the DOM. -->
    <div ref="container" class="h-full w-full" />
    <slot />
  </div>
</template>
