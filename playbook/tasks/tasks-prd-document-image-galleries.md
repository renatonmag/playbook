## Relevant Files

- `playbook/src/stores/createDocumentStore.ts` - Client store where add/remove image flows are implemented and local state is updated.
- `playbook/convex/documents.ts` - Convex mutations for creating/linking galleries, appending URLs, and removing URLs.
- `playbook/convex/schema.ts` - Data model definitions for `blocks.galleryId` and `galleries.urls` shape.
- `playbook/src/routes/api/uploadthing.ts` - Solid route that supports DELETE of UploadThing file keys; client must call this before Convex removal.
- `playbook/src/components/TextEditor/TextBlock.tsx` - Block UI that triggers add/remove image actions and must reflect gallery state/order.
- `playbook/src/types/document.ts` - Block interfaces extended with optional `galleryId` used by client state.

## Tasks

- [x] 1.0 Implement Convex gallery mutations and atomic linking

  - [x] 1.1 Add `createGalleryAndLinkBlock({ blockId })` to `convex/documents.ts` to create an empty gallery (`urls: []`) and set `blocks.galleryId` atomically; return `galleryId`.
  - [x] 1.2 Add `appendGalleryUrls({ galleryId, items })` to append `{ url, key }[]` preserving array order.
  - [x] 1.3 Add `removeGalleryUrl({ galleryId, key })` to remove the matching `{ url, key }`; if empty after removal, delete gallery and unset associated `blocks.galleryId`.
  - [x] 1.4 Ensure operations affecting both block and gallery are atomic to avoid orphaned references.
  - [x] 1.5 Update types in `convex/schema.ts` if necessary; confirm `blocks.galleryId?: Id<"galleries">` and `galleries.urls: { url: string; key: string }[]`.

- [x] 2.0 Integrate image upload flow in client store with UploadThing

  - [x] 2.1 In `createDocumentStore.ts`, implement `addImagesToBlock(blockId, images, files)`.
  - [x] 2.2 If the block has no `galleryId`, call server to `createGalleryAndLinkBlock` and update local state with returned `galleryId`.
  - [x] 2.3 Call `startUpload(files)` and map results to `{ url: ufsUrl, key }`, filtering out failures.
  - [x] 2.4 Call server `appendGalleryUrls({ galleryId, items })` with items in returned order.
  - [x] 2.5 Update local block state to reflect appended images in stable order.
  - [x] 2.6 Handle partial success: only persist successful items; do not include skipped/failed files.

- [x] 3.0 Implement image removal flow with UploadThing DELETE and Convex updates

  - [x] 3.1 Add `removeImageFromBlock(blockId, key)` in `createDocumentStore.ts`.
  - [x] 3.2 Perform `DELETE /api/uploadthing` with JSON body `[key]`; if deletion fails, abort without Convex changes.
  - [x] 3.3 On success, call server `removeGalleryUrl({ galleryId, key })` and update local block state.
  - [x] 3.4 If gallery becomes empty, reflect deletion locally and unset `galleryId` on the block.
  - [x] 3.5 Revoke local object URLs for the removed image after successful deletion.

- [x] 4.0 Wire getDocuments to initialize images when called
  - [x] 4.1 Wire getDocuments to initialize images when called
