# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

**Layout: single-context.** One `CONTEXT.md` and one `docs/adr/` at the repo root, covering the whole workspace. Neither exists yet — that's expected; they get created lazily (see below).

## Before exploring, read these

- **`CONTEXT.md`** at the repo root, or
- **`CONTEXT-MAP.md`** at the repo root if it exists — it points at one `CONTEXT.md` per context. Read each one relevant to the topic.
- **`docs/adr/`** — read ADRs that touch the area you're about to work in. In multi-context repos, also check the context-scoped `docs/adr/` under the relevant workspace package.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## File structure

Single-context — what this repo uses today:

```
playbook/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-nuxt-4-over-nuxt-3.md
│   └── 0002-tailwind-via-vite-plugin.md
├── apps/
│   └── web/
└── packages/
```

Multi-context — only if this repo later splits (signalled by a `CONTEXT-MAP.md` at the root):

```
playbook/
├── CONTEXT-MAP.md
├── docs/adr/                          ← workspace-wide decisions
├── apps/
│   └── web/
│       ├── CONTEXT.md
│       └── docs/adr/                  ← context-specific decisions
└── packages/
    └── <package>/
        ├── CONTEXT.md
        └── docs/adr/
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders) — but worth reopening because…_
