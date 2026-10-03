<script setup lang="ts">
import { FileText, Pencil, Plus, Trash2 } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Item, ItemActions, ItemContent, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item'

/**
 * The strategy tag buckets, listed the way Notion lists pages: one row per bucket, a pencil on
 * hover to rename it — with a trash can beside the input while renaming — and a "Nova estratégia"
 * row at the bottom that makes one and opens it. The monitor's `Tags` button lands here.
 *
 * Delete lives in rename mode rather than beside the pencil, so a bucket is never one stray click
 * on a hovered row away from gone; it takes the pencil first. There is no confirmation beyond that,
 * and no undo — the file is in git, which is the undo.
 *
 * A bucket is only a name and an id for now — `/tags/[strategyId]` is where its tags will be
 * configured, and it is a placeholder. Buckets live in `docs/tags/strategies.json`; see
 * `useStrategies` and `server/utils/strategies.ts`.
 */

const { strategies, error, add, rename, remove } = useStrategies()

/** The one row being renamed, if any — one at a time, as in Notion. */
const editingId = ref<string | null>(null)
const draft = ref('')

function startRename(id: string, name: string) {
  editingId.value = id
  draft.value = name
}

/**
 * Enter and blur both commit, and Enter's commit blurs the input, so the second call has to find
 * nothing to do rather than rename twice.
 */
function commitRename() {
  if (editingId.value === null) return
  rename(editingId.value, draft.value)
  editingId.value = null
}

function cancelRename() {
  editingId.value = null
}

/** `ref` in a `v-for` is an array; there is only ever one input mounted, so focus the first. */
const renameInput = ref<HTMLInputElement[]>([])
watch(editingId, async (id) => {
  if (id === null) return
  await nextTick()
  renameInput.value[0]?.select()
})

/**
 * Clears `editingId` before the request, so the input unmounts and its blur finds nothing to
 * commit — the trash button's `mousedown.prevent` keeps the blur from firing first, and this is
 * the belt to that brace.
 */
async function deleteStrategy(id: string) {
  editingId.value = null
  await remove(id)
}

async function create() {
  const strategy = await add()
  if (strategy) await navigateTo(`/tags/${strategy.id}`)
}
</script>

<template>
  <main class="mx-auto max-w-2xl p-8">
    <h1 class="text-2xl font-bold">Estratégias</h1>
    <p class="mt-1 text-sm text-muted-foreground">Cada estratégia guarda o seu próprio conjunto de tags.</p>

    <ClientOnly>
      <ItemGroup class="mt-6 gap-0.5">
        <template v-for="strategy in strategies" :key="strategy.id">
          <Item v-if="editingId === strategy.id" size="sm" class="py-1.5">
            <ItemMedia><FileText class="size-4 text-muted-foreground" /></ItemMedia>
            <ItemContent>
              <input
                ref="renameInput"
                v-model="draft"
                class="w-full rounded-sm bg-transparent text-sm font-medium outline-none ring-1 ring-ring/50 px-1"
                @keydown.enter="($event.target as HTMLInputElement).blur()"
                @keydown.escape="cancelRename"
                @blur="commitRename"
              >
            </ItemContent>
            <ItemActions>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Excluir"
                class="text-muted-foreground hover:text-destructive"
                @mousedown.prevent
                @click="deleteStrategy(strategy.id)"
              >
                <Trash2 />
              </Button>
            </ItemActions>
          </Item>

          <Item v-else size="sm" as-child class="py-1.5">
            <NuxtLink :to="`/tags/${strategy.id}`">
              <ItemMedia><FileText class="size-4 text-muted-foreground" /></ItemMedia>
              <ItemContent>
                <ItemTitle>{{ strategy.name }}</ItemTitle>
              </ItemContent>
              <ItemActions class="opacity-0 group-hover/item:opacity-100 focus-within:opacity-100">
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Renomear"
                  @click.prevent.stop="startRename(strategy.id, strategy.name)"
                >
                  <Pencil />
                </Button>
              </ItemActions>
            </NuxtLink>
          </Item>
        </template>

        <Item
          size="sm"
          as="button"
          type="button"
          class="w-full py-1.5 text-left text-muted-foreground hover:bg-accent/50 cursor-pointer"
          @click="create"
        >
          <ItemMedia><Plus class="size-4" /></ItemMedia>
          <ItemContent>Nova estratégia</ItemContent>
        </Item>
      </ItemGroup>
      <p v-if="error" class="mt-2 text-sm text-destructive">{{ error }}</p>
    </ClientOnly>

    <div class="mt-6">
      <NuxtLink to="/monitor" class="text-sm text-blue-600 hover:underline">
        ← Voltar ao monitor
      </NuxtLink>
    </div>
  </main>
</template>
