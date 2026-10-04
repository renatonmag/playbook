<script setup lang="ts">
import type { Component } from 'vue'
import { Pencil, Plus, Trash2 } from '@lucide/vue'
import { NuxtLink } from '#components'
import { Button } from '@/components/ui/button'
import { Item, ItemActions, ItemContent, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item'

/**
 * A list of named things, edited the way Notion edits its page list: one row each, a pencil on
 * hover to rename it — with a trash can beside the input while renaming — and an add row at the
 * bottom. `/tags` lists strategy buckets with it and `/tags/[strategyId]` lists a bucket's tags,
 * and the two are one component so they cannot drift into two ways of renaming.
 *
 * It owns only the editing — which row is open, the draft, when a commit happens. It persists
 * nothing: `add`, `rename` and `remove` go to the page, which knows what the items are and where
 * they live. Adding is the page's for a further reason: the new item's id comes back from the
 * server, so the page awaits it and then calls `startRename` to drop the row into rename mode.
 *
 * Delete lives in rename mode rather than beside the pencil, so an item is never one stray click
 * on a hovered row away from gone; it takes the pencil first. There is no confirmation beyond that,
 * and no undo — the file the pages write to is in git, which is the undo.
 */

const props = defineProps<{
  items: { id: string; name: string }[]
  /** The add row's label — "Nova estratégia", "Nova tag". */
  addLabel: string
  /** The icon each row leads with. */
  icon: Component
  /** Where a row goes when clicked. Without it the rows are not links. */
  to?: (id: string) => string
}>()

const emit = defineEmits<{
  add: []
  rename: [id: string, name: string]
  remove: [id: string]
}>()

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
  emit('rename', editingId.value, draft.value)
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
 * Clears `editingId` before emitting, so the input unmounts and its blur finds nothing to commit —
 * the trash button's `mousedown.prevent` keeps the blur from firing first, and this is the belt to
 * that brace.
 */
function remove(id: string) {
  editingId.value = null
  emit('remove', id)
}

defineExpose({ startRename })
</script>

<template>
  <ItemGroup class="gap-0.5">
    <template v-for="item in props.items" :key="item.id">
      <Item v-if="editingId === item.id" size="sm" class="py-1.5">
        <ItemMedia><component :is="props.icon" class="size-4 text-muted-foreground" /></ItemMedia>
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
            @click="remove(item.id)"
          >
            <Trash2 />
          </Button>
        </ItemActions>
      </Item>

      <!-- A link when `to` is given — `NuxtLink` renders an `a`, which is what `itemVariants`' hover
           keys on — and a plain row otherwise, whose hover is spelled out since it has no `a`. -->
      <Item
        v-else
        size="sm"
        :as="props.to ? NuxtLink : 'div'"
        :to="props.to?.(item.id)"
        class="py-1.5"
        :class="props.to ? undefined : 'hover:bg-accent/50'"
      >
        <ItemMedia><component :is="props.icon" class="size-4 text-muted-foreground" /></ItemMedia>
        <ItemContent>
          <ItemTitle>{{ item.name }}</ItemTitle>
        </ItemContent>
        <ItemActions class="opacity-0 group-hover/item:opacity-100 focus-within:opacity-100">
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Renomear"
            @click.prevent.stop="startRename(item.id, item.name)"
          >
            <Pencil />
          </Button>
        </ItemActions>
      </Item>
    </template>

    <Item
      size="sm"
      as="button"
      type="button"
      class="w-full py-1.5 text-left text-muted-foreground hover:bg-accent/50 cursor-pointer"
      @click="emit('add')"
    >
      <ItemMedia><Plus class="size-4" /></ItemMedia>
      <ItemContent>{{ props.addLabel }}</ItemContent>
    </Item>
  </ItemGroup>
</template>
