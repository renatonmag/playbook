<script setup lang="ts">
import { Sigma } from '@lucide/vue'
import { Button } from '~/components/ui/button'
import { Combobox, ComboboxAnchor, ComboboxEmpty, ComboboxGroup, ComboboxInput, ComboboxItem, ComboboxList, ComboboxTrigger } from '~/components/ui/combobox'
import { INDICATOR_KINDS, type IndicatorKind } from '~/utils/indicator'

/**
 * The button that puts an indicator on the chart, and the list of the ones there are.
 *
 * A combobox rather than a dropdown, which is a bet about where this goes: the catalogue is one row
 * today and is meant to grow to the dozen or so lines anybody actually draws, at which point
 * picking one by scrolling is worse than typing three letters of its name. The search box costs
 * nothing at one row and is the whole difference at twelve.
 *
 * It adds and nothing else. What an instance then *is* — its settings, whether it is drawn, what it
 * is called — belongs to the page, which is why this emits a kind and forgets about it: a menu that
 * held the list would be a second place for the chart's indicators to live. The button says nothing
 * about what is already on the chart either; the legend in the corner of the pane names every line
 * there is, and a second, vaguer answer to the same question here would only disagree with it.
 */
const emit = defineEmits<{ add: [kind: IndicatorKind] }>()

/**
 * Open state held here rather than left to the component, because picking a row has to close the
 * list: the model is never set — this is a menu of actions, not a value being chosen — so there is
 * no selection change for the combobox to close itself on.
 */
const open = ref(false)

function pick(kind: IndicatorKind) {
  emit('add', kind)
  open.value = false
}
</script>

<template>
  <Combobox v-model:open="open" :ignore-filter="false">
    <!-- `w-8` on the anchor, not on the button: the anchor is 200px wide by default — it is built
         for a combobox you type into — and as `as-child` that width lands on the button ahead of
         the button's own classes, so the square has to be restated at the place the 200px is. -->
    <ComboboxAnchor as-child class="w-8">
      <ComboboxTrigger as-child>
        <!-- The shared `Button` at the shared `icon-sm`, with no size of its own: it stands beside
             the ellipsis and the two have to read as one pair of controls rather than as two sizes
             of button, and a hand-rolled size here is a size that stops matching the moment either
             side of the pair is touched. `shrink-0` because the header is a flex row and an
             anchor's child will otherwise be stretched to whatever is left of it. -->
        <Button
          variant="outline"
          size="icon-sm"
          class="shrink-0 text-gray-500"
          title="indicadores"
          aria-label="indicadores"
        >
          <Sigma />
        </Button>
      </ComboboxTrigger>
    </ComboboxAnchor>

    <ComboboxList align="end" class="w-56">
      <ComboboxInput placeholder="Buscar indicador…" class="h-8 text-xs" />
      <ComboboxEmpty class="py-3 text-center text-xs text-gray-500">
        Nenhum indicador.
      </ComboboxEmpty>
      <ComboboxGroup class="p-1">
        <ComboboxItem
          v-for="entry in INDICATOR_KINDS"
          :key="entry.kind"
          :value="entry.label"
          class="text-xs"
          @select="pick(entry.kind)"
        >
          {{ entry.label }}
          <!-- The kind, which is the name the chip will carry. Shown here so the strip's `wma-30`
               is something you have already read once rather than an abbreviation to work out. -->
          <span class="ml-auto font-mono text-gray-400">{{ entry.kind }}</span>
        </ComboboxItem>
      </ComboboxGroup>
    </ComboboxList>
  </Combobox>
</template>
