# Playbook

## Status

Fresh repo, not yet scaffolded. This file documents the intended stack so setup and future work follow a consistent shape.

## Tech Stack

- **Framework**: Nuxt (latest, v4) — Vue 3 + Nitro
- **Language**: TypeScript throughout (app code, server routes, configs)
- **Styling**: Tailwind CSS
- **Structure**: Monorepo (pnpm workspaces)
- **Package manager**: pnpm

## Monorepo Layout

Convention to follow once scaffolded — adjust as the project's actual needs become clear:

```
playbook/
├── apps/
│   └── web/          # the Nuxt app
├── packages/          # shared code (ui, types, config, utils, etc.)
├── pnpm-workspace.yaml
└── package.json
```

## Setup Commands

```bash
pnpm dlx nuxi@latest init apps/web
pnpm add -D tailwindcss @tailwindcss/vite -w
```

Tailwind is wired into Nuxt via `@tailwindcss/vite` in `nuxt.config.ts` (Tailwind v4 approach) rather than the older `@nuxtjs/tailwindcss` module, unless a reason emerges to prefer the module.

## Conventions

- `<script setup lang="ts">` in all Vue components
- Strict TypeScript (`strict: true`) across all workspace packages
- Shared types/utilities live in `packages/`, imported by `apps/web` via workspace protocol (`workspace:*`)
