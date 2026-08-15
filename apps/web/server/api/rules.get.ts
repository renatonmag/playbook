/**
 * The saved Forma rules, read from `docs/forma/rules.json` at the repo root.
 *
 * Reached through a Nitro server asset — mounted in `nuxt.config.ts` — rather than `node:fs`,
 * which keeps the app free of `@types/node` and lets the canonical file live in `docs/`, where
 * the project keeps its domain artefacts, instead of inside the web app.
 *
 * Read-only on purpose: the bench offers "copy JSON" and the dev pastes it back, so every saved
 * rule arrives through a commit. A POST here would let a click in a browser write into the
 * repository, which is a lot of authority to hand a page whose whole job is trying things out.
 */
export default defineEventHandler(async () => {
  const forma = useStorage('assets:forma')
  const saved = await forma.getItem('rules.json')

  if (!saved) {
    // An empty list would read as "no rules saved yet", which is a different fact from "the
    // file is missing" — and the second one is a bug the dev has to see. The available keys go
    // in the message because the failure is almost always the mount path in `nuxt.config.ts`,
    // and guessing at it from a bare 500 costs a restart per attempt.
    throw createError({
      statusCode: 500,
      message: `docs/forma/rules.json não está montado. Chaves disponíveis: ${(await forma.getKeys()).join(', ') || 'nenhuma'}`,
    })
  }

  return saved
})
