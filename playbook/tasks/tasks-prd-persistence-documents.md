## Relevant Files

- `playbook/convex/documents.ts` - Convex query/mutation endpoints for document/block CRUD persistence.
- `playbook/convex/schema.ts` - Confirms data model alignment with persistence needs (no changes expected).
- `playbook/src/stores/createDocumentStore.ts` - Wire store to server IDs and persist CRUD actions.
- `playbook/src/cvxsolid.ts` - Solid Convex hooks used for queries/mutations integration.
- `playbook/src/app.tsx` - Ensure Convex client/provider wiring for hooks availability.
- `playbook/src/routes/sidebar/[documentId].tsx` - Consumes store; ensure it loads persisted data correctly.
- `playbook/src/routes/sidebar/[documentId].tsx` - Fetch document by id on navigation and ensure it seeds/uses the store.

## Tasks

- [x] 1.0 Implement Convex document/block CRUD functions in `playbook/convex/documents.ts`

  - [x] 1.1 Add `createDocument` mutation: create document, create first text block, set document `blocks=[firstBlockId]`, return `{ documentId, firstBlockId }`.
  - [x] 1.2 Add `getDocuments` query: return all documents with fields `{ _id, title, blocks }`.
  - [x] 1.3 Add `getDocumentById` query: input `{ documentId }`, return the document and optionally expanded blocks array.
  - [x] 1.4 Add `addBlock` mutation: input `{ documentId }`, create new text block, append id to document `blocks`, return `{ blockId }`.
  - [x] 1.5 Add `updateBlock` mutation: input `{ blockId, content?, type?, checked? }`, partial update only.
  - [x] 1.6 Add `removeBlock` mutation: input `{ documentId, blockId }`, enforce minimum 1 block, remove id from document `blocks`, delete the block.
  - [x] 1.7 Add `deleteDocument` mutation: input `{ documentId }`, delete all block records in `blocks` array, then delete the document.

- [ ] 2.0 Wire `createDocumentStore` to server: create, seed, and persist CRUD

  - [x] 2.1 Replace local `createDefaultDocument` id generation with call to `createDocument` mutation (pass default `strategyId`).
  - [x] 2.2 Use returned `{ documentId, firstBlockId }` to seed the local store state.
  - [x] 2.3 Update `actions.createDocument` to await server mutation, then update store and set active document id.
  - [x] 2.4 Update `actions.addBlock` to call server `addBlock`, then insert new block locally with returned id.
  - [x] 2.5 Update `actions.updateBlockContent` to call server `updateBlock` with computed `type` and `content`, then update local state on success.
  - [x] 2.6 Update `actions.removeBlock` to call server `removeBlock`, then update local state on success (preserve focus behavior client-side).
  - [x] 2.7 Update `actions.setBlockTypeToText` to also call `updateBlock` when type changes.
  - [x] 2.8 Update `actions.createDocument` and others to not persist caret/focused block.

- [ ] 4.0 Integrate Solid Convex hooks (`createQuery`/`createMutation`) across store flows

  - [ ] 4.1 Ensure `ConvexClient` provider is set at app root; verify `playbook/src/app.tsx` wraps app with `ConvexContext`.
  - [ ] 4.2 Use `createMutation` for all writes (`createDocument`, `addBlock`, `updateBlock`, `removeBlock`, `deleteDocument`).
  - [ ] 4.3 Add a non-subscribing read helper (e.g., `createQueryOnce` or direct `convex.query`) in `cvxsolid.ts` to avoid realtime for `getDocumentById`.
  - [ ] 4.4 Strongly type mutation/query inputs/outputs using Convex generated types.

- [ ] 5.0 Validate end-to-end flows and update README notes
  - [ ] 5.1 Create document → navigate → refresh page → route fetch loads same document and first block.
  - [ ] 5.2 Add block → refresh page → ensure block persists.
  - [ ] 5.3 Update block content/type → refresh → verify content/type persist.
  - [ ] 5.4 Attempt to remove last remaining block → server prevents; verify client behavior.
  - [ ] 5.5 Delete document → verify it disappears from sidebar and cannot be fetched.
  - [ ] 5.6 Update `README.md` with brief notes on persistence and dev defaults (strategy id).
