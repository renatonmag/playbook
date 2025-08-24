# Product Requirements Document: Image Paste Feature for TextBlock

## Introduction/Overview

This feature adds the ability for users to paste images directly into TextBlock components, allowing day traders and investors to quickly add visual content to their trading documents without interrupting their workflow. Images are automatically detected from clipboard data, stored in the document store, and displayed in the existing carousel component.

## Goals

1. **Enable Quick Image Addition**: Allow users to paste images directly from their clipboard into TextBlock components
2. **Support Multiple Image Types**: Accept JPEG, PNG, GIF, and WebP formats with a 2MB size limit
3. **Seamless Integration**: Integrate with existing carousel UI without changing the current design
4. **Efficient Storage**: Store image references in the document store for optimal performance
5. **Workflow Enhancement**: Reduce time spent on manual image uploads for trading documentation

## User Stories

1. **As a day trader**, I want to paste a screenshot of a chart so that I can quickly document my analysis without leaving my trading platform
2. **As an investor**, I want to paste multiple images from my portfolio so that I can create a comprehensive visual trading journal
3. **As a trader**, I want to paste images from my clipboard so that I don't have to interrupt my workflow to upload files manually
4. **As a user**, I want to see my pasted images immediately in the carousel so that I can verify they were added correctly

## Functional Requirements

1. **Image Detection**: The system must detect when pasted clipboard data contains image files
2. **File Validation**: The system must validate that pasted files are images (JPEG, PNG, GIF, WebP) and under 2MB
3. **Multiple Image Support**: The system must handle pasting of multiple images simultaneously
4. **Non-Image Handling**: The system must ignore non-image files without error or interruption
5. **Image Storage**: The system must store image references (filename, size, type) in the block object within the document store
6. **Carousel Integration**: The system must automatically update the existing carousel to display newly pasted images
7. **Metadata Preservation**: The system must preserve image metadata including filename, file size, and file type
8. **Error Handling**: The system must gracefully handle invalid or corrupted image files

## Non-Goals (Out of Scope)

1. **Image Optimization**: No automatic resizing, compression, or optimization of pasted images
2. **Image Deletion**: Users cannot delete pasted images after they're added (future enhancement)
3. **Advanced Image Editing**: No built-in image editing capabilities
4. **Storage Management**: No automatic cleanup or storage limit enforcement
5. **Visual Feedback**: No loading indicators or success messages during image processing
6. **Image Format Conversion**: No automatic conversion between image formats
7. **External Storage**: No integration with cloud storage or external image hosting services

## Design Considerations

- **Maintain Current UI**: Use the existing carousel component without modifications to styling or behavior
- **Seamless Integration**: Images should appear in the carousel immediately after pasting
- **Consistent Layout**: Maintain the current carousel dimensions and spacing
- **Responsive Behavior**: Ensure the carousel handles varying numbers of images gracefully

## Technical Considerations

1. **Document Store Integration**: Extend the Block type to include an images array property
2. **File Reference Storage**: Store image metadata as file references rather than base64 strings for performance
3. **Clipboard API**: Utilize the existing `getFilesFromClipboardEvent` function for file extraction
4. **Image Validation**: Implement file type and size validation before processing
5. **State Management**: Update the document store to handle image data within blocks
6. **Carousel State**: Ensure the carousel component receives and displays image data from the updated block structure

## Success Metrics

1. **Functionality**: Users can successfully paste images and see them appear in the carousel
2. **Performance**: Image pasting and display happens within 1 second
3. **Reliability**: 100% of valid image files are successfully processed and displayed
4. **User Experience**: No interruption to existing text editing workflow
5. **Integration**: Carousel displays images without requiring UI changes or additional components

## Open Questions

1. **Image Persistence**: How should images be handled when documents are saved/loaded?
2. **Memory Management**: What is the optimal approach for handling documents with many images?
3. **File Naming**: Should pasted images be renamed to avoid conflicts, or keep original names?
4. **Error Logging**: Should failed image pastes be logged for debugging purposes?
5. **Accessibility**: How should screen readers handle the image carousel content?

## Implementation Notes

- Extend the Block interface in `types/document.ts` to include an `images` array
- Update `createDocumentStore.ts` to handle image data within blocks
- Modify the `onPaste` handler in `TextBlock.tsx` to process and validate images
- Update the carousel rendering logic to display images from the block's image data
- Ensure the existing carousel navigation (previous/next buttons) works with dynamic image content
