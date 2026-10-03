/**
 * A strategy's tag bucket: the named place a strategy's tags will be configured and filled.
 * Only the identity exists yet — what goes inside a bucket is `/tags/[strategyId]`'s job, and that
 * page is a placeholder.
 *
 * In `shared/` because both halves need it: the Nitro routes that keep `docs/tags/strategies.json`
 * and the pages that list and open the buckets. One definition, so the file and the UI cannot
 * drift into two ideas of what a bucket is.
 */
export interface Strategy {
  id: string
  name: string
}

/** What a freshly added bucket is called until the reader renames it — Notion's "Untitled". */
export const UNTITLED = 'Sem título'

/** A blank name reads as `UNTITLED` rather than leaving a row with nothing to click. */
export function strategyName(raw: unknown): string {
  return typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : UNTITLED
}

/**
 * Total: whatever is in the file, a list comes out. The file is in the repo and hand-editable, so
 * an entry without a string id is dropped — there is nothing to link to — and a missing name reads
 * as `UNTITLED` rather than costing the bucket.
 */
export function parseStrategies(raw: unknown): Strategy[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((entry: unknown) => {
    if (typeof entry !== 'object' || entry === null) return []
    const { id, name } = entry as Record<string, unknown>
    if (typeof id !== 'string' || id === '') return []
    return [{ id, name: strategyName(name) }]
  })
}
