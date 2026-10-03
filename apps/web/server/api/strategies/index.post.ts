import { strategyName, type Strategy } from '#shared/utils/strategy'

/**
 * A new bucket, appended. The id is minted here rather than by the page: the file is the record,
 * so the file's writer is the one that names things in it.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody<{ name?: unknown } | undefined>(event)
  const strategy: Strategy = { id: crypto.randomUUID(), name: strategyName(body?.name) }

  await writeStrategies([...(await readStrategies()), strategy])
  setResponseStatus(event, 201)
  return strategy
})
