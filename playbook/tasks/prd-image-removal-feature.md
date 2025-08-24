# PRD: Image Removal Feature for TextBlock Component

## Introduction/Overview

This feature adds the ability for users to remove individual images from text blocks in the document editor. Users can now easily clean up accidentally pasted images or remove unwanted images without having to delete the entire block. This addresses the need for quick image management within document blocks, particularly useful for investor traders who need to maintain clean, professional documents.

## Goals

1. **Immediate Image Removal**: Allow users to remove the currently visible image in the carousel with a single click
2. **Improved Document Cleanliness**: Enable users to maintain clean, professional-looking documents by removing unwanted images
3. **Enhanced User Experience**: Provide intuitive image management without disrupting the document editing workflow
4. **Seamless Carousel Navigation**: Automatically advance the carousel when an image is removed to show the next available image

## User Stories

1. **Accidental Image Cleanup**: As an investor trader, I want to remove an accidentally pasted image so that my document maintains a professional appearance
2. **Document Maintenance**: As a user, I want to clean up blocks with multiple images so that I can keep only the relevant visual content
3. **Quick Image Management**: As a content creator, I want to remove individual images without losing my text content so that I can iterate quickly on document design

## Functional Requirements

1. **Remove Button Display**: The system must display a minus button below the carousel when images are present in a block
2. **Current Image Removal**: The system must remove the currently visible image in the carousel when the minus button is clicked
3. **Immediate Action**: The system must remove the image immediately without confirmation dialogs
4. **Carousel Advancement**: The system must automatically advance to the next image after removal, or hide the carousel if no images remain
5. **Store Integration**: The system must call the existing `removeImageFromBlock()` function to properly update the document state
6. **Button Visibility**: The system must only show the remove button when there are images in the block
7. **Button Positioning**: The system must position the minus button below the carousel for easy access

## Non-Goals (Out of Scope)

1. **Bulk Image Removal**: This feature will not support removing multiple images at once
2. **Image Reordering**: This feature will not allow users to reorder images within a block
3. **Image Editing**: This feature will not provide image editing capabilities (cropping, filtering, etc.)
4. **Undo Functionality**: This feature will not include an undo mechanism for removed images
5. **Image Replacement**: This feature will not allow users to replace removed images with new ones

## Design Considerations

- **Button Styling**: Use a minus icon button that matches the existing UI component library (solid-ui)
- **Positioning**: Place the button below the carousel with appropriate spacing (mt-2 or similar)
- **Button State**: The button should be disabled or hidden when no images are present
- **Visual Feedback**: Consider adding a brief visual indication when an image is removed
- **Responsive Design**: Ensure the button works well on different screen sizes

## Technical Considerations

- **Integration**: Leverage the existing `removeImageFromBlock(blockId: string, imageId: string)` function from the document store
- **State Management**: Ensure proper state updates when images are removed
- **Carousel Logic**: Handle carousel navigation after image removal (advance to next image or hide carousel)
- **Performance**: Ensure image removal doesn't cause performance issues with large numbers of images
- **Memory Management**: The existing `removeImageFromBlock` function already handles URL.revokeObjectURL for proper memory cleanup

## Success Metrics

1. **User Adoption**: Users successfully remove images using the minus button
2. **Error Rate**: Minimal errors during image removal operations
3. **User Satisfaction**: Positive feedback on the ease of image management
4. **Document Quality**: Improved document cleanliness as measured by reduced accidental image content

## Open Questions

1. **Button Icon**: Use a simple "-" text character for the button (no custom icon needed)
2. **Accessibility**: What aria-label should be used for screen readers?
3. **Mobile Experience**: How should the button behave on touch devices?
4. **Animation**: Should there be any transition animation when images are removed?

## Implementation Notes

- The feature should integrate seamlessly with the existing `TextBlock` component
- Use the existing `removeImageFromBlock` function from the document store
- Ensure the carousel automatically handles the case when the last image is removed
- Test the feature with various image types (JPEG, PNG, GIF, WebP) that are currently supported
- Consider edge cases like removing images during carousel transitions
