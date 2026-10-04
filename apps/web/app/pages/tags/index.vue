<script setup lang="ts">
import { FileText } from '@lucide/vue'
import EditableList from '~/components/EditableList.vue'

/**
 * The strategy tag buckets. The monitor's `Tags` button lands here.
 *
 * The list is `EditableList`, shared with each bucket's own page, which says how editing works.
 * "Nova estratégia" makes a bucket and puts it straight into rename mode, so the name is the first
 * thing typed — the bucket's page is a click on the row away, not where adding lands you.
 *
 * Buckets live in `docs/tags/strategies.json`; see `useStrategies` and `server/utils/strategies.ts`.
 */

const { strategies, error, add, rename, remove } = useStrategies()

const list = ref<InstanceType<typeof EditableList> | null>(null)

async function create() {
  const strategy = await add()
  if (strategy) list.value?.startRename(strategy.id, strategy.name)
}
</script>

<template>
  <main class="mx-auto max-w-2xl p-8">
    <h1 class="text-2xl font-bold">Estratégias</h1>
    <p class="mt-1 text-sm text-muted-foreground">Cada estratégia guarda o seu próprio conjunto de tags.</p>

    <ClientOnly>
      <EditableList
        ref="list"
        class="mt-6"
        :items="strategies"
        :icon="FileText"
        add-label="Nova estratégia"
        :to="id => `/tags/${id}`"
        @add="create"
        @rename="rename"
        @remove="remove"
      />
      <p v-if="error" class="mt-2 text-sm text-destructive">{{ error }}</p>
    </ClientOnly>

    <div class="mt-6">
      <NuxtLink to="/monitor" class="text-sm text-blue-600 hover:underline">
        ← Voltar ao monitor
      </NuxtLink>
    </div>
  </main>
</template>
