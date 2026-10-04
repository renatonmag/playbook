import { strategyName, type StrategyTag } from '#shared/utils/strategy'

/** A new tag at the end of a bucket. Minted here for the reason `strategies/index.post.ts` gives. */
export default defineEventHandler(async (event) => {
  const strategies = await readStrategies()
  const index = indexOrNotFound(strategies, getRouterParam(event, 'id'))
  const strategy = strategies[index]!
  const body = await readBody<{ name?: unknown } | undefined>(event)

  const tag: StrategyTag = { id: crypto.randomUUID(), name: strategyName(body?.name) }
  await writeStrategies(strategies.with(index, { ...strategy, tags: [...strategy.tags, tag] }))
  setResponseStatus(event, 201)
  return tag
})
