<script setup lang="ts">
import {
  CandlestickSeries,
  createChart,
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
 */
const props = defineProps<{ candles: Candle[] }>()

const container = ref<HTMLDivElement | null>(null)

let chart: IChartApi | null = null
let series: ISeriesApi<'Candlestick'> | null = null

/**
 * The API already emits the library's bar shape, so this is a type assertion and not a
 * conversion — `time` is Unix seconds, which is what `UTCTimestamp` brands.
 */
function asBars(candles: Candle[]): CandlestickData<UTCTimestamp>[] {
  return candles as unknown as CandlestickData<UTCTimestamp>[]
}

onMounted(() => {
  if (!container.value) return

  chart = createChart(container.value, {
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
    rightPriceScale: { borderColor: '#e2e8f0' },
    timeScale: {
      borderColor: '#e2e8f0',
      // Intraday timeframes are meaningless without the clock on the axis.
      timeVisible: true,
      secondsVisible: false,
    },
  })

  series = chart.addSeries(CandlestickSeries, {
    upColor: '#16a34a',
    downColor: '#dc2626',
    borderUpColor: '#16a34a',
    borderDownColor: '#dc2626',
    wickUpColor: '#16a34a',
    wickDownColor: '#dc2626',
  })

  series.setData(asBars(props.candles))
  chart.timeScale().fitContent()
})

watch(
  () => props.candles,
  (candles) => {
    if (!series || !chart) return
    series.setData(asBars(candles))
    chart.timeScale().fitContent()
  },
)

onBeforeUnmount(() => {
  chart?.remove()
  chart = null
  series = null
})
</script>

<template>
  <div ref="container" class="h-[520px] w-full" />
</template>
