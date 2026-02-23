import { os } from '@orpc/server'
import { db, type DB } from '../db'

export const dbProviderMiddleware = os
  .$context<{ db?: DB }>()
  .middleware(async ({ context, next }) => {
    return next({
      context: {
        ...context,
        db,
      },
    })
  })