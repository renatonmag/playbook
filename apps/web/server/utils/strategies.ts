import { parseStrategies, type Strategy } from '#shared/utils/strategy'

/**
 * `docs/tags/strategies.json`, read and written whole.
 *
 * Unlike `rules.get.ts`, which refuses to let a browser write into the repository, this one does
 * so on purpose: a bucket is made and renamed by clicking, and there is no "copy JSON and commit
 * it" step that would make sense for a name. The file is still in `docs/` and still tracked, so
 * every change shows up in `git status` — the browser writes, but git is where it is reviewed.
 *
 * Whole-file replace, no locking. One developer, one browser tab: two writes racing would lose
 * one, and that is not a case this app has. If it grows a second writer, this is the thing to
 * replace — by a table, not by a lock around a JSON file.
 */

/** Mounted in `nuxt.config.ts` under this name, with the `fs` driver. */
const STORAGE = 'strategies'
const FILE = 'strategies.json'

export async function readStrategies(): Promise<Strategy[]> {
  // A missing file is the ordinary first run, not an error: no buckets yet.
  return parseStrategies(await useStorage(STORAGE).getItem(FILE))
}

/** Pretty-printed, because the file is read in `git diff` far more often than it is parsed. */
export async function writeStrategies(strategies: Strategy[]): Promise<void> {
  await useStorage(STORAGE).setItem(FILE, `${JSON.stringify(strategies, null, 2)}\n`)
}

/** The bucket's index, or a 404 — every route that takes an `:id` starts here. */
export function indexOrNotFound(strategies: Strategy[], id: string | undefined): number {
  const index = strategies.findIndex(s => s.id === id)
  if (index === -1) {
    throw createError({ statusCode: 404, message: 'Estratégia não encontrada.' })
  }
  return index
}
