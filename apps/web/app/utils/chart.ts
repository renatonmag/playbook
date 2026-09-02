import type { IChartApi, ISeriesApi } from 'lightweight-charts'
import type { InjectionKey, ShallowRef } from 'vue'
import type { MarkerRegistry } from '~/utils/chart-markers'

/**
 * How an overlay reaches the chart it draws on.
 *
 * The value is a ref, not the chart itself, because a child's `onMounted` runs *before* its
 * parent's — an overlay reading this at mount time would always find `null`, and would fail by
 * drawing nothing rather than by raising. Overlays must `watch` it.
 */
export const CHART: InjectionKey<ShallowRef<IChartApi | null>> = Symbol('chart')

/**
 * The candlestick series, exposed for the drawings that must be placed against every bar.
 *
 * A marker is positioned by `time` on the series it belongs to, and an overlay's own series is
 * sparse — a zigzag line holds only its vertices. Marking any other bar, such as the one a leg
 * began on, needs a series that has every bar. This is that series.
 *
 * Overlays no longer hang markers here themselves; `MARKERS` does it for all of them at once, for
 * the reason given there. What is left of this key is exactly the paragraph above, which is what
 * the registry needs it for.
 */
export const CANDLE_SERIES: InjectionKey<ShallowRef<ISeriesApi<'Candlestick'> | null>>
  = Symbol('candle-series')

/**
 * The chart's one marker plugin, which every marker overlay draws through.
 *
 * Not a ref, unlike the two above: the registry can be built before the series exists and takes
 * the series' ref itself, so an overlay may claim its slot the moment it sets up — which is
 * required, since the order slots are claimed in is the order markers stack in. See
 * `createMarkerRegistry`.
 */
export const MARKERS: InjectionKey<MarkerRegistry> = Symbol('markers')
