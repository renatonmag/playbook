import type { Strategy } from '#shared/utils/strategy'

/**
 * The strategy tag buckets, kept in `docs/tags/strategies.json` through `/api/strategies`.
 *
 * Each mutation waits for the route and then adopts what it returned, rather than editing the list
 * first and hoping. The file is the record — the server mints the id and normalises the name — so
 * the list on screen should be what was written, not what was asked for. One request per click is
 * cheap at this size, and the cost of being optimistic would be a row that vanishes on reload.
 */
export function useStrategies() {
  const strategies = ref<Strategy[]>([])

  /**
   * Whether the first read has come back. The detail page needs it to tell "not read yet" from "no
   * such bucket" — without it, every visit would flash the not-found message for a frame.
   */
  const loaded = ref(false)

  /** The last failure, in Portuguese for the page to show as is; cleared by the next success. */
  const error = ref<string | null>(null)

  async function attempt<T>(call: () => Promise<T>): Promise<T | undefined> {
    try {
      const result = await call()
      error.value = null
      return result
    }
    catch (cause) {
      error.value = `Falha ao salvar as estratégias: ${(cause as Error).message}`
      return undefined
    }
  }

  async function refresh() {
    const list = await attempt(() => $fetch<Strategy[]>('/api/strategies'))
    if (list) strategies.value = list
    loaded.value = true
  }

  // Client-side, like the `localStorage` version this replaced: the pages render the list inside
  // `<ClientOnly>`, and a server-side read would only be thrown away by it.
  onMounted(refresh)

  /** Makes a bucket and returns it, so the caller can open it — Notion's "New page" does. */
  async function add(name?: string): Promise<Strategy | undefined> {
    const created = await attempt(() =>
      $fetch<Strategy>('/api/strategies', { method: 'POST', body: { name } }),
    )
    if (created) strategies.value = [...strategies.value, created]
    return created
  }

  async function rename(id: string, name: string) {
    const updated = await attempt(() =>
      $fetch<Strategy>(`/api/strategies/${id}`, { method: 'PUT', body: { name } }),
    )
    if (updated) strategies.value = strategies.value.map(s => (s.id === id ? updated : s))
  }

  async function remove(id: string) {
    const done = await attempt(() => $fetch(`/api/strategies/${id}`, { method: 'DELETE' }).then(() => true))
    if (done) strategies.value = strategies.value.filter(s => s.id !== id)
  }

  function find(id: string): Strategy | undefined {
    return strategies.value.find(s => s.id === id)
  }

  return { strategies, loaded, error, refresh, add, rename, remove, find }
}
