### Introduction / Overview

This feature adds document-level caret position tracking to the text editor. The system will maintain the caret’s line and column for the active document, use that information to place the caret when navigating between blocks, and update the caret state only on specified events.

The goal is to enable consistent caret placement across blocks, improve keyboard navigation behavior, and provide a reliable caret state for future features.

### Goals

- Track caret position at the document level as `{ line, column }`.
- Preserve and reuse the saved column when navigating up/down between blocks.
- Update caret state only on input, ArrowLeft, ArrowRight, and mouse click events (not on paste or ArrowUp/ArrowDown).
- Keep the state in-memory per document (no persistence to storage).

### User Stories

- As a writer, I want my caret to stay in the same column when moving up/down between blocks so I can edit consistently.
- As a user, I want the editor to remember my caret column so I can navigate without re-adjusting cursor position each time.
- As a user, I want clicking in the editor to update the caret’s saved line/column so future up/down navigation respects where I clicked.

### Functional Requirements

1. Document-level caret state
   1.1 The editor must store caret position per document as `{ line: number, column: number }`.
   1.2 Replace the existing `caretPositions: number` field within `DocumentStore` with `caretPosition: { line: number; column: number }`.
   1.3 Each document maintains its own caret state; switching documents switches the tracked caret state context.

2. Line and column definitions
   2.1 Line is defined by both soft-wrap and hard line breaks.
   2.2 Column is the simple string index (character offset) within the current visual line.
   2.3 For blocks containing only images or empty content, caret defaults to `line = 0`, `column = 0`.

3. State update triggers
   3.1 Update the document’s caret state on: - Text input (including insertions and deletions via keyboard) - ArrowLeft - ArrowRight - Mouse click/caret placement via pointer
   3.2 Do not update caret state on: - Paste events - ArrowUp/ArrowDown (these cause navigation and repositioning but should not themselves update the saved state)

4. Navigation behavior between blocks
   4.1 On ArrowUp at the top of a block, move focus to the previous block and place the caret at the last line at the saved column.
   4.2 On ArrowDown at the bottom of a block, move focus to the next block and place the caret at the first line at the saved column.
   4.3 If the target line’s length is shorter than the saved column, clamp the caret to the end of that line.
   4.4 If the target block is empty or contains only images, place the caret at `line = 0, column = 0`.

5. Calculating caret line/column
   5.1 Use the DOM selection/range from the `ContentEditable` to derive caret position.
   5.2 Line index must account for soft wrapping; compute the caret’s visual line by comparing `Range.getClientRects()` against the editable’s bounding box and line boxes. Each visually distinct row (unique top coordinate) is a line.
   5.3 Column must be computed as a simple string index within the current visual line. When a line is soft-wrapped, compute the index relative to the start of that visual line (not the entire block’s start). Clamp as needed.
   5.4 Use the caret focus endpoint when a selection exists.

6. Store/API changes (`createDocumentStore.ts`)
   6.1 Change `DocumentStore`: - Remove `caretPositions: number`. - Add `caretPosition: { line: number; column: number }`.
   6.2 Update or replace `setCaretPosition(position: number)` with `setCaretPosition(line: number, column: number)` or `setCaretPosition(pos: { line: number; column: number })`.
   6.3 Do not persist caret state to storage; state is in-memory only.
   6.4 Keep the rest of the API behavior unchanged except where noted for navigation.

7. Editor component changes (`TextBlock.tsx`)
   7.1 On input, ArrowLeft, ArrowRight, and mouse click events, compute and call `setCaretPosition` with the current caret `{ line, column }` for the active document.
   7.2 ArrowUp/ArrowDown behavior: - Detect top-of-block and bottom-of-block using current caret visual line. - When navigating, focus the target block and set the caret according to the saved column and line rules in (4.1–4.4).
   7.3 When a block is focused (programmatically or via click), ensure caret is placed at the computed target `{ line, column }` within that block.

8. Clamping and fallback
   8.1 If a requested column exceeds the length of the target visual line, clamp to the end of that line.
   8.2 If line index is out of bounds for the target block, clamp to the first or last available line as appropriate.

### Non-Goals (Out of Scope)

- No persistence across sessions (no localStorage/DB sync for caret).
- No handling of RTL-specific behavior or grapheme/tabs special rules.
- No visual indicators for caret state.
- No change to paste behavior (does not update caret state directly).

### Design Considerations (Optional)

- Purely behavioral; no UI changes are required.
- Maintain existing visual style and keyboard UX.

### Technical Considerations (Optional)

- SolidJS + `@bigmistqke/solid-contenteditable` keyBindings will intercept Arrow keys and input events.
- Computing soft-wrapped lines requires reading client rects (`Range.getClientRects()`), which is layout-dependent. Do this only on the specified events to minimize layout thrashing.
- For column calculation on soft-wrapped lines, derive the substring range corresponding to the current visual line and compute the simple string index within that substring. Approximate as needed but must satisfy acceptance criteria.
- Navigation functions (`blockNavigateUp`, `blockNavigateDown`) need to position the caret in the target block using the saved column and first/last line logic.
- Empty/image-only blocks should yield a caret at the start (0,0).

### Success Metrics

- ArrowUp from the top visual line of a block places the caret in the previous block’s last visual line at the saved column (clamped if needed).
- ArrowDown from the bottom visual line of a block places the caret in the next block’s first visual line at the saved column (clamped if needed).
- Clicks, ArrowLeft, ArrowRight, and keyboard input update the saved caret state; ArrowUp/ArrowDown and paste do not.
- Switching between documents preserves each document’s own caret state.

### Open Questions

- None at this time based on provided clarifications. If later we need precision across complex Unicode clusters or RTL, we will revisit column definition and line segmentation.
