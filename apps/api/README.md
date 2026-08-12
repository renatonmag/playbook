# @playbook/api

Playbook's HTTP API (FastAPI). Serves the SaaS endpoints, including the pattern engine.

It coexists with the Nuxt Nitro API in `apps/web`: Nitro serves what the UI needs (auth,
Alarms, reads of the DB), this serves the engine.

## The venv

**This directory owns the only Python venv in the repo.** `packages/pattern_engine` has a
`pyproject.toml` — needed for the editable path dependency to resolve — but no venv and no
lock of its own. Two locks drift in silence.

```bash
poetry env use 3.12.12
poetry install
```

Python 3.12.12 comes from Poetry, not the system:

```bash
poetry python install 3.12.12
```

## Commands

Run from `apps/api`:

```bash
poetry run uvicorn playbook_api.main:app --reload --port 8000
```

```bash
poetry run pytest
```

`pytest` covers both this package's tests and `packages/pattern_engine/tests` — the engine is
installed editable, so the venv is the whole Python side of the repo.

From the repo root, `-P` avoids the `cd`:

```bash
poetry -P apps/api run pytest
```
