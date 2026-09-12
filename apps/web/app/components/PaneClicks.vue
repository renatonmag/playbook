<script setup lang="ts">
import type { IChartApi } from 'lightweight-charts'

/**
 * Reports every click on the chart's pane, and nothing else.
 *
 * It exists because a click that *misses* has no owner. Every primitive on the chart reports into
 * the one `hoveredInfo.objectId` field, so an overlay handed a click can only ever answer "that id
 * is not mine" — never "nobody's". Three overlays each saying the first would have to agree on the
 * second, and agreeing means one of them speaking for the others.
 *
 * So the page hears the click itself and decides afterwards. Every chart subscriber is dispatched
 * synchronously from the one event, which is what makes "afterwards" a microtask and makes this
 * independent of the order the subscriptions happened to be made in — see `onPaneClick` in
 * `pages/monitor.vue`. Nothing about which line was hit reaches here: that is the overlays' half,
 * and duplicating it would be a second hit test to keep in step with theirs.
 *
 * Renders no markup, like the overlays it sits beside, and for the same reason.
 */
const chart = inject(CHART, shallowRef<IChartApi | null>(null))

const emit = defineEmits<{
  /** A click landed on the pane. Whether it meant anything is the page's to work out. */
  click: []
}>()

function onClick() {
  emit('click')
}

/**
 * The chart this is subscribed to, so the unsubscribe cannot go to a different one. Declared above
 * the watcher, which runs `immediate` — a `let` read before its declaration is a ReferenceError.
 */
let subscribed: IChartApi | null = null

// The chart is created in the parent's `onMounted`, which runs after this component's: the same
// wait every overlay makes, minus the primitive there is none of.
watch(
  chart,
  (api) => {
    if (!api || subscribed) return
    api.subscribeClick(onClick)
    subscribed = api
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  subscribed?.unsubscribeClick(onClick)
  subscribed = null
})
</script>

<template>
  <!-- Listens through the chart API, not the DOM. -->
</template>
