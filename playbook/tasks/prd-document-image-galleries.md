## Introduction / Overview

This feature adds first-class image gallery support to document blocks. When a user adds images to a block, the system will ensure a gallery exists for that block, persist the uploaded images' URLs and keys, and maintain image order. When a user removes an image, the system will delete the physical file(s) from UploadThing first and then update Convex. If the last image is removed, the gallery is deleted and the block is unlinked from it.

Target reader: junior developer implementing client logic in `createDocumentStore.ts` and server mutations in `convex/documents.ts`, respecting the existing schema in `convex/schema.ts` and the UploadThing route in `src/routes/api/uploadthing.ts`.

## Goals

- Ensure each block that has images owns exactly one gallery via `blocks.galleryId`.
- Lazily create a gallery on first successful upload for a block and link it atomically to the block.
- Persist exactly `{ url, key }` for each uploaded image, preserving the order returned by UploadThing.
- On image removal, delete from UploadThing first; only update Convex if deletion succeeds.
- When a gallery becomes empty, delete the gallery and unset the block's `galleryId`.
- Revoke any local object URLs when images are removed.

## Functional Requirements

1. Gallery association
   1.1 A gallery is scoped to a single block; `blocks.galleryId` links to `galleries`.
   1.2 If a block without a `galleryId` receives images, the system must create a gallery and set `blocks.galleryId` atomically in the same mutation.

2. Upload flow and persistence
   2.1 Uploads use the existing UploadThing client (`startUpload(files)`).
   2.2 Treat returned results as an array of items shaped `{ ufsUrl, key }`.
   2.3 Persist images in Convex as exactly `{ url, key }`, mapping `ufsUrl -> url` with no extra attributes.
   2.4 Preserve the order of images exactly as returned by UploadThing.
   2.5 Partial success is allowed: only persist images that UploadThing returns; skipped/failed files are not persisted.

3. Appending images to existing galleries
   3.1 If `blocks.galleryId` exists, append new `{ url, key }` entries to `galleries.urls` in returned order.

4. Removing images
   4.1 To remove an image, the client must first call the Solid route `DELETE /api/uploadthing` with a JSON body of `string[]` file keys to remove.
   4.2 If UploadThing deletion fails, abort any Convex changes and do not show an error to the user.
   4.3 If UploadThing deletion succeeds, remove the corresponding `{ url, key }` entry from `galleries.urls` in Convex.
   4.4 If the gallery becomes empty after removal, delete the gallery document and unset `blocks.galleryId`.
   4.5 Revoke any local object URLs for removed images on the client immediately after successful deletion.

5. Non-deduplication
   5.1 Do not attempt to deduplicate images; repeated uploads of the same file `key` are allowed and will be stored as-is.

6. Auth and permissions
   6.1 No additional auth checks are required for adding/removing images.

## Non-Goals (Out of Scope)

- Image editing, transformations, cropping, or optimization pipelines.
- Reordering images within a gallery or between blocks.
- Captions, alt text management, or additional metadata beyond `{ url, key }`.
- Cross-block shared galleries; each block’s gallery is independent.
- Access control changes; follow existing app auth behavior.

## Design Considerations

- Client integration points:

  - `playbook/src/stores/createDocumentStore.ts`
    - `addImagesToBlock(blockId, images, files)` should:
      - Check for `galleryId`; if missing, trigger a Convex mutation to create a gallery and atomically set `blocks.galleryId`.
      - Call `startUpload(files)`; map results to `{ url: ufsUrl, key }`.
      - Append the new items to the gallery in Convex, preserving order.
      - Update local block state to reflect the added images.
    - `removeImageFromBlock(blockId, imageId)` should:
      - Identify the image’s `key` to delete.
      - Call `DELETE /api/uploadthing` with `[key]`.
      - If success, update Convex to remove the `{ url, key }` entry; if the gallery becomes empty, delete gallery and unset `galleryId`.
      - Revoke local object URLs for the removed image.

- Server integration points:

  - `playbook/convex/documents.ts` should expose the following Convex mutations:
    - `createGalleryAndLinkBlock({ blockId })` (atomic): creates a `galleries` doc (with empty `urls: []`), links `blocks.galleryId` to it, returns `galleryId`.
    - `appendGalleryUrls({ galleryId, items })`: where `items: { url: string; key: string }[]` appends in order.
    - `removeGalleryUrl({ galleryId, key })`: removes the single `{ url, key }` entry matching `key`; if empty after removal, delete gallery and unset the associated block’s `galleryId`.
  - Ensure operations on block and gallery are performed transactionally/atomically where applicable to avoid orphaned references.

- Existing server route:
  - `playbook/src/routes/api/uploadthing.ts` already supports `DELETE` with a JSON array body of file keys; the client must call this first before any Convex removal.

## Technical Considerations

- Data model (per `playbook/convex/schema.ts`):

  - `blocks.galleryId?: Id<"galleries">`
  - `galleries.urls: { url: string; key: string }[]`
  - Strictly persist `{ url, key }`; `ufsUrl` is mapped to `url` at the boundary.

- API contracts (proposed):

  - `createGalleryAndLinkBlock({ blockId }): { galleryId: Id<"galleries"> }`
  - `appendGalleryUrls({ galleryId, items: { url: string; key: string }[] }): { countAppended: number }`
  - `removeGalleryUrl({ galleryId, key }): { removed: boolean; deletedGallery?: boolean }`

- Error handling:

  - UploadThing delete failure: do not update Convex; do not present an error to the user.
  - UploadThing partial upload success: only persist successful items; maintain returned order.
  - Client must guard against absent/invalid `galleryId` and re-request it via `createGalleryAndLinkBlock` when needed.

- Ordering:
  - The array order of `galleries.urls` must match the UploadThing success order for stable rendering.

## Acceptance Criteria

- Adding images to a block without a gallery creates a gallery, links the block, and appends the uploaded images in order as `{ url, key }`.
- Adding images to a block with an existing gallery appends images to `galleries.urls` in order.
- Removing an image first calls the Solid route to delete by `key`; on success, Convex removes the image from `galleries.urls`.
- When the last image is removed from a gallery, the gallery is deleted and `blocks.galleryId` is unset.
- Local object URLs are revoked on removal.
- The system does not deduplicate; uploading the same file multiple times is reflected in storage.
- No new auth checks are introduced.

## Out-of-Scope/Deferred Items (for future)

- Per-file progress UI and global upload progress indicators (retain current behavior only).
- File type/size/mime limits beyond what is configured in the existing UploadThing router.
- Drag-and-drop reordering and captions.
