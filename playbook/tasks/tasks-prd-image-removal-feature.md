# Task List: Image Removal Feature for TextBlock Component

## Relevant Files

- `src/components/TextEditor/TextBlock.tsx` - Main component that needs the image removal button added below the carousel
- `src/stores/createDocumentStore.ts` - Contains the existing `removeImageFromBlock` function that will be called

## Tasks

- [x] 1.0 Add Image Removal Button to TextBlock Component

  - [x] 1.1 Import necessary UI components (Button from solid-ui)
  - [x] 1.2 Add button element below the carousel in the JSX structure
  - [x] 1.3 Position button with appropriate spacing (mt-2 or similar)
  - [x] 1.4 Use simple "-" text character as button content
  - [x] 1.5 Add proper button type and accessibility attributes

- [ ] 2.0 Implement Button Click Handler and Image Removal Logic

  - [x] 2.1 Create click handler function for the remove button
  - [x] 2.2 Get current block ID from props
  - [x] 2.3 Determine which image is currently visible in the carousel
  - [x] 2.4 Call `removeImageFromBlock(blockId, imageId)` from the store
  - [x] 2.5 Handle any potential errors during image removal
  - [ ] 2.6 Add proper error logging for debugging

- [ ] 3.0 Handle Carousel State After Image Removal

  - [ ] 3.1 Check if any images remain after removal
  - [ ] 3.2 If images remain, ensure carousel advances to next image
  - [ ] 3.3 If no images remain, hide the carousel and remove button
  - [ ] 3.4 Handle edge case when removing the last image
  - [ ] 3.5 Ensure carousel navigation works correctly after state update

- [ ] 4.0 Add Button Styling and Positioning

  - [ ] 4.1 Apply consistent button styling using existing UI component library
  - [ ] 4.2 Add appropriate hover and focus states
  - [ ] 4.3 Ensure button is responsive on different screen sizes
  - [ ] 4.4 Add proper spacing between carousel and button
  - [ ] 4.5 Style button to match existing component design patterns

- [ ] 5.0 Implement Button Visibility Logic and Edge Cases
  - [ ] 5.1 Show button only when block has images
  - [ ] 5.2 Hide button when no images remain
  - [ ] 5.3 Handle case when images array is undefined or empty
  - [ ] 5.4 Ensure button state updates when images are added/removed
  - [ ] 5.5 Add proper aria-label for screen reader accessibility
  - [ ] 5.6 Test button behavior during carousel transitions
