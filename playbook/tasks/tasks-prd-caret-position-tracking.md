## Relevant Files

- `playbook/src/stores/createDocumentStore.ts` - Holds `DocumentStore` and actions; add document-level caret state and setters.
- `playbook/src/components/TextEditor/TextBlock.tsx` - Primary editable block; compute caret line/column and wire update/navigation behavior.
- `playbook/src/components/TextEditor/TextEditor.tsx` - Parent editor context; may coordinate block focus and navigation.
- `playbook/src/stores/storeContext.tsx` - Access to global store and actions used by editor components.
- `playbook/src/types/document.ts` - Block/Image types; verify compatibility with caret changes.
- `playbook/src/lib/caret.ts` - New utility module for caret calculation and placement.

## Tasks

- [x] 1.0 Update document store to use `{ line, column }` caret state and API

  - [x] 1.1 Replace `caretPositions: number` with `caretPosition: { line: number; column: number }` in `DocumentStore`.
  - [x] 1.2 Update initial state and `createDefaultDocument` to initialize `caretPosition` to `{ line: 0, column: 0 }`.
  - [x] 1.3 Replace `setCaretPosition(position: number)` with `setCaretPosition(pos: { line: number; column: number })` and update call sites.
  - [x] 1.4 Add `getCaretPosition(): { line: number; column: number }` convenience accessor.
  - [x] 1.5 Ensure `blockNavigateUp/Down` keep existing responsibilities; do not mutate caret state themselves.
  - [x] 1.6 Add small helper to clamp caret `{ line, column }` within a block’s bounds (to be used by UI layer during placement).

- [x] 2.0 Implement caret line/column calculation utilities (supports soft-wrap and hard breaks)

  - [x] 2.1 Create `playbook/src/lib/caret.ts` with `getCaretPositionFromSelection(editable: HTMLElement): { line: number; column: number }`.
  - [x] 2.2 Determine visual line by grouping `Range.getClientRects()` by unique `top` values relative to the editable element.
  - [x] 2.3 Compute column as a simple string index within the current visual line (relative to that line’s start), clamped to line length.
  - [x] 2.4 Add `setCaretAtLineColumn(editable: HTMLElement, pos: { line: number; column: number }): void` to place caret, clamping as needed.
  - [x] 2.5 Handle empty/image-only blocks by returning/placing at `{ line: 0, column: 0 }`.
  - [x] 2.6 Export minimal types/helpers for reuse in editor components.

- [x] 3.0 Wire caret updates on input, ArrowLeft/ArrowRight, and mouse clicks in `TextBlock`

  - [x] 3.1 Implement `saveCaretPosition()` inside `TextBlock.tsx` using `getCaretPositionFromSelection` and `actions.setCaretPosition`.
  - [x] 3.2 Bind `saveCaretPosition` to `keyBindings.ArrowLeft` and `keyBindings.ArrowRight`.
  - [x] 3.3 Update text input path to call `saveCaretPosition` after content changes (keyboard input including Backspace/Delete). Avoid updating on Paste.
  - [x] 3.4 Bind `saveCaretPosition` on mouse click/caret placement (`onMouseDown`/`onMouseUp`) to capture pointer-based movement.
  - [x] 3.5 Remove existing linter errors by replacing all references to undefined `saveCaretPosition` with the new function.

- [x] 4.0 Implement Up/Down navigation to place caret using saved column across blocks

  - [x] 4.1 Keep using `caretIsAtTop`/`caretIsAtBottom` to decide when to navigate; ensure ArrowUp/Down do not call `saveCaretPosition`.
  - [x] 4.2 When focusing the previous block (Up), place the caret at the last visual line at the saved column (clamped).
  - [x] 4.3 When focusing the next block (Down), place the caret at the first visual line at the saved column (clamped).
  - [x] 4.4 If target block has no text (empty/image-only), place caret at `{ line: 0, column: 0 }`.
  - [x] 4.5 Ensure placement occurs after the block gains focus and DOM is ready (via `setTimeout`/microtask).

- [ ] 5.0 Restore caret position on block focus and clamp line/column as required
  - [ ] 5.1 In `TextBlock`, when `focusedBlockId === props.block.id`, place caret using saved document `{ line, column }` and appropriate first/last line per navigation.
  - [ ] 5.2 Optionally track transient navigation intent (`'up' | 'down' | null`) to decide first vs last line on focus, and clear it post-placement.
  - [ ] 5.3 Clamp to valid line/column for the target block using the utility, then call `setCaretAtLineColumn`.
  - [ ] 5.4 Verify behavior across multi-document switching: each document retains its own caret state.
