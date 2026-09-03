<script setup lang="ts">
import { COLOUR_MODES, type Rule } from '~/utils/rule'

/**
 * The Forma rule editor in the monitor's sidebar — the only thing on that page the browser
 * composes and the server runs.
 *
 * A component rather than the inline block it started as, because two Patterns read the rule now:
 * `leg-reversals` and `bars` are the same three filters asked with and without a leg, and the
 * comparison between them is the point of having both. **They share one rule and one request.**
 * There is a single `useStoredRule` on the page and a single `/patterns` query, so an edit made
 * under either chip re-runs both Series and lights the "ajustada" badge on both. That is the
 * intended behaviour — tuning them apart would make the two Series incomparable — but it does mean
 * this control appears twice showing one state, and a reader who expects per-Series settings would
 * be wrong in a way nothing on screen says out loud.
 *
 * Owns nothing: the rule, whether it is adjusted, and the saved list all arrive as props, and every
 * edit leaves as an event. `setRatio` and `setBody` are here because they are field logic over the
 * incoming rule and have no other caller.
 *
 * Folded by default. The seven fields are a bench, not a filter row — most visits to a Pattern's
 * controls are about drawing it, and an open block pushed everything else out of a 20rem column.
 * The fold is hand-rolled for the reason the sidebar's own is: that one is an `open` Set and a
 * `v-if`, and reaching for `reka-ui`'s `Collapsible` here would put two idioms in one column.
 */
const props = defineProps<{
  rule: Rule
  /** Whether the numbers differ from what the pipeline runs unattended. */
  adjusted: boolean
  /** The rules committed to `docs/forma/rules.json`, offered as starting points. */
  savedRules: Rule[]
}>()

const emit = defineEmits<{
  update: [numbers: Partial<Rule>]
  reset: []
  load: [name: string]
}>()

const folded = ref(true)

/** `null` clears the proportional frontier; the field is left empty to mean "unused". */
function setRatio(value: string) {
  emit('update', { wcMaxRatio: value === '' ? null : Number(value) })
}

/**
 * The body range, clamped so the two ends cannot cross.
 *
 * On the bench a crossed range is merely a rule that marks nothing, and you see that immediately
 * in the counts. Here it is a **400** from `rule_query` — a request that fails rather than one
 * that answers zero — so dragging `bmin` past `bmax` would flash an error banner mid-edit. The
 * clamp keeps the invariant on this side of the wire, where it costs one line.
 */
function setBody(edge: 'bodyMin' | 'bodyMax', value: string) {
  const parsed = Number(value)
  if (Number.isNaN(parsed)) return
  emit('update', edge === 'bodyMin'
    ? { bodyMin: Math.min(parsed, props.rule.bodyMax) }
    : { bodyMax: Math.max(parsed, props.rule.bodyMin) })
}

/** The number fields in this block. Narrower than the bench's — this is a 20rem sidebar. */
const ruleField = 'w-20 rounded border border-gray-300 px-1.5 py-0.5 text-xs'
</script>

