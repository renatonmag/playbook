# Product Requirements Document: Notion-like Text App for Trading Strategy Rules

## Introduction/Overview

This feature creates a Notion-like text editing experience within the existing `document.tsx` route, designed specifically for day traders to organize and document their trading strategy rules. The app will use the `@bigmistqke/solid-contenteditable` library to provide a rich text editing experience with block-based content management, similar to Notion's interface.

**Problem Statement:** Day traders need an organized way to document and maintain their trading strategy rules in a structured, searchable format that can be easily accessed by LLMs for information retrieval.

**Goal:** Create an intuitive, block-based text editor that allows traders to create, edit, and organize their trading strategies with rich text formatting capabilities.

## Goals

1. **Block Management:** Enable users to create, edit, and delete text blocks seamlessly
2. **Rich Text Formatting:** Provide essential formatting options (bold, italic, underline, etc.)
3. **List Support:** Implement dedicated list blocks for organizing trading rules
4. **User Experience:** Create an intuitive interface similar to Notion for familiar user interaction
5. **Data Persistence:** Implement local data storage using SolidJS signals and stores
6. **LLM Compatibility:** Ensure content is structured for optimal LLM search and retrieval

## User Stories

1. **As a day trader**, I want to create new text blocks so that I can document different aspects of my trading strategy
2. **As a day trader**, I want to delete blocks using backspace so that I can remove outdated or incorrect information
3. **As a day trader**, I want to add empty blocks using the Enter key so that I can expand my strategy documentation
4. **As a day trader**, I want to format text (bold, italic, etc.) so that I can emphasize important trading rules
5. **As a day trader**, I want to create list blocks so that I can organize related trading rules in a structured manner
6. **As a day trader**, I want my content to be automatically saved so that I don't lose my work

## Functional Requirements

1. **Block Creation and Management**

   - The system must allow users to create new text blocks by pressing Enter
   - The system must allow users to delete blocks using Backspace when the block is empty
   - The system must support multiple blocks on a single page
   - The system must maintain proper block order and spacing

2. **Text Editing**

   - The system must allow users to edit text within any block
   - The system must support the `@bigmistqke/solid-contenteditable` library for text input
   - The system must provide a smooth typing experience without lag

3. **Rich Text Formatting**

   - The system must support bold text formatting
   - The system must support italic text formatting
   - The system must support underline text formatting
   - The system must support text color changes
   - The system must provide formatting controls that are easily accessible

4. **List Block Support**

   - The system must support a dedicated list block type
   - The system must allow users to create ordered and unordered lists
   - The system must support nested list items
   - The system must provide visual indicators for list items

5. **Data Persistence**

   - The system must automatically save content changes using SolidJS signals
   - The system must persist data across browser sessions using local storage
   - The system must handle data loading and saving without user intervention

6. **User Interface**
   - The system must use the solid-ui component library for consistent design
   - The system must implement proper typography using solid-ui components
   - The system must provide visual feedback for active blocks
   - The system must support responsive design using Tailwind CSS

## Non-Goals (Out of Scope)

1. **Real-time Collaboration:** This feature will not support multiple users editing simultaneously
2. **Advanced Media:** No support for images, videos, or file attachments
3. **Export/Import:** No support for exporting to other formats or importing from external sources
4. **Version History:** No support for tracking changes or reverting to previous versions
5. **Advanced Search:** Basic text search only, no advanced filtering or categorization
6. **Mobile Optimization:** Focus on desktop experience initially

## Design Considerations

- **Component Library:** Utilize solid-ui components for buttons, typography, and layout
- **Typography:** Implement consistent text hierarchy using solid-ui typography components
- **Color Scheme:** Use Tailwind CSS classes for consistent color application
- **Spacing:** Implement proper spacing between blocks using Tailwind CSS utilities
- **Visual Feedback:** Provide clear visual indicators for active blocks and formatting states

## Technical Considerations

- **Framework:** Built using SolidJS-Start framework
- **Text Editing:** Integrate `@bigmistqke/solid-contenteditable` library
- **State Management:** Use SolidJS signals and stores for data persistence
- **Styling:** Implement using Tailwind CSS for responsive design
- **Component Library:** Leverage solid-ui for consistent UI components
- **Data Storage:** Use browser localStorage for persistence
- **Block Management:** Implement custom block logic for Notion-like behavior

## Success Metrics

1. **Functionality:** Users can successfully create, edit, and delete text blocks
2. **Formatting:** Rich text formatting works consistently across all blocks
3. **Persistence:** Content is automatically saved and restored between sessions
4. **Performance:** Text editing is smooth with no noticeable lag
5. **User Experience:** Interface feels intuitive and similar to Notion

## Open Questions

1. **Block Types:** Should we support additional block types beyond text and lists (e.g., headers, code blocks)?
2. **Keyboard Shortcuts:** What keyboard shortcuts should be implemented for common actions?
3. **Block Templates:** Should we provide pre-built templates for common trading strategy structures?
4. **Data Export:** Should we consider adding basic export functionality for backup purposes?
5. **Block Reordering:** Should users be able to drag and drop blocks to reorder them?

## Implementation Notes

- Start with basic text block functionality using solid-contenteditable
- Implement block management logic for creating/deleting blocks
- Add rich text formatting controls using solid-ui components
- Implement list block type with proper visual styling
- Add data persistence using SolidJS stores and localStorage
- Ensure proper integration with existing `document.tsx` route structure
