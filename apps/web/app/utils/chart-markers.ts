import { createSeriesMarkers, type ISeriesApi, type SeriesMarker, type Time } from 'lightweight-charts'
import type { ShallowRef } from 'vue'

/** One overlay's place in the shared marker set. */
export interface MarkerSlot {
  /** Replace this slot's markers. An empty array is how an overlay hides. */
  set: (markers: SeriesMarker<Time>[]) => void
  /** Give up the slot entirely, for an overlay that is going away. */
  remove: () => void
}

export interface MarkerRegistry {
  /**
   * Claim a slot. Call this **synchronously in setup**: the order slots are claimed in is the
   * order their markers stack in, and setup order is mount order — which for the overlays is the
   * order of the pipeline response, and so the order of the chips in the sidebar. Registering
   * from a watcher instead would make the stack order depend on which Series' data arrived first.
   */
  register: () => MarkerSlot
  /** Redraw. Public only so the chart can call it once the series it draws on exists. */
  flush: () => void
}

/**
 * The one marker plugin the chart owns, shared by every overlay that draws markers.
 *
 * Not an optimisation. `createSeriesMarkers` mints a fresh primitive per call, and a primitive
 * stacks markers on a bar by walking its *own* set and pushing each one further from the candle.
 * Two primitives therefore both start at the candle and draw on top of each other: with a plugin
 * per overlay, a reversal dot and a direction arrow on one bar are drawn in the same place. There
 * is no y-offset on a marker to dodge with, and no overlay can see another's markers, so the only
 * place the collision can be fixed is here — hand every overlay one primitive and the library's
 * own stacking does the rest.
 *
 * It deals in slots and marker arrays and knows nothing about Patterns, the way `useLineOverlay`
 * deals in points: what a marker *means* stays in the overlay that produced it.
 */
export function createMarkerRegistry(
  series: ShallowRef<ISeriesApi<'Candlestick'> | null>,
): MarkerRegistry {
  // Ordered, and the order is load-bearing — see `register`.
  const slots: SeriesMarker<Time>[][] = []

  let plugin: ReturnType<typeof createSeriesMarkers<Time>> | null = null

  function flush() {
    // The series is created in the chart's `onMounted`, which runs *after* the overlays' — so the
    // first few flushes have nowhere to draw, and the chart flushes again once it exists.
    if (!series.value) return

    plugin ??= createSeriesMarkers(series.value)

    // The chart requires ascending times, and each slot is sorted only within itself. `sort` is
    // stable, so markers sharing a bar keep their concatenation order: that is what makes the
    // stack order the sidebar's order rather than an accident of the sort.
    plugin.setMarkers(slots.flat().sort((a, b) => (a.time as number) - (b.time as number)))
  }

  function register(): MarkerSlot {
    const index = slots.push([]) - 1

    return {
      set(markers) {
        slots[index] = markers
        flush()
      },
      remove() {
        // Emptied rather than spliced out: the other slots' indices are their identity, and
        // removing one would silently hand its markers to the overlay registered after it.
        slots[index] = []
        flush()
      },
    }
  }

  return { register, flush }
}
