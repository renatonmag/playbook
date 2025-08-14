# Product Requirements Document: Trade Page

## Introduction/Overview

The Trade Page is a new route (`/trade`) that provides users with a horizontal scrolling interface for creating multiple trading strategy lanes. Each lane contains a TextEditor component for journaling trades and getting strategy advice from an LLM. The page allows users to dynamically add and remove lanes as needed, with each lane operating independently.

## Goals

1. Create a new trade page route accessible at `/trade`
2. Implement a horizontal scrolling layout for multiple trading lanes
3. Allow users to add unlimited trading lanes dynamically
4. Provide independent TextEditor instances for each lane
5. Enable lane deletion functionality
6. Implement visual feedback when TextEditor is focused (green background)
7. Maintain temporary state for lane content during the session

## User Stories

1. **As a trader**, I want to create multiple trading strategy lanes so that I can organize different trading ideas separately.
2. **As a trader**, I want to journal my trades in individual lanes so that I can keep my thoughts organized by strategy or trade.
3. **As a trader**, I want to get LLM advice on specific trades so that I can improve my decision-making.
4. **As a trader**, I want to add new lanes as needed so that I can expand my analysis without limitations.
5. **As a trader**, I want to delete lanes I no longer need so that I can keep my workspace clean.
6. **As a trader**, I want clear visual feedback when I'm editing a lane so that I know which lane is currently active.

## Functional Requirements

1. **Page Route**: The system must create a new route at `playbook/src/routes/trade.tsx`
2. **Lane Management**: The system must allow users to add new trading lanes by clicking an "add" button
3. **Lane Storage**: The system must store lane information in a createStore for state management
4. **TextEditor Integration**: Each lane must contain an independent TextEditor component instance
5. **Lane Deletion**: The system must allow users to delete individual lanes
6. **Lane Titles**: Each lane must display a title at the top
7. **Horizontal Layout**: Lanes must be arranged in a horizontal row with horizontal scrolling
8. **Focus Feedback**: When a TextEditor is focused, its parent lane card background must turn green
9. **Independent Operation**: Each lane's TextEditor must operate independently without data sharing
10. **Temporary State**: Lane content must be maintained during the session but not persisted

## Non-Goals (Out of Scope)

- Persistent storage of lane content between sessions
- Data synchronization between different lanes
- Export or sharing functionality
- Lane reordering capabilities
- Animations or visual effects for adding/removing lanes
- User authentication or lane ownership
- Advanced formatting or styling beyond basic card appearance
- Integration with external trading platforms or data feeds

## Design Considerations

- Use existing TextEditor component from `@TextEditor.tsx`
- Implement horizontal scrolling container for unlimited lane creation
- Each lane should be a card with consistent styling
- Green background color should be applied only to the focused lane card
- Maintain consistent spacing and layout between lanes
- Ensure responsive design for different screen sizes

## Technical Considerations

- Create a new store using SolidJS createStore for lane management
- Each lane object should contain: id, title, content, and TextEditor instance
- Implement proper cleanup when lanes are deleted
- Ensure TextEditor focus events properly trigger background color changes
- Use CSS overflow-x for horizontal scrolling
- Consider performance implications of unlimited lane creation

## Success Metrics

- Users can successfully create and delete trading lanes
- TextEditor focus correctly triggers green background on the specific lane
- Horizontal scrolling works smoothly with multiple lanes
- Each lane operates independently without interference
- Page loads and responds quickly with multiple lanes
- No memory leaks from lane creation/deletion

## Open Questions

1. What should be the default title for new lanes?
2. Should there be any validation on lane titles?
3. Is there a preferred maximum number of lanes before performance considerations?
4. Should there be any keyboard shortcuts for lane management?
5. What should happen if a user tries to delete the last remaining lane?
