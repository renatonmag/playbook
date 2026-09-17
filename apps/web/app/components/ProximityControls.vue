<script setup lang="ts">
import { emptyLevel, type ProximityLevel, type ProximityRule } from '~/utils/proximity'

/**
 * The proximity ladder editor in the monitor's sidebar — the second thing on that page the browser
 * composes and the server runs.
 *
 * `FormaRuleControls`' sibling, and everything that component's docstring says about ownership and
 * about the fold applies here unchanged: it owns nothing, the page holds one ladder and sends one
 * body, and a copy of this block under `line-relations` and another under `trend-relations` are
 * two views of the same rows. That is intended for the same reason — a level and a sloped line are
 * asked the same question, and tuning "how near is near" apart for the two would make the one
 * comparison somebody pins both kinds of line to draw meaningless.
 *
 * What is different is the shape of the thing being edited. A Forma rule is seven fields that are
 * always there; a ladder is a list somebody adds rungs to, so this block has an add button, a `✕`
 * per row and a `limpar` — the affordances the pinned lists in the same column already use, rather
 * than a second idiom for the same gesture.
 *
 * **The percentage lives here and nowhere else.** A `trigger` is a fraction everywhere from
 * `proximity.ts` to the engine, and this is the one surface that renders one as `5` and reads one
 * back. The conversion is two functions at the bottom of this script, so the one place it could be
 * got wrong is one place.
 */
defineProps<{
  /** The rungs, in the order the page holds them. Sorted on the way to the wire, not here. */
  levels: ProximityRule
}>()

const emit = defineEmits<{
  add: [level: ProximityLevel]
  update: [index: number, patch: Partial<ProximityLevel>]
  remove: [index: number]
  clear: []
}>()

const folded = ref(true)

/** The fraction a rung holds, as the number the field shows. */
function asPercent(trigger: number): number {
  // Through a round, because `0.07 * 100` is `7.000000000000001` and a spin button that reads
  // that is a field nobody will type in again. Two decimals is finer than anything a person means
  // by "how near", and coarse enough that the artefact cannot come back.
  return Math.round(trigger * 10000) / 100
}

/**
 * A typed percentage as the fraction everything downstream reads.
 *
 * An empty field, or anything that is not a number, is left alone rather than written as `NaN`:
 * a row is edited a digit at a time and the number between two keystrokes is not an opinion.
 * `toProximityBody` would drop such a row anyway — this is what keeps it from having to.
 */
function setTrigger(index: number, value: string) {
  const parsed = Number(value)
  if (value === '' || Number.isNaN(parsed)) return
  emit('update', index, { trigger: parsed / 100 })
}

function setPoints(index: number, value: string) {
  const parsed = Number(value)
  if (value === '' || Number.isNaN(parsed)) return
  emit('update', index, { points: parsed })
}

/** The number fields in this block, matching the rule editor's beside it. */
const levelField = 'w-20 rounded border border-gray-300 px-1.5 py-0.5 text-xs'
</script>

<template>
  <div class="mt-2 space-y-2 border-l border-gray-100 pl-3 text-xs">
    <div class="flex items-baseline justify-between gap-2">
      <!-- The header is the fold's handle, as the rule editor's is. -->
      <button
        class="flex min-w-0 items-baseline gap-1 font-semibold text-gray-500"
        @click="folded = !folded"
      >
        <span class="text-[10px] text-gray-400">{{ folded ? '▸' : '▾' }}</span>
        Proximidade
      </button>
      <!-- The producer key is identical whether or not a ladder ran, so this badge is the only
           thing on screen that says one did. It stays visible while the rows are folded away. -->
      <button
        v-if="levels.length"
        class="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-800 hover:bg-amber-100"
        @click="emit('clear')"
      >
        {{ levels.length }} {{ levels.length === 1 ? 'nível' : 'níveis' }} · limpar
      </button>
      <span v-else class="text-[10px] text-gray-400">sem níveis</span>
    </div>

    <template v-if="!folded">
      <!-- What the two numbers mean, in one line, because a rung read cold says neither. Kept
           above the rows rather than as placeholders: a filled field hides its own placeholder,
           which is exactly when a reader comes looking for this. -->
      <p class="text-[10px] leading-snug text-gray-400">
        Para pernas a partir de <span class="font-mono">pontos</span>, um toque é anunciado a
        <span class="font-mono">%</span> do tamanho da perna. Sem nível, nada é anunciado.
      </p>

      <div v-if="levels.length" class="space-y-1">
        <div class="flex items-center gap-1 text-[10px] text-gray-400">
          <span class="w-20">perna ≥</span>
          <span class="w-20">gatilho %</span>
        </div>

        <!-- `@change`, not `@input`: each committed value is a full pipeline run on the server,
             and `@change` fires on blur or Enter. That is the debounce — sharper here than on the
             rule beside it, since every one of these rows travels in a body. -->
        <div v-for="(level, index) in levels" :key="index" class="flex items-center gap-1">
          <input
            type="number" step="100" min="1" :class="levelField" :value="level.points"
            @change="setPoints(index, ($event.target as HTMLInputElement).value)"
          >
          <input
            type="number" step="0.5" min="0.01" max="100" :class="levelField"
            :value="asPercent(level.trigger)"
            @change="setTrigger(index, ($event.target as HTMLInputElement).value)"
          >
          <button
            class="px-1 text-gray-400 hover:text-gray-700"
            :title="`remover o nível de ${level.points} pontos`"
            @click="emit('remove', index)"
          >
            ✕
          </button>
        </div>
      </div>

      <button
        class="rounded border border-gray-200 px-2 py-0.5 text-[11px] text-gray-600 hover:bg-gray-50"
        @click="emit('add', emptyLevel())"
      >
        adicionar nível
      </button>
    </template>
  </div>
</template>
