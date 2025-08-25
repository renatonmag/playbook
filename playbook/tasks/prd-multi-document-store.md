# Product Requirements Document: Multi-Document Store Feature

## Introduction/Overview

Currently, the `createDocumentStore` manages a single document with blocks. This feature will extend the store to handle an array of multiple documents while maintaining the existing UI/UX. Users will be able to create new documents through a "Create document" button in the AppSidebar, and navigate between documents using the URL-based routing system.

## Goals

1. **Extend Document Store**: Transform the single document store into a multi-document store that maintains an array of documents
2. **Document Creation**: Enable users to create new documents through the AppSidebar interface
3. **Document Navigation**: Allow users to navigate between documents using URL-based routing
4. **Backward Compatibility**: Ensure existing components continue to work with minimal changes
5. **Maintain Current UX**: Preserve the existing user interface and experience

## User Stories

1. **As a user**, I want to create new documents so that I can organize my content into separate documents
2. **As a user**, I want to navigate between different documents so that I can work on multiple projects
3. **As a user**, I want to see all my documents listed in the sidebar so that I can easily access them
4. **As a user**, I want the URL to reflect which document I'm currently viewing so that I can bookmark and share specific documents

## Functional Requirements

1. **Store Structure Changes**

   - The `createDocumentStore` must maintain an array of `DocumentStore` objects instead of a single document
   - Each document must have a unique `id` field for routing purposes
   - The store must include an `activeDocumentId` field to track the currently active document

2. **Document Creation**

   - A "Create document" menu item must be added to the existing dropdown menu in AppSidebar
   - New documents must be generated with a unique ID and default title
   - New documents must contain at least one default text block
   - New documents must be automatically added to the documents array

3. **Document Navigation**

   - Each document must be displayed as a `SidebarMenuSubItem` in the AppSidebar
   - Document titles must be displayed as the menu item text
   - Clicking a document menu item must navigate to the document's URL using the document ID
   - The URL structure must follow the pattern `/sidebar/[documentId]`

4. **Active Document Management**

   - The active document must be determined by the `params.documentId` from the URL
   - The store must filter and return the appropriate document based on the active document ID
   - All existing store operations (addBlock, removeBlock, etc.) must work on the active document

5. **Migration from Single Document**

   - The existing single document must become the first document in the documents array
   - The existing document ID must be preserved or updated to match the new routing system
   - All existing functionality must continue to work without breaking changes

6. **Component Updates**
   - All components that currently access `gStore.documents.blocks` must be updated to work with the active document
   - The TextEditor component must display blocks from the currently active document
   - Document title display must show the title of the currently active document

## Non-Goals (Out of Scope)

1. **Document Persistence**: Documents will not be saved to persistent storage in this implementation
2. **Document Deletion**: Users cannot delete documents in this version
3. **Document Duplication**: Users cannot duplicate existing documents
4. **Backend Integration**: No integration with Convex backend or other external storage systems
5. **Performance Optimization**: No special memory management or performance optimizations for large documents
6. **UI/UX Changes**: The current interface design and user experience will remain unchanged
7. **Advanced Document Management**: No document categories, tags, or advanced organizational features

## Design Considerations

- **Minimal UI Changes**: The existing AppSidebar design will be preserved, with only the addition of the "Create document" menu item and dynamic document list
- **Consistent Navigation**: Document navigation will follow the existing URL-based routing pattern
- **Maintain Visual Hierarchy**: The sidebar structure and styling will remain consistent with the current design

## Technical Considerations

1. **Store Structure**: The store should maintain a structure like:

   ```typescript
   {
     documents: DocumentStore[],
     activeDocumentId: string | null
   }
   ```

2. **URL Integration**: The routing system must work with the existing SolidStart routing structure

3. **Component Updates**: Components accessing the store must be updated to handle the new structure while maintaining the same API

4. **State Management**: The store must properly manage the active document state and ensure all operations target the correct document

## Success Metrics

1. **Functional Success**: Users can create new documents and navigate between them without errors
2. **Navigation Success**: URL-based navigation works correctly for all documents
3. **Data Integrity**: All document operations (block management, image handling) work correctly on the active document
4. **Backward Compatibility**: Existing functionality continues to work without breaking changes
5. **User Experience**: Document switching feels seamless and intuitive

## Open Questions

1. **Document Naming**: Should new documents have auto-generated titles (e.g., "Untitled Document 1") or prompt users for names?
2. **Default Content**: What should be the default content for new documents beyond the initial text block?
3. **Document Order**: Should documents maintain a specific order in the sidebar, or can they be reordered?
4. **Error Handling**: How should the system handle cases where a document ID in the URL doesn't exist?

## Implementation Notes

- The existing `createDocumentStore` function signature and return type should be updated to handle multiple documents
- The store context and state interfaces must be updated to reflect the new structure
- All components using the store must be updated to access the active document through the new structure
- The AppSidebar component must be updated to dynamically generate document menu items
- URL routing must be tested to ensure proper document switching functionality
