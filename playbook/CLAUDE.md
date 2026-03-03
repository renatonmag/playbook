# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev      # Start development server
pnpm build    # Build for production
pnpm start    # Start production server
```

Database migrations (Drizzle Kit):
```bash
pnpm drizzle-kit generate   # Generate migration from schema changes
pnpm drizzle-kit migrate    # Apply migrations
```

## Architecture

This is a **SolidJS + SolidStart** full-stack app for managing trading patterns ("components") and trade sessions. It uses file-based routing via Vinxi.

### Key Directories

- `src/routes/` — File-based routes. UI pages live here (`lists.tsx`, `pattern.tsx`, `trade/[id].tsx`). API endpoints at `routes/api/` and the oRPC handler at `routes/rpc/[...rest].ts`.
- `src/routers.ts` — All oRPC procedure definitions (the actual API logic). `router` export maps to `component.*` and `trade.*` namespaces.
- `src/orpc.ts` — oRPC middleware: `pub` (public) and `authed` (requires user in context) procedure builders.
- `src/lib/orpc.ts` — Client-side oRPC setup. Exports `client` (typed RPC client) and `orpc` (TanStack Query utils). All API calls from components go through `orpc.*` query/mutation options.
- `src/lib/orpc.server.ts` — Server-side oRPC setup (SSR context, user injection).
- `src/db/schema.ts` — Drizzle schema. Key tables: `componentsTable`, `setupsTable`, `markdownTable`, `imagesTable`, `categoriesTable`.
- `src/db/queries/` — CRUD functions called by `routers.ts`.
- `src/store/` — Global Solid store. `storeContext.tsx` creates the app store; `createComponents.ts` and `createTradeSessions.ts` compose into it.

### Data Flow

1. **Client → Server:** Components use `orpc.component.listByUser.queryOptions()` / `orpc.component.create.mutationOptions()` from TanStack Query. These batch-request to `/rpc`.
2. **RPC Handler:** `routes/rpc/[...rest].ts` receives requests, applies `authed` middleware (injects user from context), routes to handlers in `routers.ts`.
3. **Database:** Handlers call `db/queries/*.ts` functions which use Drizzle ORM against PostgreSQL (Supabase).
4. **Legacy REST API:** `routes/api/_components/` also exists but oRPC is the preferred path.

### Global Store

`useStore()` returns `[state, actions]`. The store's `state.components` is actually a TanStack Query result (from `createComponents.ts`), not plain Solid store state. Actions like `createComponent`, `updateComponent`, `loadComponent` are attached to `actions` object via `Object.assign`.

The hardcoded `user.id: 1` in `storeContext.tsx` means there's currently no real auth — all operations use userId 1.

### Component ("Pattern") Data Model

A `component` in the DB represents a trading pattern with:
- `kind`: `"component"` (main pattern) or `"detail"` (sub-pattern)
- `questions`: JSONB array of `{ id, question, questionFunction, answers: [{ answer, consequence }] }` where `consequence` links to another component
- `imageComparisons`: JSONB array of `{ before, after }` image ID pairs
- `exemples`: JSONB array of `{ uri, key }` (UploadThing uploads)
- `markdownId`: FK to `markdownTable` for the description

### Tech Stack

| Concern | Library |
|---|---|
| Framework | SolidJS + SolidStart |
| Routing | @solidjs/router (file-based) |
| RPC | @orpc/server + @orpc/client |
| Server state | @tanstack/solid-query |
| ORM | drizzle-orm (PostgreSQL) |
| Validation | zod v4 |
| Styling | Tailwind CSS v4 + @kobalte/core |
| File uploads | uploadthing |
| Icons | lucide-solid |

### Path Aliases

`~/` maps to `src/` (configured in `tsconfig.json`).

### Environment Variables

- `VITE_DATABASE_URL` — PostgreSQL connection string (Supabase)
- `UPLOADTHING_TOKEN` — UploadThing API key
