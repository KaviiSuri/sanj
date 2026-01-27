# Spec: Task 004-006 - Implement Keyboard Navigation in ObservationList

## Overview

Implement keyboard navigation controls for the ObservationList component to enable users to navigate through observations and select items using arrow keys and Enter key.

## Context

**JTBD**: JTBD-004 (Review & Approve Observations - TUI)
**Depends On**: 004-005 (Create ObservationList component with scrollable list)
**Blocks**: None (no blocking dependencies)

The ObservationList is the primary interface for users to review pending observations. Keyboard navigation is essential for an efficient TUI experience, allowing users to browse observations without mouse interaction.

## Requirements

### Functional Requirements

#### FR-1: Arrow Key Navigation
- **Up Arrow**: Move selection up one item (if not at first item)
- **Down Arrow**: Move selection down one item (if not at last item)
- Navigation should wrap at boundaries (no wrap-around by default, but implementation may allow it)
- Visual feedback shows currently selected item

#### FR-2: Enter Key Selection
- **Enter**: Confirm selection of current item and trigger action (focus moves to ActionBar)
- Selection state is maintained while user reviews action options

#### FR-3: Boundary Handling
- At top of list: Up arrow has no effect (or visual indicator shows cannot go higher)
- At bottom of list: Down arrow has no effect (or visual indicator shows cannot go lower)
- At least one item must be selected at all times (if list is non-empty)

#### FR-4: Visual Feedback
- Selected item is visually distinct from unselected items
- Clear indication of current position in list (e.g., "2/10" or highlight styling)
- Focus state is visible

#### FR-5: Interaction with ActionBar
- After user presses Enter on a selected observation, focus moves to ActionBar component
- ActionBar displays action buttons: Approve, Deny, Skip
- After action is taken, focus returns to ObservationList with next item selected

### Non-Functional Requirements

#### NFR-1: Performance
- Keyboard input response should be immediate (no noticeable lag)
- List with 100+ observations should navigate smoothly

#### NFR-2: Usability
- Navigation should feel natural and responsive
- Should match common TUI conventions (vim-like or arrow-key based)
- Clear visual indication of selected state

#### NFR-3: Code Quality
- Component should use React hooks (useState, useCallback, useEffect) as per project pattern
- Keyboard event handling should be debounced or throttled if needed
- Maintainable code with clear variable names and comments

## Technical Specification

### Component Interface

The ObservationList component should expose the following interface:

```typescript
interface ObservationListProps {
  observations: Observation[];
  selectedIndex: number;
  onSelectionChange: (index: number) => void;
  onConfirm: (observation: Observation) => void;
}
```

### Keyboard Event Handling

```typescript
// Pseudocode for keyboard handling
const handleKeyDown = (event: KeyboardEvent) => {
  switch (event.key) {
    case 'ArrowUp':
      event.preventDefault();
      setSelectedIndex(Math.max(0, selectedIndex - 1));
      break;
    case 'ArrowDown':
      event.preventDefault();
      setSelectedIndex(Math.min(observations.length - 1, selectedIndex + 1));
      break;
    case 'Enter':
      event.preventDefault();
      onConfirm(observations[selectedIndex]);
      break;
    default:
      break;
  }
};
```

### State Management

The component should manage:
- `selectedIndex`: Current selection position in the list (0-based)
- Keyboard event listener attachment/cleanup
- Focus state (is the component focused?)

### Visual Implementation

Using OpenTUI components:
- **Selected item**: Apply highlight styling (e.g., `style={{ background: 'white', color: 'black' }}`)
- **Unselected items**: Normal styling
- **Position indicator**: Optional status line showing "N/Total"

Example visual structure:
```
┌─ Observations ─────────────────┐
│ > Item 1 (selected)      [1/3] │
│   Item 2                       │
│   Item 3                       │
└────────────────────────────────┘
```

### Integration Points

#### With ObservationItem Component
- ObservationList receives Observation[] array
- Renders ObservationItem for each observation
- Passes selected state to ObservationItem for styling

