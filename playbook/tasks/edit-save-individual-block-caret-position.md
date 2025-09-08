# Edit: Save Individual Block Caret Position

[ ] ## 1 - Update Document Store Schema

[x] 1.1 - Modify `DocumentStore` interface to include per-block caret positions
[X] 1.2 - Add `blockCaretPositions` field to the block
[x] 1.3 - Update initial block creation to initialize empty caret positions
[ ] 1.4 - Ensure backward compatibility with existing documents

[ ] ## 2 - Implement Block-Specific Caret Storage

[ ] 2.1 - Create `setBlockCaretPosition` method in document store actions
[ ] 2.2 - Create `getBlockCaretPosition` method in document store actions
[ ] 2.3 - Modify existing `saveCaretPosition` to accept blockId parameter
[ ] 2.4 - Update caret position storage to use block-specific keys
[ ] 2.5 - Add fallback to global caret position for backward compatibility

[ ] ## 3 - Update TextBlock Component Integration

[ ] 3.1 - Modify `TextBlock` component to pass block ID to caret position functions
[ ] 3.2 - Update all `saveCaretPosition` calls to include `props.block.id`
[ ] 3.3 - Update caret restoration logic to use block-specific positions
[ ] 3.4 - Ensure navigation between blocks preserves individual positions

[ ] ## 4 - Modify Navigation and Focus Handling

[ ] 4.1 - Update `blockNavigateUp` to restore block-specific caret position
[ ] 4.2 - Update `blockNavigateDown` to restore block-specific caret position
[ ] 4.3 - Modify focus restoration effect to use block-specific positions
[ ] 4.4 - Ensure proper caret positioning when switching between blocks

[ ] ## 5 - Update Key Binding Handlers

[ ] 5.1 - Modify `ArrowUp` handler to save current block's caret position
[ ] 5.2 - Modify `ArrowDown` handler to save current block's caret position
[ ] 5.3 - Update `ArrowLeft` and `ArrowRight` handlers for block-specific saving
[ ] 5.4 - Ensure `Backspace` and `Delete` handlers preserve block positions

[ ] ## 6 - Handle Block Lifecycle Events

[ ] 6.1 - Clear caret position when block is deleted
[ ] 6.2 - Initialize caret position when new block is created
[ ] 6.3 - Handle block type changes and position preservation
[ ] 6.4 - Manage caret positions during block reordering

[ ] ## 7 - Optimize Performance and Memory

[ ] 7.1 - Implement cleanup for removed blocks' caret positions
[ ] 7.2 - Add debouncing for frequent caret position updates
[ ] 7.3 - Consider using WeakMap for automatic garbage collection
[ ] 7.4 - Optimize storage structure for large documents

[ ] ## 8 - Add Type Safety and Validation

[ ] 8.1 - Create TypeScript interfaces for block caret position structure
[ ] 8.2 - Add validation for caret position bounds per block
[ ] 8.3 - Ensure type safety in all caret position operations
[ ] 8.4 - Add error handling for invalid block IDs or positions
