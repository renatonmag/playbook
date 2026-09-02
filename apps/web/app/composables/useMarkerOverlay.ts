import type { SeriesMarker, Time } from 'lightweight-charts'
import type { MaybeRefOrGetter } from 'vue'

/**
 * The markers an overlay contributes to the chart — the whole of what a markers-only overlay does.
 *
 * The sibling of `useLineOverlay`, and the same division of labour: the caller maps its own Points,
 * because a Point type is the overlay's business, and this owns the timing and the plumbing.
 *
 * What it adds over the three copies it replaces is that the markers of every overlay land in *one*
 * plugin, which is the only way markers sharing a bar stack instead of overlapping — see
 * `createMarkerRegistry`.
 */
export function useMarkerOverlay(
  markers: MaybeRefOrGetter<SeriesMarker<Time>[]>,
  visible: MaybeRefOrGetter<boolean>,
) {
  const registry = inject(MARKERS, null)

  // Claimed here and not in the watcher: registration order is stack order, and setup runs in
  // mount order while a watcher runs whenever its Series' data happens to arrive.
  const slot = registry?.register() ?? null

  watch(
    [() => toValue(markers), () => toValue(visible)],
    ([points, isVisible]) => {
      // Hidden by holding no markers rather than by giving up the slot: the slot is this overlay's
      // place in the stack, and surrendering it would reorder everyone else's.
      slot?.set(isVisible ? points : [])
    },
    { immediate: true },
  )

  onBeforeUnmount(() => {
    // Only matters when the overlay is unmounted while the chart survives — hiding empties the
    // slot instead, so this is the "pattern gone from the response" path. When the whole chart
    // goes, `chart.remove()` has already taken the plugin with it.
    slot?.remove()
  })
}
