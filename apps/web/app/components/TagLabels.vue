<script setup lang="ts">
import { X } from '@lucide/vue'
import type { Strategy, StrategyTag } from '#shared/utils/strategy'
import { Badge } from '~/components/ui/badge'
import { Combobox, ComboboxAnchor, ComboboxEmpty, ComboboxGroup, ComboboxInput, ComboboxItem, ComboboxList, ComboboxViewport } from '~/components/ui/combobox'

/**
 * What an open chart tag holds: a combobox of the strategy tags kept at `/tags`, and the ones
 * already filed under this stretch, as badges beneath it.
 *
 * Apart from `TagOverlay` because that one is about geometry and gestures, and this is about the
 * buckets — a list read from a file, searched, picked from. Neither needs to know the other's half.
 *
 * **It reads the buckets itself, on mount**, which is every time a tag opens: `useStrategies` is
 * one small request, and a bucket edited in the `/tags` tab — which the toolbar opens in a new tab
 * on purpose — is then current the next time a bar is clicked, without the monitor holding a copy
 * that would go stale behind it.
 *
 * It only reports the new list. The tag is the page's, and so is writing the change into it.
 */
const labels = defineModel<string[]>('labels', { required: true })

const { strategies, error } = useStrategies()

/**
 * Open state and search text held here, `IndicatorMenu`'s reason: picking is an action, not a value
 * the combobox keeps, so it has neither a selection change to close on nor a reason to clear the box.
 */
const open = ref(false)
const search = ref('')

/** Every strategy tag by id, with the bucket it is in — what turns a label back into a name. */
const byId = computed(() => {
  const map = new Map<string, { tag: StrategyTag, strategy: Strategy }>()
  for (const strategy of strategies.value) {
    for (const tag of strategy.tags) map.set(tag.id, { tag, strategy })
  }
  return map
})

/** The buckets with what is left to pick in each. A bucket with nothing left is not a heading. */
const choices = computed(() =>
  strategies.value
    .map(strategy => ({ strategy, tags: strategy.tags.filter(tag => !labels.value.includes(tag.id)) }))
    .filter(group => group.tags.length > 0),
)

/** The labels that still resolve; an id whose strategy tag was deleted is not drawn. */
const picked = computed(() => labels.value.flatMap(id => byId.value.get(id) ?? []))

function pick(id: string) {
  if (!labels.value.includes(id)) labels.value = [...labels.value, id]
  search.value = ''
  open.value = false
}

function unpick(id: string) {
  labels.value = labels.value.filter(label => label !== id)
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <Combobox v-model:open="open" :ignore-filter="false" open-on-click>
      <ComboboxAnchor class="w-full rounded-sm bg-white">
        <!-- `display-value` blank: the combobox would otherwise write the picked item back into the
             box, and what was picked is the badges' to show, not the search's. -->
        <ComboboxInput
          v-model="search"
          :display-value="() => ''"
          placeholder="Buscar tag…"
          class="h-8 text-sm"
        />
      </ComboboxAnchor>

      <ComboboxList align="start" class="w-72">
        <!-- A fixed height that scrolls, so the card's dropdown is one size however many buckets
             `/tags` holds. Reka's viewport rather than an overflow on the list: arrowing through
             the items keeps the highlighted one scrolled into view. -->
        <ComboboxViewport class="h-60">
          <ComboboxEmpty class="py-3 text-center text-xs text-gray-500">
            Nenhuma tag.
          </ComboboxEmpty>
          <ComboboxGroup
            v-for="group in choices"
            :key="group.strategy.id"
            :heading="group.strategy.name"
          >
            <ComboboxItem
              v-for="tag in group.tags"
              :key="tag.id"
              :value="tag.id"
              :text-value="`${group.strategy.name} ${tag.name}`"
              class="text-xs"
              @select="pick(tag.id)"
            >
              {{ tag.name }}
            </ComboboxItem>
          </ComboboxGroup>
        </ComboboxViewport>
      </ComboboxList>
    </Combobox>

    <p v-if="error" class="text-xs text-red-700">
      {{ error }}
    </p>

    <div v-if="picked.length > 0" class="flex flex-wrap gap-1">
      <Badge
        v-for="{ tag, strategy } in picked"
        :key="tag.id"
        variant="secondary"
        :title="strategy.name"
      >
        {{ tag.name }}
        <button
          type="button"
          class="-mr-1 rounded-sm opacity-60 hover:opacity-100"
          :aria-label="`Remover ${tag.name}`"
          @click="unpick(tag.id)"
        >
          <X class="size-3" />
        </button>
      </Badge>
    </div>
  </div>
</template>
