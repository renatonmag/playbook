/** Removes a bucket. A 404 for one already gone, so a double click is visible rather than silent. */
export default defineEventHandler(async (event) => {
  const strategies = await readStrategies()
  const index = indexOrNotFound(strategies, getRouterParam(event, 'id'))

  await writeStrategies(strategies.toSpliced(index, 1))
  setResponseStatus(event, 204)
  return null
})
