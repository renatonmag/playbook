# Playbook

## What this is

An intelligent alarm system for the Brazilian stock market (B3): it watches price series for
technical patterns, and the ones that survive validation become alerts. What exists today is
the detection half — a Python engine, an HTTP API that runs it, and a Nuxt app for looking at
what it produced. The only Instrument in the database is `WIN@N`, at `5m` and `1h`.

[CONTEXT.md](CONTEXT.md) holds the domain — the glossary, the Pattern/Series contract, the
reasoning — and `docs/adr/` holds the decisions. **Both are still authoritative on the
domain, but CONTEXT.md's "Shape of the system" and "Repo layout" sections predate this
code**: they describe an `apps/ingestor` and a `packages/domain` that do not exist (`domain`
is in `trash/`), and they say no market Pattern is written and nothing reads Supabase. Eleven
Patterns are written, and the API reads Supabase. Trust this file for the tree and the
commands; trust CONTEXT.md for what the words mean.

## Stack

**Web** — `apps/web`. Nuxt 4 (Vue 3 + Nitro), TypeScript, Tailwind v4 wired through
`@tailwindcss/vite` (not `@nuxtjs/tailwindcss`), shadcn-nuxt over reka-ui for components,
`lightweight-charts` v5 for the chart, `@vueuse/core`. Its one Nitro route, `/api/rules`,
reads `docs/forma/rules.json` through a `serverAssets` mount — the rules stay a domain
artefact in `docs/` rather than a copy inside the app.

**API** — `apps/api`. FastAPI + uvicorn, SQLModel and psycopg 3 over the Postgres on
Supabase, `pydantic-settings` reading `apps/api/.env` (gitignored; see `.env.example`). Use
Supabase's **session pooler** host, not the direct connection — the direct one is IPv6-only
and fails on an IPv4 network.

**Engine** — `packages/pattern_engine`. Pure Python, **zero runtime dependencies**. Keep it
that way: it is meant to know nothing about HTTP, the database, or deployment.

**Package managers** — pnpm workspaces for TypeScript, Poetry for Python. Python is 3.12.

## Layout

```
playbook/
├── apps/
│   ├── api/           # FastAPI. Serves the engine + the reads the UI needs.
│   └── web/           # Nuxt 4 app: the monitor and the rule benches.
├── packages/
│   └── pattern_engine/  # Pattern, BaseSeries, PatternEngine, and the Patterns.
├── docs/
│   ├── adr/           # accepted decisions
│   ├── agents/        # how skills consume this repo (see Agent skills below)
│   ├── forma/         # rules.json — saved Forma rules, served to /rules
│   └── research/
├── trash/             # dead code kept around; not built, not imported
├── CONTEXT.md
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

**`apps/api` owns the only Python venv in the repo.** `packages/pattern_engine` has a
`pyproject.toml` so the editable path dependency resolves, but no venv and no lock of its own
— two locks drift in silence. [apps/api/README.md](apps/api/README.md) has the full reasoning.

## Commands

Web (port 3000):

```bash
pnpm install && pnpm dev
```

API (port 8000; `/docs` lists the routes):

```bash
poetry -P apps/api run uvicorn playbook_api.main:app --reload --port 8000
```

Python tests — one run covers `apps/api/tests` **and**
`packages/pattern_engine/tests`, via `testpaths` in `apps/api/pyproject.toml`:

```bash
poetry -P apps/api run pytest
```

TypeScript:

```bash
pnpm -r typecheck
```

First-time Python setup — the interpreter comes from Poetry, not the system:

```bash
poetry python install 3.12.12
```

```bash
poetry -P apps/api env use 3.12.12 && poetry -P apps/api install
```

`.claude/launch.json` defines both servers by name (`web`, `api`). Prefer starting them
through that rather than by hand.

## Local Services

Fixed ports. Do **not** start additional instances on other ports.

| Service         | URL                     |
| --------------- | ----------------------- |
| API (FastAPI)   | `http://localhost:8000` |
| Web app (Nuxt)  | `http://localhost:3000` |

Before starting either one, check whether it is already up and reuse it if so:

```bash
curl -sf -o /dev/null http://localhost:8000/health && echo "api up"
```

```bash
curl -sf -o /dev/null http://localhost:3000 && echo "web up"
```

If a port is occupied, do not fall back to another port — the running instance is the one to use.

## How the pieces fit

**The engine knows nothing about deployment.** `packages/pattern_engine` holds the contract
(`Pattern`, `BaseSeries`, `PatternEngine`, `Candle`, `Pivot`) and the Patterns themselves in
`patterns/`. **Which** Patterns an installation runs is a deployment decision and lives in
[`apps/api/src/playbook_api/pipeline.py`](apps/api/src/playbook_api/pipeline.py) — declaration
order is run order, there is no scheduler and no dependency graph. Read that module's
docstring before changing the pipeline; a slicer declared ahead of its detector reads a key
that is not in `ctx` yet.

**Routes** (`apps/api/src/playbook_api/routers/`): `/candles`, `/patterns`, `/shapes`,
`/health`, and `WS /ws/candles` for the live edge. Two things about them trip people up:

- **`/patterns` reads closed bars only**, and a bar counts as closed when a later bar exists
  — no clock is consulted, deliberately. `/candles` does draw the forming bar, so the
  monitor's overlays sit one bar behind its candles. That gap is by design, not a defect.
- **`/patterns` takes one parameter the browser cannot evaluate for itself**: the `FormaRule`
  thresholds applied to `leg-reversals`. Everything else about the pipeline is code. The
  reasoning, and the three rules that keep it from becoming "the browser authors the
  pipeline", are in `routers/patterns.py`'s module docstring.

**Pages** (`apps/web/app/pages/`): `/monitor` is the working surface — the chart, the overlay
sidebar, and the pipeline runs. `/verify` reads the same Patterns as tables, for the ones that
are checked by reading rather than by looking. `/rules`, `/two-bar-reversal` and `/record-bars`
are benches: they fetch Shapes once from `/shapes` and evaluate every rule in the browser, so
no rule parameter reaches the server. `/` is a placeholder Alarms list.

**Adding a Pattern** usually goes: the Pattern plus tests in `packages/pattern_engine` → an
instance in `pipeline.py` → its Point type in `apps/web/app/types/pattern.ts` → an overlay
registered in `OVERLAYS` in `monitor.vue`, or a verifier in `verify.vue`.

## Conventions

- `<script setup lang="ts">` in all Vue components.
- Strict TypeScript across the workspace, with `noUncheckedIndexedAccess` — see
  `tsconfig.base.json`.
- **Comments carry the reasoning, not the mechanics.** Nearly every module here opens with a
  docblock saying why it exists, what it deliberately does not do, and what that costs. This
  is well above the usual density and it is the house style — code written to the industry
  default reads as unfinished next to it.
- **UI copy is Portuguese; identifiers, comments and documentation are English.**
- CONTEXT.md's glossary is the authority on domain words (Instrument, Candle, Series, Point,
  Pivot, Pattern, Validation, Signal, Alarm, Alert) and lists the synonyms to avoid.
- Commit subjects are prose imperative sentences describing the behaviour change — "Let a
  click on a candle pick out the lines that end there" — not `type(scope):`.

## Agent skills

### Issue tracker

Issues and PRDs live as GitHub issues on `renatonmag/playbook`, managed via the `gh` CLI. External PRs are **not** a triage surface. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles use their default label strings (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
