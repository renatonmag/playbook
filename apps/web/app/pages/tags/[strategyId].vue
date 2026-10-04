<script setup lang="ts">
import { Tag } from '@lucide/vue'
import EditableList from '~/components/EditableList.vue'

/**
 * One strategy's tag bucket: the tags that strategy marks the chart with.
 *
 * The same `EditableList` as `/tags`, one level down — "Nova tag" makes a tag and puts it straight
 * into rename mode. A tag is only a name for now; what else it carries is not decided (see
 * `shared/utils/strategy.ts`), so its rows are not links yet.
 */

const route = useRoute()
const { loaded, error, find, addTag, renameTag, removeTag } = useStrategies()

const strategyId = computed(() => String(route.params.strategyId))
const strategy = computed(() => find(strategyId.value))

const list = ref<InstanceType<typeof EditableList> | null>(null)

async function create() {
  const tag = await addTag(strategyId.value)
  if (tag) list.value?.startRename(tag.id, tag.name)
}
</script>

<template>
  <main class="mx-auto max-w-2xl p-8">
    <NuxtLink to="/tags" class="text-sm text-blue-600 hover:underline">← Estratégias</NuxtLink>

    <ClientOnly>
      <template v-if="strategy">
        <h1 class="mt-4 text-2xl font-bold">{{ strategy.name }}</h1>
        <p class="mt-1 text-sm text-muted-foreground">As tags desta estratégia.</p>

        <EditableList
          ref="list"
          class="mt-6"
          :items="strategy.tags"
          :icon="Tag"
          add-label="Nova tag"
          @add="create"
          @rename="(tagId, name) => renameTag(strategyId, tagId, name)"
          @remove="tagId => removeTag(strategyId, tagId)"
        />
        <p v-if="error" class="mt-2 text-sm text-destructive">{{ error }}</p>
      </template>
      <p v-else-if="loaded" class="mt-4 text-sm text-muted-foreground">Estratégia não encontrada.</p>
    </ClientOnly>
  </main>
</template>
