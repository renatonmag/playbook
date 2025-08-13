# Task List: Notion-like Text App for Trading Strategy Rules

## Relevant Files

- `src/routes/document.tsx` - Main document page component that will contain the text editor
- `src/components/TextEditor/TextEditor.tsx` - Main text editor component with block management
- `src/components/TextEditor/TextBlock.tsx` - Individual text block component
- `src/components/TextEditor/ListBlock.tsx` - List block component for ordered/unordered lists
- `src/components/TextEditor/FormattingToolbar.tsx` - Rich text formatting controls
- `src/stores/documentStore.ts` - SolidJS store for managing document state and persistence
- `src/types/document.ts` - TypeScript interfaces for document data structures
- `src/lib/storage.ts` - Utility functions for localStorage operations

## Tasks

- [x] 1.0 Setup Project Dependencies and Basic Structure

  - [x] 1.1 Install @bigmistqke/solid-contenteditable package
  - [x] 1.2 Create TextEditor component directory structure
  - [x] 1.3 Create types directory and define document interfaces
  - [x] 1.4 Create stores directory for state management
  - [x] 1.5 Create lib directory for utility functions

- [x] 2.0 Implement Core Text Block System

  - [x] 2.1 Create TextBlock component with solid-contenteditable integration
  - [x] 2.2 Implement block creation logic (Enter key handling)
  - [x] 2.3 Implement block deletion logic (Backspace key handling)
  - [x] 2.4 Create TextEditor component to manage multiple blocks
  - [x] 2.5 Implement block focus management and navigation
  - [x] 2.6 Add visual styling for blocks using Tailwind CSS

- [ ] 3.0 Add Rich Text Formatting Capabilities

  - [ ] 3.1 Create FormattingToolbar component with solid-ui components
  - [ ] 3.2 Implement bold text formatting functionality
  - [ ] 3.3 Implement italic text formatting functionality
  - [ ] 3.4 Implement underline text formatting functionality
  - [ ] 3.5 Implement text color selection functionality
  - [ ] 3.6 Integrate formatting toolbar with text blocks
  - [ ] 3.7 Add keyboard shortcuts for common formatting actions

- [ ] 4.0 Implement List Block Support

  - [ ] 4.1 Create ListBlock component for ordered/unordered lists
  - [ ] 4.2 Implement list item creation and deletion
  - [ ] 4.3 Add visual indicators for list items (bullets, numbers)
  - [ ] 4.4 Implement nested list support
  - [ ] 4.5 Add list type switching (ordered vs unordered)
  - [ ] 4.6 Integrate list blocks with main text editor

- [x] 5.0 Create Data Persistence and State Management

  - [x] 5.1 Create documentStore using SolidJS createStore
  - [x] 5.2 Define document data structure and block types
  - [x] 5.3 Implement localStorage utility functions
  - [x] 5.4 Add auto-save functionality on content changes
  - [x] 5.5 Implement data loading from localStorage on app start
  - [x] 5.6 Add error handling for storage operations

- [x] 6.0 Build User Interface and Integration
  - [x] 6.1 Update document.tsx route to use TextEditor component
  - [x] 6.2 Implement responsive design using Tailwind CSS
  - [x] 6.3 Add loading states and error handling
  - [x] 6.4 Implement proper keyboard navigation between blocks
  - [x] 6.5 Add visual feedback for active blocks and formatting states
  - [x] 6.6 Test and refine user experience for Notion-like feel
