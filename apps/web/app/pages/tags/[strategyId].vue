<script setup lang="ts">
/**
 * One strategy's tag bucket — where its tags will be configured and filled. A placeholder for now:
 * it shows which bucket you opened so the list on `/tags` has somewhere to land, and nothing more.
 */

const route = useRoute()
const { loaded, find } = useStrategies()

const strategy = computed(() => find(String(route.params.strategyId)))
</script>

<template>
  <main class="mx-auto max-w-2xl p-8">
    <NuxtLink to="/tags" class="text-sm text-blue-600 hover:underline">← Estratégias</NuxtLink>

    <ClientOnly>
      <template v-if="strategy">
        <h1 class="mt-4 text-2xl font-bold">{{ strategy.name }}</h1>
        <p class="mt-1 text-sm text-muted-foreground">Configuração das tags desta estratégia — em breve.</p>
      </template>
      <p v-else-if="loaded" class="mt-4 text-sm text-muted-foreground">Estratégia não encontrada.</p>
    </ClientOnly>
  </main>
</template>
