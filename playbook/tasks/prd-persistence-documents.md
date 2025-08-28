## Persistence for Document Store (Convex)

### Introduction/Overview

Add server-side persistence for the client `createDocumentStore` so documents and their blocks survive page reloads. Use Convex as the backend. Keep the current Convex data model and integrate via Solid hooks in `playbook/src/cvxsolid.ts`. No realtime sync, offline, or auth.

### Goals

- Persist documents and blocks in Convex so a refresh restores state.
- Provide Convex functions (one per action) to support client CRUD flows.
- On document creation, also create the first empty block on the server and return both IDs.
- Keep caret position and focused block client-only.
- Do not implement images persistence yet.

### User Stories

- As a user, I can create a new document and, after refreshing the page, the document remains with an initial empty block.
- As a user, I can add a block to a document, refresh, and see the block preserved.
- As a user, I can update a block’s content and type, refresh, and see my changes.
- As a user, I can remove a block from a document (except the last block), refresh, and see it removed.
- As a user, I can delete a document and it no longer appears after refresh.

### Functional Requirements

1. The system must provide Convex functions in `playbook/convex/documents.ts`, one per action:
   1.1 `createDocument` (mutation):

   - Input: `{ title?: string, strategyId: Id<"strategies"> }` (client will supply default `strategyId`).
   - Behavior: Create a `documents` record and a first `blocks` record of type `"text"` with empty content; associate the block to the document; set the document’s `blocks` array with the first block id.
   - Output: `{ documentId: Id<"documents">, firstBlockId: Id<"blocks"> }`.

     1.2 `getDocuments` (query):

   - Return all `documents` with their `blocks` ids.

     1.3 `getDocumentById` (query):

   - Input: `{ documentId }`.
   - Return: the `document` and an array of its block records (joined by ids) or the raw document record; client may fetch blocks separately if preferred.

     1.4 `addBlock` (mutation):

   - Input: `{ documentId }`.
   - Behavior: Create a new `blocks` record with type `"text"` and empty content. Append its id to the document’s `blocks` array.
   - Output: `{ blockId: Id<"blocks"> }`.

     1.5 `updateBlock` (mutation):

   - Input: `{ blockId, content?: string, type?: "text"|"ul"|"ol"|"checkbox"|"radio", checked?: boolean }`.
   - Behavior: Update provided fields only. Client computes type-switching logic and passes the resulting `type`.

     1.6 `removeBlock` (mutation):

   - Input: `{ documentId, blockId }`.
   - Behavior: If the document has more than one block, remove `blockId` from the document’s `blocks` array and delete the `blocks` record. Prevent deleting the last remaining block.

     1.7 `deleteDocument` (mutation):

   - Input: `{ documentId }`.
   - Behavior: Delete the document and all of its associated block records.

2. The client must integrate these functions using `createQuery`/`createMutation` from `playbook/src/cvxsolid.ts`.
3. The client must not persist or send caret position or focused block to the server.
4. Images persistence is out of scope. Do not save image URLs yet.

### Non-Goals (Out of Scope)

- Realtime updates or multi-client sync.
- Offline editing and optimistic UI.
- Authentication/authorization and sharing.
- Images/attachments persistence (URLs) in this iteration.
- Strategies management UX; the client will supply a default `strategyId`.

### Design Considerations

- Keep existing Convex schema in `playbook/convex/schema.ts` (`documents`, `blocks`, etc.).
- `documents.blocks` remains an ordered array of `blocks` ids to preserve sequence.
- Type switching logic (e.g., "- ", "1. ", "[] ", "() ") stays client-side; server stores final `type` and `content` provided.
- Prevent removing the last block on the server to keep invariants consistent across clients.

### Technical Considerations

- Update the client’s `createDefaultDocument` to call `createDocument` (Convex) and use returned `{ documentId, firstBlockId }` to seed the local store, rather than generating ids locally.
- Use `createMutation` for all writes and `createQuery` for reads. No subscriptions or realtime needed.
- For `getDocumentById`, either return only the document and let the client fetch blocks by ids or return the document with expanded blocks. Choose the simpler approach during implementation.

### Success Metrics

- After any CRUD action, a full page reload restores the exact documents and blocks state from Convex (excluding caret position and focused block).
- Document creation returns valid ids and the first block is present both server-side and client-side.
- Removing blocks never leaves a document with zero blocks.

### Open Questions

- Should `getDocumentById` expand block records or should the client fetch blocks individually by ids?
- Any limits on maximum number of blocks per document for performance?