#### With ActionBar Component
- When Enter is pressed, component calls `onConfirm()` callback
- Parent (App.tsx) coordinates transition to ActionBar
- After action completes, focus returns to ObservationList

#### With App.tsx (TUI Root)
- App.tsx manages overall TUI state and focus routing
- ObservationList is one of two primary views (ObservationReview / PromotionReview)

## Implementation Checklist

- [ ] Accept `selectedIndex` and `onSelectionChange` as props
- [ ] Accept `onConfirm` callback for Enter key handling
- [ ] Attach keyboard event listener in useEffect
- [ ] Handle Arrow Up/Down keys with boundary checking
- [ ] Handle Enter key with onConfirm callback
- [ ] Prevent default browser behavior for arrow keys
- [ ] Apply visual styling to selected item
- [ ] Clean up event listener on component unmount
- [ ] Test with empty list (no observations)
- [ ] Test with single observation
- [ ] Test with many observations (100+)
- [ ] Verify keyboard responsiveness
- [ ] Ensure focus state is visible

## Testing Considerations

### Unit Tests (in tests/tui/ or tests/components/)

1. **Navigation Bounds**
   - Up arrow at index 0 should not change selection
   - Down arrow at last index should not change selection
   - At index 0, down arrow moves to index 1

2. **KeyPress Handling**
   - ArrowUp/ArrowDown/Enter prevent default
   - Enter triggers onConfirm callback with correct observation
   - Invalid keys are ignored

3. **Props Changes**
   - Updating selectedIndex prop updates visual selection
   - Updating observations array updates rendered list
   - onConfirm callback is called with correct observation

4. **Edge Cases**
   - Empty observations array
   - Single observation
   - Very large list (1000+ items)

### Manual Testing

1. Start TUI with `sanj review`
2. Verify arrow keys move selection up/down
3. Verify visual feedback shows selected item
4. Press Enter and verify ActionBar appears
5. Verify focus returns after action

## Dependencies

### Internal
- `ObservationItem` component (from 004-004)
- `Observation` type from `src/core/types.ts`

### External
- OpenTUI React reconciler (already installed in 004-001)
- React hooks (useState, useCallback, useEffect)

## Files to Create/Modify

### Files to Create
- `src/tui/components/ObservationList.tsx` (new file with keyboard navigation)

### Files to Modify
- `src/tui/App.tsx` (integrate ObservationList with keyboard event handling and focus management)
- `src/tui/components/ObservationItem.tsx` (ensure it accepts and displays selected state)

### Files Already Exist (dependency)
- `src/tui/index.ts` (entry point)
- `src/tui/components/ActionBar.tsx` (after 004-007)
- `src/core/types.ts` (types and interfaces)

## Acceptance Criteria

- [x] Component accepts selectedIndex and onSelectionChange props
- [x] Arrow Up/Down keys navigate through list
- [x] Navigation respects list boundaries (no wrapping)
- [x] Enter key calls onConfirm callback with selected observation
- [x] Keyboard events are prevented from bubbling
- [x] Selected item has distinct visual styling
- [x] Focus is maintained on component until Enter pressed
- [x] List with 100+ observations navigates smoothly
- [x] Component cleans up keyboard listeners on unmount
- [x] Works correctly with empty and single-item lists

## Notes

- OpenTUI does not have built-in keyboard handlers; all event handling must be implemented manually
- Consider using `@react-hook/use-key` or similar for cleaner key binding if it works with OpenTUI
- The component should be keyboard-only for v1 (no mouse support)
- Position indicator (e.g., "1/10") is optional but recommended for UX
- Event preventDefault() is critical to prevent OpenTUI/terminal from interpreting the keys

## Future Enhancements (not in v1)

- Page Up/Page Down for jumping multiple items
- J/K keys (vim-like navigation)
- Home/End keys to jump to first/last item
- Mouse support
- Search/filter within list
