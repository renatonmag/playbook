/** One bucket, or a 404. */
export default defineEventHandler(async (event) => {
  const strategies = await readStrategies()
  return strategies[indexOrNotFound(strategies, getRouterParam(event, 'id'))]
})