<template>
  <div class="mt-2 space-y-2 border-l border-gray-100 pl-3 text-xs">
    <div class="flex items-baseline justify-between gap-2">
      <!-- The header is the fold's handle, so the block costs no extra row when collapsed. The
           chevron is the only thing saying there is anything under it. -->
      <button class="flex min-w-0 items-baseline gap-1 font-semibold text-gray-500" @click="folded = !folded">
        <span class="text-[10px] text-gray-400">{{ folded ? '▸' : '▾' }}</span>
        Regra Forma
      </button>
      <!-- The producer key is identical whichever rule ran — see `/patterns`. This badge is the
           only thing on screen that tells an adjusted run from the declared one, so it is not
           decoration, and it stays visible while the fields are folded away. -->
      <button
        v-if="adjusted"
        class="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-800 hover:bg-amber-100"
        @click="emit('reset')"
      >
        ajustada · voltar ao padrão
      </button>
      <span v-else class="text-[10px] text-gray-400">a do pipeline</span>
    </div>

    <template v-if="!folded">
      <label v-if="savedRules.length" class="flex items-center justify-between gap-2">
        <span class="text-gray-500">Carregar</span>
        <select
          class="w-28 rounded border border-gray-300 px-1 py-0.5 text-xs"
          value=""
          @change="emit('load', ($event.target as HTMLSelectElement).value)"
        >
          <!-- Only the numbers are copied, so the list is a starting point and never a claim
               about what the Series is called. -->
          <option value="" disabled>só os números…</option>
          <option v-for="entry in savedRules" :key="entry.name" :value="entry.name">
            {{ entry.name }}
          </option>
        </select>
      </label>

      <label class="flex items-center gap-2">
        <input
          type="checkbox"
          :checked="rule.requireWfOverWc"
          @change="emit('update', { requireWfOverWc: ($event.target as HTMLInputElement).checked })"
        >
        <span>exigir <code class="font-mono">wf &gt; wc</code></span>
      </label>

      <!-- `@change`, not `@input`: each committed value is a full pipeline run on the server, and
           `@change` fires on blur or Enter. That is the debounce. -->
      <label class="flex items-center justify-between gap-2">
        <span class="text-gray-500"><code class="font-mono">wf ≥</code></span>
        <input
          type="number" step="0.01" min="0" max="1" :class="ruleField" :value="rule.wfMin"
          @change="emit('update', { wfMin: Number(($event.target as HTMLInputElement).value) })"
        >
      </label>

      <label class="flex items-center justify-between gap-2">
        <span class="text-gray-500"><code class="font-mono">wc ≤</code></span>
        <input
          type="number" step="0.01" min="0" max="1" :class="ruleField" :value="rule.wcMax"
          @change="emit('update', { wcMax: Number(($event.target as HTMLInputElement).value) })"
        >
      </label>

      <label class="flex items-center justify-between gap-2">
        <span class="text-gray-500"><code class="font-mono">wc ≤ k·wf</code></span>
        <input
          type="number" step="0.01" min="0" max="10" :class="ruleField" placeholder="sem k"
          :value="rule.wcMaxRatio ?? ''"
          @change="setRatio(($event.target as HTMLInputElement).value)"
        >
      </label>

      <div class="flex items-center justify-between gap-2">
        <span class="text-gray-500"><code class="font-mono">b</code> entre</span>
        <span class="flex gap-1">
          <input
            type="number" step="0.05" min="0" :max="rule.bodyMax"
            class="w-14 rounded border border-gray-300 px-1.5 py-0.5 text-xs"
            :value="rule.bodyMin"
            @change="setBody('bodyMin', ($event.target as HTMLInputElement).value)"
          >
          <input
            type="number" step="0.05" :min="rule.bodyMin" max="1"
            class="w-14 rounded border border-gray-300 px-1.5 py-0.5 text-xs"
            :value="rule.bodyMax"
            @change="setBody('bodyMax', ($event.target as HTMLInputElement).value)"
          >
        </span>
      </div>

      <label class="flex items-center justify-between gap-2">
        <span class="text-gray-500">Cor</span>
        <select
          class="rounded border border-gray-300 px-1 py-0.5 text-xs"
          :value="rule.colour"
          @change="emit('update', { colour: ($event.target as HTMLSelectElement).value as Rule['colour'] })"
        >
          <option v-for="option in COLOUR_MODES" :key="option" :value="option">{{ option }}</option>
        </select>
      </label>

      <label v-if="rule.colour === 'acima-de'" class="flex items-center justify-between gap-2">
        <span class="text-gray-500">cor se <code class="font-mono">b &gt;</code></span>
        <input
          type="number" step="0.05" min="0" max="1" :class="ruleField" :value="rule.colourBodyMin"
          @change="emit('update', { colourBodyMin: Number(($event.target as HTMLInputElement).value) })"
        >
      </label>
    </template>
  </div>
</template>
