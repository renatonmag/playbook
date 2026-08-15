<script setup lang="ts">
import type { Shape } from '~/types/shape'

/**
 * One Candle drawn from its proportions alone — no prices, no scale, no neighbours.
 *
 * That absence is the point: the Forma factor is defined as what can be read on a Candle by
 * itself, so the bench shows exactly that and nothing more. Seeing the same bar in context is
 * one click away, on `/monitor`.
 *
 * SVG rather than Lightweight Charts because there are dozens of these on screen at once and
 * each chart instance carries a canvas and a ResizeObserver.
 */
const props = withDefaults(
  defineProps<{
    shape: Pick<Shape, 'upper' | 'lower' | 'body' | 'bear'>
    width?: number
    height?: number
    /** Dimmed when the rule being edited does not mark this bar. */
    muted?: boolean
  }>(),
  { width: 40, height: 96, muted: false },
)

const colour = computed(() => {
  if (props.muted) return '#94a3b8'
  // Matches the chart's own bar colours, so a bar looks the same here and on `/monitor`.
  return props.shape.bear ? '#dc2626' : '#16a34a'
})

/** A bearish body is filled, a bullish one hollow — the convention the chart already uses. */
const fill = computed(() => (props.shape.bear ? colour.value : '#ffffff'))

const centre = computed(() => props.width / 2)
const bodyWidth = computed(() => Math.max(6, props.width * 0.55))

const bodyTop = computed(() => props.shape.upper * props.height)
/** Floored at one pixel so a bodyless Candle still draws its open/close line. */
const bodyHeight = computed(() => Math.max(1, props.shape.body * props.height))
</script>

<template>
  <svg
    :width="width"
    :height="height"
    :viewBox="`0 0 ${width} ${height}`"
    role="img"
    :aria-label="`barra ${shape.bear ? 'de baixa' : 'de alta'}, pavio superior ${shape.upper.toFixed(2)}, corpo ${shape.body.toFixed(2)}, pavio inferior ${shape.lower.toFixed(2)}`"
  >
    <line :x1="centre" :y1="0" :x2="centre" :y2="height" :stroke="colour" stroke-width="1.5" />
    <rect
      :x="centre - bodyWidth / 2"
      :y="bodyTop"
      :width="bodyWidth"
      :height="bodyHeight"
      :fill="fill"
      :stroke="colour"
      stroke-width="1.5"
    />
  </svg>
</template>
