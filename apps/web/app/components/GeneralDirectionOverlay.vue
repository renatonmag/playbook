<script setup lang="ts">
import { ArrowBigDownDash, ArrowBigUpDash } from '@lucide/vue'
import type { SeriesMarker, Time, UTCTimestamp } from 'lightweight-charts'
import type { GeneralDirection } from '~/types/pattern'

/**
 * Draws one general-direction Series two ways: an arrow on each bar where the reading turned — up
 * and above the bar when it turned bullish, down and below when it turned bearish — and a badge in
 * the pane's top-right corner restating the last of those arrows.
 *
 * The markers reach the chart through `inject` and the chart API; the badge is markup, and the only
 * markup any overlay renders. It can be, because the slot it sits in is a sibling of the library's
 * own container rather than a child of it — see `CandleChart` — so an absolutely positioned box here
 * lands over the pane the same way `ChartToolbar` does.
 *
 * No line between the arrows, deliberately: the Series holds only the turns, and the trend *between*
 * two arrows is exactly what a reader infers from the last arrow behind any bar — a line joining the
 * turns would draw a slope the Pattern never claimed.
 *
 * The up arrow sits *above* the bar and the down arrow *below* it — the opposite lanes from the
 * reversal dots, which sit where the old leg was heading. An arrow here announces the trend now
 * in force, so it stands on the side the market is claimed to be going.
 *
 * The lanes still cross on a bar that a reversal dot and an arrow both claim, and that is no longer
 * a collision: every marker overlay draws through one plugin, which stacks the two outward from the
 * candle. See `createMarkerRegistry`.
 *
 * The corner badge adds no reading of its own — it is the last arrow, moved somewhere it cannot
 * scroll off. That is the whole of why it exists: the turn in force can be hundreds of bars back and
 * off the left edge, and the one fact a glance at the pane should not have to hunt for is which way
 * the market is currently claimed to be going. It takes no new data and dies with the same toggle,
 * because it is not a second thing to switch on and off.
 *
 * It does not move, unlike the two bars that float over this pane. Those are draggable because they
 * cover the candles the reader is working on; a readout pinned in a corner is never in the way, and
 * has nothing to get out of.
 */
const props = withDefaults(
  defineProps<{
    points: GeneralDirection[]
    visible: boolean
    color?: string
  }>(),
  { color: '#a855f7' },
)

/**
 * One arrow per turn. Typed on `Time`, not `UTCTimestamp`: these end up on the candlestick series,
 * whose horizontal scale the chart declares generically.
 *
 * No dedup and no sort beyond what arrives: the Pattern emits at most one Point per bar and the
 * Series is already ascending, which is all the chart requires.
 */
function asMarkers(points: GeneralDirection[], color: string): SeriesMarker<Time>[] {
  return points.map(point => ({
    time: point.time as UTCTimestamp,
    position: point.direction === 'bullish' ? 'aboveBar' as const : 'belowBar' as const,
    shape: point.direction === 'bullish' ? 'arrowUp' as const : 'arrowDown' as const,
    color,
  }))
}

useMarkerOverlay(() => asMarkers(props.points, props.color), () => props.visible)

/**
 * The trend in force at the newest bar the window holds: the direction of the last turn, because a
 * turn holds until the next one. That the last Point is the latest is the same ascending order the
 * markers rely on.
 *
 * `null` only before the Pattern has seeded — the one state with no answer, and the badge's cue to
 * stay off rather than guess a side.
 */
const current = computed(() => props.points.at(-1)?.direction ?? null)

/**
 * Green up, red down — not `color`, which is this Series' slot in the palette.
 *
 * The palette colour answers *which Series an arrow belongs to*, and the badge is not disambiguating
 * among Series: there is one of it, and what it has to say is a side. The pane already speaks
 * green-up/red-down in its candles, so a side said in any other hue would be the odd one out.
 *
 * `label` is never drawn — it is the side in words, for the `title` and the `aria-label`.
 */
const BADGE = {
  bullish: { icon: ArrowBigUpDash, tint: 'text-green-600', label: 'Alta' },
  bearish: { icon: ArrowBigDownDash, tint: 'text-red-600', label: 'Baixa' },
} as const
</script>

<template>
  <!-- The markers draw through the chart API, not the DOM. This is the corner readout, and the
       `visible` half of the guard is what ties it to the sidebar's `Ligar` — the same switch the
       markers answer to, so the two can never disagree about whether this Series is on screen.

       `right-[92px]` rather than the `right-3` the floating bars use, because the box this is
       positioned against is the chart's whole element and the library draws the price axis inside
       it: the pane's right edge as far as candles are concerned is one axis-width further in, and
       at `right-3` this sat on top of the axis and hid its topmost label. 92px is the 80px that
       axis measures for WIN@N's six-figure prices plus the same 12px inset `top-3` gives.

       A constant and not a measurement. `chart.priceScale('right').width()` would give the real
       number, but nothing fires when it changes — the axis rewidens on its own whenever a longer
       price scrolls into the window — so reading it once would go stale and reading it on a
       `ResizeObserver` over a node the library owns is a lot of machinery for a badge whose only
       requirement is to be clear of the thing. Prices wider than six figures would creep back over
       the axis; this number is then the thing to change.

       No word beside the arrow: the glyph points the side and the tint says it, so a label is the
       third telling of one fact and only widens the box. `title` and `aria-label` carry it in
       words instead — a bare glyph is nothing to a screen reader, and the hover is where the badge
       says what it is *about* rather than just which way it points.

       No panel behind it either, unlike the two floating bars. Those carry a border, a white ground
       and a shadow because they are *controls*: the chrome is what says a thing can be pressed and
       dragged, and the white is what keeps a button legible over the candles it is sitting on top
       of. This is neither — it reads, it cannot be pressed, and it sits in a corner the candles
       reach only at the very top of the price range. A box drawn around one glyph is a box saying
       nothing.

       The wrapper stays even with nothing left to draw, because the tooltip does: `title` on an
       `<svg>` is not a tooltip in any browser — SVG wants a `<title>` child — so hanging the
       attribute on the icon would silently lose the hover. This div is what carries the two labels
       and the `role` that makes them audible. -->
  <div
    v-if="props.visible && current"
    class="absolute right-[92px] top-3 z-10"
    role="img"
    :title="`Direção geral no último candle: ${BADGE[current].label}`"
    :aria-label="`Direção geral no último candle: ${BADGE[current].label}`"
  >
    <component :is="BADGE[current].icon" class="size-5" :class="BADGE[current].tint" />
  </div>
</template>
