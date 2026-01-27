# Spec: ActionBar Component (004-007)

**Task ID**: 004-007
**JTBD**: 004 - Review & Approve Observations (TUI)
**Depends On**: 004-003 (basic App.tsx shell)
**Blocks**: 004-008 (wire actions to ObservationStore)

---

## Overview

Create the `ActionBar` component using OpenTUI that displays three action buttons (Approve, Deny, Skip) for the observation review interface. This component will be responsible for rendering user-interactive controls that trigger state changes in the parent TUI application.

The ActionBar is a critical UI element in the Review & Approve flow (JTBD-004), enabling users to take explicit action on pending observations before they move through the memory hierarchy.

---

## Context

### Memory Hierarchy Review Flow (from JTBD-004)

```
User navigates observations in ObservationList
    ↓
ActionBar displays three action options:
    ├─ Approve → moves observation to long-term memory
    ├─ Deny → marks observation as rejected (don't show again)
    └─ Skip → leaves observation pending for later review
```

### TUI Architecture (from HLD)

```
App.tsx (root)
├─ ObservationList (displays observations)
└─ ActionBar ← THIS COMPONENT
    ├─ Approve button
    ├─ Deny button
    └─ Skip button
```

The ActionBar sits below (or alongside) the ObservationList and responds to user input to trigger callbacks passed from the parent.

---

## Component Specification

### Location

```
src/tui/components/ActionBar.tsx
```

### Interface

```typescript
interface ActionBarProps {
  onApprove: () => void;
  onDeny: () => void;
  onSkip: () => void;
  disabled?: boolean;        // Disable all actions (e.g., while processing)
  isApproving?: boolean;     // Loading state for approve button
  isDenying?: boolean;       // Loading state for deny button
}
```

### Component Return Type

React component that renders using OpenTUI primitives (Box, Text). Must be compatible with the OpenTUI React reconciler.

---

## UI Layout & Styling

### Visual Layout

```
┌─────────────────────────────────────────────────┐
│  [a] Approve    [d] Deny    [s] Skip            │
└─────────────────────────────────────────────────┘
```

The ActionBar should display as a horizontal row with three buttons, each with:
- Clear label text
- Keyboard shortcut indicator (optional)
- Visual separation between buttons

### OpenTUI Component Usage

Use OpenTUI's `Box` and `Text` components to create the button layout:

- **Box component**: For container and button areas
- **Text component**: For button labels
- **Styling**: Use width/padding to space buttons appropriately

Example structure (pseudocode):
```
Box (flex direction row)
  ├─ Box (Approve button)
  │  └─ Text "[a] Approve"
  ├─ Text "    " (spacer)
  ├─ Box (Deny button)
  │  └─ Text "[d] Deny"
  ├─ Text "    " (spacer)
  └─ Box (Skip button)
     └─ Text "[s] Skip"
```

---

## Functionality

### Button Actions

#### Approve Button
- **Keyboard shortcut**: `a` or `Enter` (when focused)
- **Behavior**: Calls `onApprove()` callback
- **Use case**: User confirms observation should move to long-term memory
- **Loading state**: Show "Approving..." while `isApproving` is true

#### Deny Button
- **Keyboard shortcut**: `d`
- **Behavior**: Calls `onDeny()` callback
- **Use case**: User rejects the observation; it will not appear again
- **Loading state**: Show "Denying..." while `isDenying` is true

#### Skip Button
- **Keyboard shortcut**: `s`
- **Behavior**: Calls `onSkip()` callback
- **Use case**: User decides to defer decision; observation remains pending

### Disabled State

When `disabled={true}`:
- All buttons become non-responsive
- Display visual indication (grayed out or hidden)
- This state is used when processing bulk actions or waiting for storage operations

### Loading States

- When `isApproving={true}`: Show "Approving..." in place of "Approve"
- When `isDenying={true}`: Show "Denying..." in place of "Deny"
- Prevents duplicate clicks during async operations

---

## Implementation Notes

### OpenTUI Constraints

1. **No interactive input components yet** (as of research): OpenTUI doesn't have built-in button components with click handlers
   - Use keyboard event handling from parent component
   - Render Box/Text as visual representation
   - Parent (App.tsx) handles keyboard capture and calls ActionBar callbacks

2. **Reconciler compatibility**: Ensure component works with OpenTUI React reconciler
   - Use `@opentui/react` imports
   - Follow OpenTUI component patterns (Box, Text, etc.)
   - No external React libraries (keep dependencies minimal)

3. **Rendering**: Return JSX that OpenTUI reconciler can render
   - All components must be OpenTUI primitives or custom components
   - No HTML/DOM elements

### Interaction Model

The ActionBar is **not responsible for keyboard event handling**. Instead:

