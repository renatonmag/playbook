import { LineSeries, type ISeriesApi, type LineData, type UTCTimestamp } from 'lightweight-charts'
import type { MaybeRefOrGetter } from 'vue'

/**
 * A line drawn on the chart an overlay is nested in — the whole of what a polyline overlay does.
 *
 * Every Pattern that draws a run of connected points needs this identically, and the part worth
 * sharing is not the three API calls but *when* they may be made. Duplicating that timing is how
 * a second overlay ends up silently drawing nothing, so it lives here once.
 *
 * The caller does the mapping. A Point type is the overlay's business, and a composable that
 * knew how to read a `price` off one would have to learn every Pattern's Point in turn.
 */
export function useLineOverlay(
  data: MaybeRefOrGetter<LineData<UTCTimestamp>[]>,
  visible: MaybeRefOrGetter<boolean>,
  color: MaybeRefOrGetter<string | undefined>,
) {
  const chart = inject(CHART, shallowRef(null))

  let line: ISeriesApi<'Line'> | null = null

  // `watch`, never `onMounted` — a child mounts before its parent, so the chart does not exist
  // yet at an overlay's `onMounted`. Waiting on the ref is required, not stylistic: reading it
  // too early fails by drawing nothing rather than by raising.
  watch(
    [chart, () => toValue(data), () => toValue(visible), () => toValue(color)],
    ([chartApi, points, isVisible, stroke]) => {
      if (!chartApi) return

      line ??= chartApi.addSeries(LineSeries, {
        lineWidth: 1,
        // Both belong to the candles, not to a derived line: a zigzag's last vertex is not a
        // price level, and a label for it on the scale would read as one.
        priceLineVisible: false,
        lastValueVisible: false,
      })

      line.setData(points)
      line.applyOptions({ visible: isVisible, color: stroke ?? '#2563eb' })
    },
    { immediate: true },
  )

  onBeforeUnmount(() => {
    // Only matters when the overlay is unmounted while the chart survives — unchecking a box
    // hides the series instead of removing it, so this is the "pattern gone from the response"
    // path. When the whole chart goes, `chart.remove()` has already taken this with it.
    if (line && chart.value) chart.value.removeSeries(line)
    line = null
  })
}
