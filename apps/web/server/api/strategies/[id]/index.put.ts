import { strategyName, type Strategy } from '#shared/utils/strategy'

/**
 * Renames a bucket. Only `name` is taken from the body: the id is the URL's, and the tags have
 * their own routes under `[id]/tags`, so a rename can never drop them.
 */
export default defineEventHandler(async (event) => {
  const strategies = await readStrategies()
  const index = indexOrNotFound(strategies, getRouterParam(event, 'id'))
  const body = await readBody<{ name?: unknown } | undefined>(event)

  const updated: Strategy = { ...strategies[index]!, name: strategyName(body?.name) }
  await writeStrategies(strategies.with(index, updated))
  return updated
})
