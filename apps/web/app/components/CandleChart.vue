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
 * and a line in the page's registry, and nothing here. The marker registry below is provided the
 * same way and does not change that: it holds slots and marker arrays, not Patterns.
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
  /**
   * Hold the viewport across a redraw instead of re-framing the whole series.
   *
   * For a caller that changes `candles` at the right-hand end and nothing else — a replay stepping
   * a bar at a time. `fitContent()` on every step would re-frame the chart on each press, so the
   * bars under the cursor would crawl and the zoom would drift; here the visible range is shifted
   * by however many bars were added or removed instead, which holds every bar already on screen at
   * the same pixel and walks the newest one along the right edge.
   *
   * Off by default, because a new window genuinely is a new picture and framing it is right.
   */
  steady?: boolean
}>()

const container = ref<HTMLDivElement | null>(null)

const chart = shallowRef<IChartApi | null>(null)
const series = shallowRef<ISeriesApi<'Candlestick'> | null>(null)

provide(CHART, chart)
provide(CANDLE_SERIES, series)

/**
 * The one marker plugin every marker overlay draws through, so markers sharing a bar stack rather
 * than land on top of each other. See `createMarkerRegistry` for why it cannot be one per overlay.
 */
const markers = createMarkerRegistry(series)

provide(MARKERS, markers)

// Overlays set up — and so claim their slots and offer their markers — before this component's
// `onMounted` creates the series, so the registry has had nowhere to draw until now.
watch(series, () => markers.flush())

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

/** How many bars the series holds, which is what a `steady` redraw measures its shift against. */
const drawn = ref(0)

function draw(candles: Candle[]) {
  if (!series.value || !chart.value) return

  const scale = chart.value.timeScale()
  // Read before `setData`, which is what invalidates it: a logical range is positions in the
  // series, and the series is about to be a different length.
  const range = props.steady ? scale.getVisibleLogicalRange() : null
  const shift = candles.length - drawn.value

  series.value.setData(asBars(candles))

  // A first `steady` draw has no range to shift — the series was empty and the library has not
  // placed a viewport yet — so it falls back to framing, same as any other new picture.
  if (range) scale.setVisibleLogicalRange({ from: range.from + shift, to: range.to + shift })
  else scale.fitContent()

  drawn.value = candles.length
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
    // Switched off, not styled: the pane carries the overlays' own bands and lines, and a ruling
    // in the same near-white range competes with them while saying nothing the two axes do not.
    // The block has to stay — the library rules the pane in its own grey when told nothing.
    grid: {
      vertLines: { visible: false },
      horzLines: { visible: false },
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
      // A bar past the end is one more in the series; one landing on it is the same bar rewritten.
      // Counted here so a later `steady` redraw measures its shift against what is really drawn.
      if (lastTime.value === null || bar.time > lastTime.value) drawn.value += 1
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
  <!-- No height of its own, deliberately: `autoSize` means the caller's box decides how tall the
       chart is and the library's ResizeObserver follows it, so the caller must pass one — see the
       `h-[520px] lg:h-full` on the tag in `pages/monitor.vue`. -->
  <div class="w-full">
    <!-- The library owns this node's children, so overlays — which render nothing — stay
         outside it. They draw through the chart API, not through the DOM. -->
    <div ref="container" class="h-full w-full" />
    <slot />
  </div>
</template>
