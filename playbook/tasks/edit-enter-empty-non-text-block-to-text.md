[ ] 1 - Update Enter key handling in `TextBlock.tsx`
[x] 1.1 - Guard: when content is empty and `block.type !== "text"`, prevent default and stop propagation.
[ ] 1.2 - Convert the current block to type `"text"` (no new block creation).
[ ] 1.3 - Preserve focus and caret at column 0; update caret state in the store if needed.

[ ] 2 - Ensure store action exists to set block type to `text`
[ ] 2.1 - In `src/stores/createDocumentStore.ts`, add `setBlockTypeToText(blockId: string)` if missing.
[ ] 2.2 - Update the targeted block immutably; leave `content`, `images`, `order`, and `id` unchanged.
[ ] 2.3 - Export the action via `storeContext`; update types in `types/document.ts` only if necessary.

[ ] 3 - Wire the Enter handler to the store action
[ ] 3.1 - In `TextBlock.tsx`, call `actions.setBlockTypeToText(props.block.id)` inside the new branch.
[ ] 3.2 - Early return after switching type to prevent `onBlockCreate` from running.
[ ] 3.3 - Keep Shift+Enter behavior unchanged.

[ ] 4 - Regression checks and scenarios
[ ] 4.1 - Enter on empty non-text block → converts to `text`, no new block is added.
[ ] 4.2 - Enter on empty text block → preserves current behavior (new block where applicable).
[ ] 4.3 - Enter on non-empty blocks → behavior unchanged.
[ ] 4.4 - Arrow navigation, Backspace behaviors, and paste/image flows remain unaffected.

[ ] 5 - Accessibility and UX
[ ] 5.1 - Maintain keyboard accessibility; do not alter `tabindex`, `aria-*`, or handlers.
[ ] 5.2 - No styling changes required; retain existing Tailwind classes.

[ ] 6 - Coding standards
[ ] 6.1 - Use early returns; descriptive `const` names; handler names with `handle*` prefix.
[ ] 6.2 - Avoid ternaries for classes; prefer `class:` directives where applicable.
