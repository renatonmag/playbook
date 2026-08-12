# playbook

An intelligent alarm system for the Brazilian stock market (B3). See [CONTEXT.md](CONTEXT.md)
for what it does and how the pieces fit.

## Running the API

The FastAPI service in [`apps/api`](apps/api) serves the SaaS endpoints, including the pattern
engine. From the repo root:

```bash
poetry -P apps/api run uvicorn playbook_api.main:app --reload --port 8000
```

`http://localhost:8000/health` should answer, and `/docs` lists the routes.

Tests — this covers both `apps/api` and `packages/pattern_engine`, which share one venv:

```bash
poetry -P apps/api run pytest
```

## First-time setup

Python comes from Poetry, not the system:

```bash
poetry python install 3.12.12
```

```bash
poetry -P apps/api env use 3.12.12 && poetry -P apps/api install
```

`apps/api` owns the only Python venv in the repo — `packages/pattern_engine` is installed into
it as an editable path dependency. See [apps/api/README.md](apps/api/README.md).

The Nuxt app:

```bash
pnpm install && pnpm dev
```
