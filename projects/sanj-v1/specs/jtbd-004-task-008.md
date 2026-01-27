# Spec: Task 004-008 - Wire approve/deny/skip actions to ObservationStore

## Overview

Task 004-008 connects user actions from the TUI ActionBar component to the ObservationStore, enabling approve/deny/skip functionality for pending observations. This task bridges the interactive UI layer with the core domain logic.

**Task ID**: 004-008
**JTBD**: 004 - Review & Approve Observations (TUI)
**Dependencies**: 004-007 (ActionBar component), 003-008 (ObservationStore)
**Blocks**: 004-013 (PromotionList view)

---

## Context

### What exists before this task

- **ActionBar component** (004-007): A TUI component with approve/deny/skip buttons
- **ObservationStore** (003-008): Core domain logic for CRUD operations and state management
- **TUI infrastructure** (004-003 to 004-007): App shell, ObservationList, and navigation

### What this task delivers

Action handlers that:
1. Receive user input from ActionBar (approve, deny, or skip)
2. Call appropriate ObservationStore methods to persist state changes
3. Update TUI state to reflect the change immediately
4. Move to the next observation or provide visual feedback

### Data flow

```
User presses key
       ↓
ActionBar detects action
       ↓
Handler called (approve/deny/skip)
       ↓
ObservationStore method executed
       ↓
TUI state updated
       ↓
List re-renders with changes
```

---

## Technical Specification

### ObservationStore Methods Required

The ObservationStore (003-008) must expose these methods:

```typescript
// Mark an observation as approved (promote to long-term memory)
approveObservation(id: string): Promise<void>;

// Mark an observation as denied (reject, don't show again)
denyObservation(id: string): Promise<void>;

// Keep observation as pending (skip decision for now)
skipObservation(id: string): Promise<void>;

// Get next pending observation (for navigation after action)
getNextPending(currentId: string): Promise<Observation | null>;

// Get previous pending observation (for navigation after action)
getPreviousPending(currentId: string): Promise<Observation | null>;
```

**Note**: These methods should be added to ObservationStore if not already present. Confirm during implementation if they exist under different names.

### ActionBar Component Interface

ActionBar (004-007) should accept callbacks:

```typescript
interface ActionBarProps {
  observation: Observation;
  onApprove?: (id: string) => Promise<void>;
  onDeny?: (id: string) => Promise<void>;
  onSkip?: (id: string) => Promise<void>;
}
```

### Action Handlers Implementation

Create action handlers in the TUI that:

#### 1. Approve Handler
```typescript
async function handleApprove(observation: Observation) {
  // 1. Call ObservationStore.approveObservation(observation.id)
  // 2. Update TUI state (remove from pending list or mark as approved)
  // 3. Load next observation or show completion message
  // 4. Show brief feedback ("Approved" or similar)
}
```

**Side effects**:
- Observation is promoted from "Pending" to "Long-Term Memory"
- Entry is written to `~/.sanj/long-term-memory.md`
- Observation is removed from pending list

#### 2. Deny Handler
```typescript
async function handleDeny(observation: Observation) {
  // 1. Call ObservationStore.denyObservation(observation.id)
  // 2. Update TUI state (remove from pending list)
  // 3. Load next observation or show completion message
  // 4. Show brief feedback ("Rejected" or similar)
}
```

**Side effects**:
- Observation is marked as "rejected"
- Not shown again in review
- Removed from pending list

#### 3. Skip Handler
```typescript
async function handleSkip(observation: Observation) {
  // 1. Call ObservationStore.skipObservation(observation.id) if needed
  //    (or just move to next without changing state)
  // 2. Load next observation
  // 3. No visual feedback needed (skip is implicit)
}
```

**Side effects**:
- Observation remains pending
- Will appear again on next `sanj review`

### TUI State Management

The TUI must track:
- **Current index**: Position in the pending observations list
- **Pending list**: Array of observations awaiting review
- **Feedback message**: Brief status feedback after action
- **Loading state**: Boolean indicating async operation in progress

Example state structure:
```typescript
interface ReviewState {
  observations: Observation[];
  currentIndex: number;
  isLoading: boolean;
  feedback?: string; // "Approved", "Rejected", etc.
  feedbackTimeout?: NodeJS.Timeout;
}
```

### Error Handling

