/**
 * A strategy's tag bucket, and the tags in it.
 *
 * A tag is only a name for now — the label a strategy will use to mark what it sees. What a tag
 * eventually holds (a colour, a rule, the stretches of chart it was laid on) is not decided, which
 * is why both levels are `{ id, name }` and nothing more yet.
 *
 * In `shared/` because both halves need it: the Nitro routes that keep `docs/tags/strategies.json`
 * and the pages that list and open the buckets. One definition, so the file and the UI cannot
 * drift into two ideas of what a bucket is.
 */

/**
 * One tag in a strategy's bucket. Not `Tag`: that name is taken by `app/utils/tag.ts`, the grey
 * mark laid across the chart — a different thing, even if one may come to point at the other.
 */
export interface StrategyTag {
  id: string
  name: string
}

export interface Strategy {
  id: string
  name: string
  tags: StrategyTag[]
}

/** What a freshly added bucket or tag is called until the reader renames it — Notion's "Untitled". */
export const UNTITLED = 'Sem título'

/** A blank name reads as `UNTITLED` rather than leaving a row with nothing to click. */
export function strategyName(raw: unknown): string {
  return typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : UNTITLED
}

/**
 * The `{ id, name }` both levels share, or nothing. An entry without a string id is dropped —
 * there is nothing to link to or edit — and a missing name reads as `UNTITLED` rather than costing
 * the entry.
 */
function parseNamed(entry: unknown): (StrategyTag & Record<string, unknown>) | undefined {
  if (typeof entry !== 'object' || entry === null) return undefined
  const fields = entry as Record<string, unknown>
  if (typeof fields.id !== 'string' || fields.id === '') return undefined
  return { ...fields, id: fields.id, name: strategyName(fields.name) }
}

/**
 * Total: whatever is in the file, a list comes out. The file is in the repo and hand-editable, and
 * buckets written before tags existed have no `tags` at all — they read as an empty bucket.
 */
export function parseStrategies(raw: unknown): Strategy[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((entry: unknown) => {
    const named = parseNamed(entry)
    if (!named) return []
    const tags = Array.isArray(named.tags) ? named.tags.flatMap(t => {
      const tag = parseNamed(t)
      return tag ? [{ id: tag.id, name: tag.name }] : []
    }) : []
    return [{ id: named.id, name: named.name, tags }]
  })
}
