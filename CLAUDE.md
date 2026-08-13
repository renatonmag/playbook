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
pnpm dlx nuxt@latest init apps/web
pnpm add -D tailwindcss @tailwindcss/vite -w
```

Tailwind is wired into Nuxt via `@tailwindcss/vite` in `nuxt.config.ts` (Tailwind v4 approach) rather than the older `@nuxtjs/tailwindcss` module, unless a reason emerges to prefer the module.

## Local Services

Fixed ports. Do **not** start additional instances on other ports.

| Service         | URL                     |
| --------------- | ----------------------- |
| API (FastAPI)   | `http://localhost:8000` |
| Web app (Nuxt)  | `http://localhost:3000` |

Before starting either one, check whether it is already up and reuse it if so:

```bash
curl -sf -o /dev/null http://localhost:8000/health && echo "api up"
curl -sf -o /dev/null http://localhost:3000 && echo "web up"
```

If a port is occupied, do not fall back to another port — the running instance is the one to use.

## Conventions

- `<script setup lang="ts">` in all Vue components
- Strict TypeScript (`strict: true`) across all workspace packages
- Shared types/utilities live in `packages/`, imported by `apps/web` via workspace protocol (`workspace:*`)

## Agent skills

### Issue tracker

Issues and PRDs live as GitHub issues on `renatonmag/playbook`, managed via the `gh` CLI. External PRs are **not** a triage surface. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles use their default label strings (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