Each handler must:
1. Catch promise rejections
2. Show error message in TUI ("Failed to approve observation")
3. Keep observation in pending state (don't lose it)
4. Allow user to retry or skip

Example:
```typescript
try {
  await store.approveObservation(observation.id);
  // update state
} catch (error) {
  showError(`Failed to approve: ${error.message}`);
  // keep observation in list
}
```

### Navigation After Action

After an action completes:
1. Get next pending observation using `getNextPending()`
2. If next observation exists: render it
3. If no next observation: show completion message
   - "All observations reviewed!"
   - Show counts: X approved, Y denied
   - Option to exit or return to main menu

---

## Implementation Details

### File Structure

```
src/tui/
├── App.tsx                    # TUI root (updated to wire actions)
├── components/
│   ├── ActionBar.tsx          # Already created (004-007)
│   ├── ObservationList.tsx    # Updated with action handlers
│   └── ...
└── hooks/
    └── useObservations.ts     # New or updated to manage state
```

### Key Functions to Create

1. **`useObservations` hook** (new or updated)
   - Loads pending observations from store
   - Manages current index and feedback state
   - Provides action handlers (approve/deny/skip)
   - Handles navigation to next/previous

2. **Action handlers** (in hook or component)
   - `handleApprove(observation: Observation)`
   - `handleDeny(observation: Observation)`
   - `handleSkip(observation: Observation)`
   - `handleNext()`
   - `handlePrevious()`

3. **Feedback display** (in component)
   - Show message for 1-2 seconds after action
   - Auto-dismiss or allow dismiss
   - Different styling for success/error

### Testing Considerations

Unit tests should verify:
1. Action handler correctly calls ObservationStore method
2. TUI state updates after action
3. Error handling displays user-friendly message
4. Navigation to next observation after action
5. Completion message shows when all reviewed
6. Skip action doesn't modify store

Example test structure:
```typescript
describe("ObservationReview Actions", () => {
  it("should approve observation and move to next", async () => {
    // Mock store with observations
    // Call handleApprove
    // Verify store.approveObservation called with correct ID
    // Verify state changed to next observation
  });

  it("should deny observation and move to next", async () => {
    // Similar to approve test
  });

  it("should skip observation without changing store", async () => {
    // Verify store not called
    // Verify state moved to next
  });

  it("should handle store errors gracefully", async () => {
    // Mock store.approveObservation to throw error
    // Verify error message shown
    // Verify observation still in pending list
  });

  it("should show completion message when no pending observations", async () => {
    // Mock store with empty pending list
    // Call handleApprove (or skip on last observation)
    // Verify completion message rendered
  });
});
```

---

## Acceptance Criteria

- [ ] ActionBar component receives and calls action callbacks
- [ ] ObservationStore methods for approve/deny are callable from TUI
- [ ] Approve action persists to long-term-memory.md and removes from pending
- [ ] Deny action removes from pending and marks as rejected
- [ ] Skip action moves to next observation without changing store state
- [ ] TUI updates immediately after action (no need to refresh)
- [ ] Error handling displays user-friendly message if action fails
- [ ] Navigation works correctly after each action (next, previous)
- [ ] Completion message shows when all observations reviewed
- [ ] Feedback message appears briefly after action
- [ ] Unit tests cover all action handlers and error cases
- [ ] No console errors or crashes during review flow

---

## Dependencies Checklist

Before starting this task, verify:

- [ ] ObservationStore (003-008) exists and has CRUD methods
- [ ] ObservationStore has methods to mark as approved/denied/skipped
- [ ] ActionBar component (004-007) exists and accepts callbacks
- [ ] MemoryHierarchy (004-009) exists (for promotion logic)
- [ ] Long-term-memory.md file can be written to
- [ ] TUI framework (OpenTUI) is properly configured
- [ ] `useObservations` hook pattern matches other TUI hooks

---

## Related Documentation

- **JTBD-004**: Review & Approve Observations (TUI) - from 03-jtbd.md
- **Task 003-008**: ObservationStore implementation - see 04-tasks.md
- **Task 004-007**: ActionBar component - see 04-tasks.md
- **Task 004-013**: PromotionList view (blocked by this task)
- **HLD Storage section**: `~/.sanj/` structure - from 05-hld.md

---

## Implementation Notes

### State Persistence

- Approved observations go to long-term-memory.md
- Denied observations are marked in observations.json but hidden
- Skipped observations remain in pending state
- All changes must be immediately persisted to disk

### TUI Responsiveness

- Show loading indicator while async operations complete
- Keep navigation responsive (don't block on slow store operations)
- Debounce rapid key presses to prevent duplicate actions

### User Feedback

Clear, concise feedback after each action:
- Approve: "✓ Approved"
- Deny: "✗ Rejected"
- Error: "✗ Failed: [brief error message]"
- Completion: "All observations reviewed! [summary stats]"

### Future Considerations

- Undo action (revert deny/approve)
- Bulk actions (approve all, deny all)
- Search/filter observations before review
- Sort observations by count or date

