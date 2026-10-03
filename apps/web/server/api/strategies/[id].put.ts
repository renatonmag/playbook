import { strategyName, type Strategy } from '#shared/utils/strategy'

/** Replaces a bucket's fields — only `name` exists yet. The id is the URL's and does not move. */
export default defineEventHandler(async (event) => {
  const strategies = await readStrategies()
  const index = indexOrNotFound(strategies, getRouterParam(event, 'id'))
  const body = await readBody<{ name?: unknown } | undefined>(event)

  const updated: Strategy = { ...strategies[index]!, name: strategyName(body?.name) }
  await writeStrategies(strategies.with(index, updated))
  return updated
})
