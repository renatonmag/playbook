/** Removes one tag from its bucket. A 404 for one already gone, as for a bucket. */
export default defineEventHandler(async (event) => {
  const strategies = await readStrategies()
  const index = indexOrNotFound(strategies, getRouterParam(event, 'id'))
  const strategy = strategies[index]!
  const at = tagIndexOrNotFound(strategy, getRouterParam(event, 'tagId'))

  await writeStrategies(strategies.with(index, { ...strategy, tags: strategy.tags.toSpliced(at, 1) }))
  setResponseStatus(event, 204)
  return null
})
