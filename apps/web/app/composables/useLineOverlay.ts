import { LineSeries, type ISeriesApi, type LineData, type LineWidth, type UTCTimestamp } from 'lightweight-charts'
import type { MaybeRefOrGetter } from 'vue'

/**
 * The library's line weights are the four integers `1..4` and nothing else, so a width arriving
 * from a number input has to be brought into that set rather than trusted. Out of range clamps and
 * anything unusable — a half-typed field, an older `localStorage` entry — reads as the 1px default,
 * which is the same answer every Pattern's line already gives.
 */
function asLineWidth(width: number | undefined): LineWidth {
  if (!Number.isFinite(width)) return 1
  return Math.min(4, Math.max(1, Math.round(width!))) as LineWidth
}

/**
 * A line drawn on the chart an overlay is nested in — the whole of what a polyline overlay does.
 *
 * Every Pattern that draws a run of connected points needs this identically, and the part worth
 * sharing is not the three API calls but *when* they may be made. Duplicating that timing is how
 * a second overlay ends up silently drawing nothing, so it lives here once.
 *
 * The caller does the mapping. A Point type is the overlay's business, and a composable that
 * knew how to read a `price` off one would have to learn every Pattern's Point in turn.
 *
 * `width` is the one thing here that is a setting rather than a fact about the data, and it is
 * optional because only the indicator has one: a Pattern's line is drawn at the weight every other
 * Pattern's is, and offering to thicken one would invite a chart where thickness means nothing in
 * particular. An indicator is a line somebody chose to put there, so its weight is theirs too.
 */
export function useLineOverlay(
  data: MaybeRefOrGetter<LineData<UTCTimestamp>[]>,
  visible: MaybeRefOrGetter<boolean>,
  color: MaybeRefOrGetter<string | undefined>,
  width?: MaybeRefOrGetter<number | undefined>,
) {
  const chart = inject(CHART, shallowRef(null))

  let line: ISeriesApi<'Line'> | null = null

  // `watch`, never `onMounted` — a child mounts before its parent, so the chart does not exist
  // yet at an overlay's `onMounted`. Waiting on the ref is required, not stylistic: reading it
  // too early fails by drawing nothing rather than by raising.
  watch(
    [chart, () => toValue(data), () => toValue(visible), () => toValue(color), () => toValue(width)],
    ([chartApi, points, isVisible, stroke, thickness]) => {
      if (!chartApi) return

      line ??= chartApi.addSeries(LineSeries, {
        lineWidth: 1,
        // All three belong to the candles, not to a derived line: a zigzag's last vertex is not a
        // price level, and a label for it on the scale would read as one. The crosshair marker is
        // the same objection drawn on the pane — a ringed dot of the same size and shape as the
        // trend lines' grab handles, parked on the very bars those lines are anchored to. It has
        // no hit test of its own, so it offers nothing to aim at while looking exactly like the
        // thing that does.
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      })

      line.setData(points)
      line.applyOptions({ visible: isVisible, color: stroke ?? '#2563eb', lineWidth: asLineWidth(thickness) })
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
