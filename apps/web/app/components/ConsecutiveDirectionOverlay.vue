<script setup lang="ts">
import { ArrowBigDownDash, ArrowBigUpDash } from '@lucide/vue'
import type { SeriesMarker, Time, UTCTimestamp } from 'lightweight-charts'
import type { ConsecutiveDirection } from '~/types/pattern'

/**
 * Draws the three-consecutive-bars reading two ways, exactly as `GeneralDirectionOverlay` draws
 * its own: an arrow on each bar that completed a run — up and above the bar for a bull run, down
 * and below for a bear one — and a badge in the pane's top-right corner restating the last of
 * them.
 *
 * The badge sits immediately left of general direction's and carries a superscript `3`, which is
 * the whole of what tells the two apart at a glance. They are meant to be read together: side by
 * side they say whether the tape agrees with the structure, and that comparison is the reason
 * this Series exists at all. A badge that looked identical would destroy it.
 *
 * Same arguments as the neighbour on everything else, and worth not re-deciding: **no line
 * between the arrows**, because the Series holds only the completions and a line would draw a
 * slope nothing claimed; **the up arrow above the bar**, the opposite lane from the reversal
 * dots, because an arrow here announces the side now running; and **no second toggle for the
 * badge**, because it is the last arrow moved somewhere it cannot scroll off, not a reading of
 * its own.
 *
 * The arrows take the palette slot rather than a fixed hue, like every overlay but none of the
 * badges. A fixed colour was considered and dropped: slot 0 of the palette is already a blue, so
 * a hardcoded one would collide with whichever Series happened to hold it, which is the exact
 * confusion the fixed colour was meant to prevent. Two arrow Series on one chart are told apart
 * by their swatch in the sidebar, the same way every other pair is.
 */
const props = withDefaults(
  defineProps<{
    points: ConsecutiveDirection[]
    visible: boolean
    color?: string
  }>(),
  { color: '#0ea5e9' },
)

/**
 * One arrow per completed run. Typed on `Time`, not `UTCTimestamp`: these end up on the
 * candlestick series, whose horizontal scale the chart declares generically.
 *
 * No dedup and no sort beyond what arrives: the Pattern emits at most one Point per bar and the
 * Series is already ascending, which is all the chart requires. Where this and another marker
 * overlay claim one bar, `createMarkerRegistry` stacks them outward from the candle.
 */
function asMarkers(points: ConsecutiveDirection[], color: string): SeriesMarker<Time>[] {
  return points.map(point => ({
    time: point.time as UTCTimestamp,
    position: point.direction === 'bullish' ? 'aboveBar' as const : 'belowBar' as const,
    shape: point.direction === 'bullish' ? 'arrowUp' as const : 'arrowDown' as const,
    color,
  }))
}

useMarkerOverlay(() => asMarkers(props.points, props.color), () => props.visible)

/**
 * The side the last completed run ran, which is this Series' whole opinion about now.
 *
 * Weaker than the neighbour's `current` and worth saying so: general direction's last Point holds
 * *until the next one*, so it is the reading at the newest bar. This one only ever says that a
 * run completed on the bar it sits on — it makes no claim about the bars since, which may have
 * gone anywhere. The badge restates the latest arrow and nothing more.
 *
 * `null` until the window holds a run of three — the one state with no answer, and the badge's
 * cue to stay off rather than guess a side.
 */
const current = computed(() => props.points.at(-1)?.direction ?? null)

/**
 * Green up, red down — the neighbour's table and its argument, unchanged. The pane already speaks
 * green-up/red-down in its candles, and a badge whose job is to say a side should say it in the
 * hue the pane already uses for sides. The palette colour answers a different question — *which
 * Series an arrow belongs to* — and there is only one of this badge to disambiguate.
 *
 * Which means the two badges match hue whenever the two readings agree, and that is the point:
 * when they differ, the difference is the thing worth seeing, and the `3` says which is which.
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

       `right-[124px]` is `GeneralDirectionOverlay`'s `right-[92px]` plus that badge's own `size-5`
       and the same 12px gap `top-3` uses, so this lands immediately to its left and neither moves
       when both are on. The two numbers are therefore one decision: 92 is the price axis's 80px
       for WIN@N's six-figure prices plus a 12px inset, and if it changes because prices grew
       wider, this must change with it. See that file for why it is a constant and not a
       measurement of the axis.

       Both badges are absolute in the same stacking context and neither reserves space, so a
       third of these would need a fourth number rather than a flex row. That is the cost of
       pinning readouts by hand, and two is where it is still cheaper than the layout that would
       replace it.

       `³` as a `<sup>`-styled span rather than in the glyph: the icon is a lucide component and
       has no room for a mark. It is deliberately small and unspaced — it differentiates, it does
       not label, and the words that actually say what this badge is about are in `title` and
       `aria-label`, which is also the only place a screen reader will find the difference. -->
  <div
    v-if="props.visible && current"
    class="absolute right-[124px] top-3 z-10 flex items-start gap-px"
    role="img"
    :title="`Direção por 3 candles consecutivos: ${BADGE[current].label}`"
    :aria-label="`Direção por 3 candles consecutivos: ${BADGE[current].label}`"
  >
    <component :is="BADGE[current].icon" class="size-5" :class="BADGE[current].tint" />
    <span class="text-[10px] font-semibold leading-none" :class="BADGE[current].tint">3</span>
  </div>
</template>
