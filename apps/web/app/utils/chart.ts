import type { IChartApi, ISeriesApi } from 'lightweight-charts'
import type { InjectionKey, ShallowRef } from 'vue'

/**
 * How an overlay reaches the chart it draws on.
 *
 * The value is a ref, not the chart itself, because a child's `onMounted` runs *before* its
 * parent's — an overlay reading this at mount time would always find `null`, and would fail by
 * drawing nothing rather than by raising. Overlays must `watch` it.
 */
export const CHART: InjectionKey<ShallowRef<IChartApi | null>> = Symbol('chart')

/**
 * The candlestick series, exposed so overlays can hang markers on it.
 *
 * A marker is positioned by `time` on the series it belongs to, and an overlay's own series is
 * sparse — a zigzag line holds only its vertices. Marking any other bar, such as the one a leg
 * began on, needs a series that has every bar. This is that series.
 */
export const CANDLE_SERIES: InjectionKey<ShallowRef<ISeriesApi<'Candlestick'> | null>>
  = Symbol('candle-series')
