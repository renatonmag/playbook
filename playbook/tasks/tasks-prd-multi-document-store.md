# Task List: Multi-Document Store Feature Implementation

## Relevant Files

- `src/stores/createDocumentStore.ts` - Contains the main document store logic that needs to be refactored to handle multiple documents
- `src/stores/storeContext.tsx` - Contains the store context and application store creation that needs to be updated
- `src/stores/storeState.ts` - Contains the store state interface that needs to be updated for multi-document support
- `src/routes/sidebar/[documentId].tsx` - Contains the AppSidebar component that needs to be updated with document creation and navigation
- `src/components/TextEditor/TextEditor.tsx` - Component that accesses document blocks and needs to be updated for active document
- `src/components/document.tsx` - Component that displays document title and needs to be updated for active document
- `src/types/document.ts` - Contains document type definitions that may need updates

## Tasks

- [x] 1.0 Refactor Document Store Structure

  - [x] 1.1 Update DocumentStore interface to include unique id field for routing
  - [x] 1.2 Modify createDocumentStore to return array of documents instead of single document
  - [x] 1.3 Add activeDocumentId field to track currently active document
  - [x] 1.4 Update store structure to maintain documents array with activeDocumentId
  - [x] 1.5 Refactor all store operations (addBlock, removeBlock, etc.) to work with active document
  - [x] 1.6 Add helper functions to get active document and filter by document ID
  - [x] 1.7 Migrate existing single document to become first document in array

- [x] 2.0 Update Store Context and State Interfaces

  - [x] 2.1 Update IStoreState interface to reflect new multi-document structure
  - [x] 2.2 Modify storeContext to handle documents array and activeDocumentId
  - [x] 2.3 Update createApplicationStore to initialize with documents array
  - [x] 2.4 Ensure store context properly exposes active document and actions
  - [x] 2.5 Update type definitions for multi-document support

- [x] 3.0 Implement Document Creation Functionality

  - [x] 3.1 Add createDocument action to IDocumentsActions interface
  - [x] 3.2 Implement createDocument function that generates new document with unique ID
  - [x] 3.3 Ensure new documents have default title, blocks, and proper structure
  - [x] 3.4 Add new document to documents array in store
  - [x] 3.5 Generate unique document IDs that work with URL routing
  - [x] 3.6 Handle document creation state updates properly

- [x] 4.0 Update AppSidebar for Document Navigation

  - [x] 4.1 Add "Create document" DropdownMenuItem to existing dropdown menu
  - [x] 4.2 Connect "Create document" menu item to createDocument action
  - [x] 4.3 Dynamically generate SidebarMenuSubItem for each document in array
  - [x] 4.4 Display document titles as menu item text
  - [x] 4.5 Implement navigation to document URL using document ID
  - [x] 4.6 Ensure proper routing to /sidebar/[documentId] pattern
  - [x] 4.7 Handle active document highlighting in sidebar

- [ ] 5.0 Update Components for Active Document Access

  - [x] 5.1 Update TextEditor component to access blocks from active document
  - [x] 5.2 Add useParams hook to AppSidebar component to access documentId
  - [ ] 5.3 Update all components that access gStore.documents.blocks
  - [ ] 5.4 Ensure components properly handle document switching
  - [ ] 5.5 Test that all existing functionality works with active document
  - [ ] 5.6 Verify backward compatibility for existing features
