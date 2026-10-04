import { strategyName, type StrategyTag } from '#shared/utils/strategy'

/** Renames one tag. Its id is the URL's and does not move. */
export default defineEventHandler(async (event) => {
  const strategies = await readStrategies()
  const index = indexOrNotFound(strategies, getRouterParam(event, 'id'))
  const strategy = strategies[index]!
  const at = tagIndexOrNotFound(strategy, getRouterParam(event, 'tagId'))
  const body = await readBody<{ name?: unknown } | undefined>(event)

  const tag: StrategyTag = { ...strategy.tags[at]!, name: strategyName(body?.name) }
  await writeStrategies(strategies.with(index, { ...strategy, tags: strategy.tags.with(at, tag) }))
  return tag
})
