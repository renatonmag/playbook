<script setup lang="ts">
import { asTicker, type Alarm, type PatternId } from '@playbook/domain'

// Placeholder until Alarms are persisted — proves the domain package resolves.
const alarms: Alarm[] = [
  {
    id: 'demo-1',
    ticker: asTicker('petr4'),
    timeframe: '15m',
    patternId: 'inside-bar' as PatternId,
    enabled: true,
  },
]
</script>

<template>
  <main class="mx-auto max-w-2xl p-8">
    <h1 class="text-2xl font-bold">Playbook</h1>
    <p class="mt-1 text-sm text-gray-500">Alarmes inteligentes para a B3</p>

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
