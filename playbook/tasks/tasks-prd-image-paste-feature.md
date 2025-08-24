# Task List: Image Paste Feature for TextBlock

## Relevant Files

- `src/types/document.ts` - Contains the Block interface that needs to be extended with images array
- `src/stores/createDocumentStore.ts` - Document store that needs to handle image data within blocks
- `src/components/TextEditor/TextBlock.tsx` - Main component that needs onPaste handler updates and carousel logic

## Tasks

- [x] 1.0 Extend Block Type Interface

  - [x] 1.1 Define Image interface with filename, size, and type properties
  - [x] 1.2 Add images array property to Block interface
  - [x] 1.3 Update Block type to support both text and image content

- [x] 2.0 Update Document Store for Image Handling

  - [x] 2.1 Add function to add images to a specific block
  - [x] 2.2 Add function to remove images from a block
  - [x] 2.3 Update block creation to initialize empty images array
  - [x] 2.4 Ensure image data persists when updating block content

- [x] 3.0 Implement Image Paste Detection and Validation

  - [x] 3.1 Enhance onPaste handler to detect image files from clipboard
  - [x] 3.2 Implement file type validation (JPEG, PNG, GIF, WebP)
  - [x] 3.3 Implement file size validation (2MB limit)
  - [x] 3.4 Filter out non-image files gracefully
  - [x] 3.5 Process multiple images simultaneously
  - [x] 3.6 Add images to block's images array after validation

- [x] 4.0 Update Carousel Rendering Logic

  - [x] 4.1 Modify carousel to display actual images instead of placeholders
  - [x] 4.2 Handle empty images array (show placeholder or hide carousel)
  - [x] 4.3 Ensure carousel navigation works with dynamic image content
  - [x] 4.4 Maintain existing carousel styling and dimensions
  - [x] 4.5 Add alt text for accessibility

- [x] 5.0 Integration and Validation
  - [x] 5.1 Verify image paste works across different image formats
  - [x] 5.2 Test multiple image pasting functionality
  - [x] 5.3 Ensure carousel updates immediately after image paste
  - [x] 5.4 Validate that non-image files are ignored without errors
  - [x] 5.5 Confirm existing text editing functionality remains intact