1. **Parent responsibility** (App.tsx or parent TUI component):
   - Captures keyboard input (`a`, `d`, `s` keys)
   - Determines which button should be triggered
   - Calls the appropriate callback (onApprove, onDeny, onSkip)

2. **ActionBar responsibility**:
   - Receives callbacks as props
   - Renders button UI
   - Optionally displays loading/disabled states
   - Shows keyboard shortcuts as visual hints

### Dependencies

**No external dependencies required**. Use only:
- React (for JSX)
- OpenTUI core components (Box, Text)
- TypeScript types

---

## Testing Requirements

### Unit Tests

Create `tests/tui/components/ActionBar.test.tsx`:

1. **Render test**: Component renders without errors
2. **Props passing**: All three callbacks are properly typed
3. **Disabled state**: Component renders correctly when `disabled={true}`
4. **Loading states**:
   - Component renders "Approving..." when `isApproving={true}`
   - Component renders "Denying..." when `isDenying={true}`
5. **Callback verification**: Callbacks can be called in tests (using spies/mocks)

### Integration with Parent

- Task 004-008 will wire ActionBar callbacks to actual ObservationStore operations
- For now, ActionBar should accept any function as a callback

---

## Acceptance Criteria

- [ ] Component renders without errors using OpenTUI React reconciler
- [ ] All three callback props (onApprove, onDeny, onSkip) are declared and properly typed
- [ ] ActionBar displays "Approve", "Deny", "Skip" button labels clearly
- [ ] Keyboard shortcut hints (`[a]`, `[d]`, `[s]`) are visible in the UI
- [ ] Component respects `disabled` prop and renders appropriately
- [ ] Component shows loading states when `isApproving` or `isDenying` is true
- [ ] Can be imported and used in App.tsx without errors
- [ ] Follows project folder structure and naming conventions
- [ ] Includes JSDoc comments on component and all props
- [ ] No TypeScript errors (strict mode)

---

## Dependencies & Blockers

### Blocking This Task
- 004-003: Basic App.tsx shell must exist to know the exact OpenTUI setup

### Blocked By This Task
- 004-008: Wire actions to ObservationStore (needs ActionBar to exist and be integrated)

### Related Components
- ObservationList (404-005): Displays observations above ActionBar
- App.tsx (404-003): Parent component that renders ActionBar and handles keyboard events
- ObservationStore (003-008): Will receive callbacks in task 004-008

---

## Related User Stories

**US-3: Review Pending Suggestions**
- "I want to review what Sanj has observed, so that I can approve or reject suggestions before they affect my memory files"
- ActionBar enables the approval/denial/skip interactions central to this user story

---

## Future Considerations

1. **Keyboard state management** (Wave 6): Task 004-006 will implement keyboard navigation in ObservationList, which will coordinate with ActionBar
2. **Action feedback** (Post-v1): Could add toast notifications or status messages after actions complete
3. **Button animations** (Post-v1): Fade/highlight buttons on focus or action
4. **Accessibility** (Post-v1): Screen reader labels, keyboard navigation order

---

## File References

- **Parent**: `src/tui/App.tsx` (404-003)
- **Sibling**: `src/tui/components/ObservationList.tsx` (404-005)
- **Uses**: `src/core/types.ts` (003-001) - for Observation type definitions
- **Tests**: `tests/tui/components/ActionBar.test.tsx`

---

## Pseudo-Code Reference

```typescript
// src/tui/components/ActionBar.tsx

import React from 'react';
import { Box, Text } from '@opentui/react';

interface ActionBarProps {
  onApprove: () => void;
  onDeny: () => void;
  onSkip: () => void;
  disabled?: boolean;
  isApproving?: boolean;
  isDenying?: boolean;
}

export const ActionBar: React.FC<ActionBarProps> = ({
  onApprove,
  onDeny,
  onSkip,
  disabled = false,
  isApproving = false,
  isDenying = false,
}) => {
  return (
    <Box flexDirection="row" width="100%" paddingX={1}>
      <Box borderStyle="round" padding={1}>
        <Text>{isApproving ? 'Approving...' : '[a] Approve'}</Text>
      </Box>

      <Text>  </Text>

      <Box borderStyle="round" padding={1}>
        <Text>{isDenying ? 'Denying...' : '[d] Deny'}</Text>
      </Box>

      <Text>  </Text>

      <Box borderStyle="round" padding={1}>
        <Text>[s] Skip</Text>
      </Box>
    </Box>
  );
};
```

---

## Summary

The ActionBar component is a presentation layer for user actions in the observation review flow. It renders three buttons with keyboard shortcut indicators and manages loading/disabled states. The component is intentionally lightweight—keyboard event handling and actual storage operations happen in parent components (App.tsx and task 004-008 respectively). This separation of concerns keeps the component testable and reusable.
