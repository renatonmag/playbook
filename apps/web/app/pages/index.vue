<script setup lang="ts">
import type { Timeframe } from '~/types/candle'

/** Placeholder until Alarms are persisted — the shared domain package is not back yet. */
interface Alarm {
  id: string
  ticker: string
  timeframe: Timeframe
  patternId: string
  enabled: boolean
}

const alarms: Alarm[] = [
  {
    id: 'demo-1',
    ticker: 'PETR4',
    timeframe: '15m',
    patternId: 'inside-bar',
    enabled: true,
  },
]
</script>

<template>
  <main class="mx-auto max-w-2xl p-8">
    <h1 class="text-2xl font-bold">Playbook</h1>
    <p class="mt-1 text-sm text-gray-500">Alarmes inteligentes para a B3</p>

    <div class="mt-4 flex gap-4">
      <NuxtLink to="/monitor" class="text-sm text-blue-600 hover:underline">
        Abrir o monitor →
      </NuxtLink>
      <NuxtLink to="/verify" class="text-sm text-blue-600 hover:underline">
        Verificar padrões →
      </NuxtLink>
    </div>

    <ul class="mt-6 space-y-2">
      <li
        v-for="alarm in alarms"
        :key="alarm.id"
        class="rounded border border-gray-200 p-3 text-sm"
      >
        <span class="font-mono font-semibold">{{ alarm.ticker }}</span>
        <span class="text-gray-500"> · {{ alarm.timeframe }} · {{ alarm.patternId }}</span>
      </li>
    </ul>
  </main>
</template>
