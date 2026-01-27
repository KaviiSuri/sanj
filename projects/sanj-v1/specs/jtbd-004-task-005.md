# Spec: Create ObservationList Component with Scrollable List

**Task ID**: 004-005
**JTBD**: 004 - Review & Approve Observations (TUI)
**Depends On**: 004-004 - Create ObservationItem component
**Blocks**: 004-006 - Implement keyboard navigation

---

## Overview

Create an `ObservationList` component in OpenTUI that displays a scrollable list of pending observations. This component renders multiple `ObservationItem` components, manages visual hierarchy, and provides the foundation for keyboard navigation and user interactions.

**Objective**: Build a reusable, scrollable list component that displays pending observations with proper spacing, visual hierarchy, and state management for selection/focus.

---

## Context

### From Architecture (HLD)
- Technology: OpenTUI with React reconciler (`@opentui/react`)
- Parent component: `App.tsx`
- Responsibility: Display pending observations in a navigable list format
- Supports JTBD-004: Review & Approve Observations (TUI)

### From Task Breakdown
- Wave 6 task (depends on core UI infrastructure being in place)
- Precedes keyboard navigation (004-006)
- Blocks: PromotionList view (004-013) requires similar list component

### Memory Hierarchy Context
Observations flow through three states:
1. **Pending** (observations.json) - awaiting user review
2. **Long-Term Memory** (long-term-memory.md) - after user approval
3. **Core Memory** (CLAUDE.md/AGENTS.md) - after promotion approval

This component handles the first review phase only.

---

## Component Specification

### File Location
```
src/tui/components/ObservationList.tsx
```

### Component Name
```typescript
export function ObservationList(props: ObservationListProps): JSX.Element
```

### Props Interface

```typescript
interface ObservationListProps {
  // Data
  observations: Observation[];
  selectedIndex?: number;

  // Callbacks
  onSelect?: (index: number) => void;
  onApprove?: (observation: Observation) => void;
  onDeny?: (observation: Observation) => void;
  onSkip?: (observation: Observation) => void;

  // Styling/Display
  title?: string;
  isLoading?: boolean;
  emptyMessage?: string;
}
```

### Data Structure

The component receives `Observation` objects (from ObservationStore):

```typescript
interface Observation {
  id: string;
  text: string;
  count: number;
  sessionReferences: SessionReference[];
  createdAt: Date;
  lastSeenAt: Date;
  status: 'pending' | 'approved' | 'denied';
}

interface SessionReference {
  sessionId: string;
  toolName: string;
  timestamp: Date;
}
```

### Component Structure

```
ObservationList (container)
├── Title/Header (if provided)
├── ScrollBox (OpenTUI component)
│   ├── ObservationItem 1
│   │   ├── observation text
│   │   ├── metadata (count, dates)
│   │   └── session references
│   ├── [vertical spacing]
│   ├── ObservationItem 2
│   │   └── ...
│   └── [repeats for all observations]
└── Footer (if needed)
```

---

## Rendering Requirements

### Layout

1. **Container**
   - Flexible box/column layout using OpenTUI primitives
   - Full width of parent (TUI will handle)
   - Takes remaining vertical space after ActionBar

2. **Scrollable Area**
   - Use OpenTUI `scrollbox` component for scrollable content
   - Support mouse wheel and keyboard scrolling (arrow keys in 004-006)
   - Show scrollbar indicators

3. **Item Spacing**
   - Vertical padding between items: 1-2 lines
   - Horizontal padding: 2 spaces from edges
   - Visual separation clear but compact

4. **Empty State**
   - Display `emptyMessage` prop (default: "No observations pending")
   - Centered in scrollable area
   - Distinguishable from list items

5. **Loading State**
   - If `isLoading` is true, show loading indicator
   - Optional: animated spinner or "Loading..." text

### Visual Hierarchy

Each `ObservationItem` in the list should be visually distinct:

```
┌─ Observation 1 ─────────────────────┐
│ [Text] Pattern about using X feature │
│ Count: 5 | First: 2 days ago        │
│ From: session-123 (Claude Code)     │
│ From: session-456 (OpenCode)        │
└──────────────────────────────────────┘

┌─ Observation 2 ─────────────────────┐
│ [Text] Preference for Y style        │
│ Count: 3 | First: 1 week ago        │
│ From: session-789 (Claude Code)     │
└──────────────────────────────────────┘
```

### Selection Indicator

When an item is selected (managed by parent App component):
- Optional: highlight with color or border (coordinate with 004-006)
- Focus indicator for keyboard navigation
- Clear visual feedback

---

## Behavior

### Initial Render

1. Receive `observations` array from parent (loaded by App.tsx via hook)
2. If empty and not loading, show `emptyMessage`
3. If loading, show loading state
4. If observations exist, render each via `ObservationItem`
5. Default `selectedIndex` to 0 (first item)

### Selection/Focus Management

- Managed by parent (`App.tsx` or dedicated hook in 004-006)
- Component receives `selectedIndex` prop
- Visual focus indicator on item at `selectedIndex`
- Parent handles keyboard events; list is presentation layer

### Action Propagation

When user interacts with an `ObservationItem`:
- Call parent callback: `onApprove(observation)`, `onDeny(observation)`, `onSkip(observation)`
- Parent handles state updates to ObservationStore
- List re-renders with updated observations

---

## Integration Points

### With ObservationItem (004-004)
```typescript
<ObservationItem
  observation={observation}
  isSelected={selectedIndex === index}
  onApprove={() => onApprove?.(observation)}
  onDeny={() => onDeny?.(observation)}
  onSkip={() => onSkip?.(observation)}
/>
```

### With App.tsx (004-003)
- App loads observations via hook (from 004-003)
- App manages selectedIndex state
- App passes observations and callbacks to ObservationList
- App handles keyboard events (implemented in 004-006)

### With ActionBar (004-007)
- ActionBar and ObservationList are siblings in App layout
- ActionBar shows actions for currently selected item
- ActionBar buttons trigger callbacks passed through ObservationList

---

## Dependencies

### Required
- OpenTUI: `@opentui/core` (scrollbox component)
- React: For JSX and component model
- ObservationItem: 004-004 (already completed)
- Types: `src/core/types.ts`

### File Imports
```typescript
import { Scrollbox } from "@opentui/core";
import { Observation, SessionReference } from "../core/types";
import { ObservationItem } from "./ObservationItem";
```

---

## Error Handling

### Edge Cases

1. **Empty observations array**
   - Render `emptyMessage`
   - Don't render scrollbox if no items

2. **selectedIndex out of bounds**
   - Parent should validate before passing
   - Component can defensively handle (clamp or ignore)
   - No errors thrown

3. **Missing observation properties**
   - ObservationItem handles gracefully (see 004-004 spec)
   - List doesn't validate individual observations

4. **Very large observation count (100+)**
   - Scrollbox handles efficiently
   - Consider virtual scrolling in future (not v1)
   - For v1: assume reasonable list sizes (<100 items)

---

## Styling & Theme

### OpenTUI Constraints
- No external CSS; OpenTUI uses text-based formatting
- Use colors: white, black, gray, cyan, magenta, etc. (terminal colors)
- Use effects: bold, underline, dim, etc.

### Recommended Styling
- **List background**: default terminal background
- **Item spacing**: blank lines between items
- **Selected item**: optional highlight (cyan background or border)
- **Text color**: white (foreground), with accents for metadata

---

## Testing Strategy

### Unit Tests (future 004-015)
```typescript
describe("ObservationList", () => {
  it("renders empty state when no observations", () => {
    // render with observations=[]
    // verify emptyMessage is shown
  });

  it("renders all observations", () => {
    // render with 5 observations
    // verify all 5 ObservationItem components rendered
  });

  it("calls onApprove when item approve button clicked", () => {
    // render with mock callback
    // simulate click on approve button
    // verify callback invoked with correct observation
  });

  it("respects selectedIndex prop", () => {
    // render with selectedIndex=2
    // verify 3rd item has selected indicator
  });

  it("handles missing session references gracefully", () => {
    // render observation with empty sessionReferences
    // verify no errors, clean rendering
  });
});
```

### Integration Tests (future)
- ObservationList + App.tsx
- List updates when observations change
- Callbacks flow correctly to parent

---

## Implementation Checklist

- [ ] Create `src/tui/components/ObservationList.tsx` file
- [ ] Define `ObservationListProps` interface
- [ ] Import OpenTUI Scrollbox component
- [ ] Implement scrollable container using Scrollbox
- [ ] Map `observations` array to `ObservationItem` components
- [ ] Render empty state when observations array is empty
- [ ] Render loading state when `isLoading` is true
- [ ] Apply spacing between items (vertical padding)
- [ ] Implement selection indicator based on `selectedIndex`
- [ ] Wire callbacks to ObservationItem click handlers
- [ ] Export component for use in App.tsx
- [ ] Verify types align with `src/core/types.ts`
- [ ] Test with mock observations in isolation
- [ ] Integrate with App.tsx (pull into 004-003)

---

## Notes for Implementation

1. **Scrollbox Usage**: OpenTUI's scrollbox requires explicit dimensions or parent constraints. Ensure App.tsx layout accommodates this.

2. **Selection Pattern**: Consider using a custom hook (e.g., `useSelectedObservation`) in App to manage selectedIndex, separate from ObservationList which is just presentation.

3. **Key Prop**: React requires `key` prop when rendering lists. Use `observation.id` or unique index:
   ```typescript
   {observations.map((obs, index) => (
     <ObservationItem key={obs.id} ... />
   ))}
   ```

4. **Accessibility**: Terminal UIs have limited accessibility. Focus on clear visual indicators and keyboard shortcuts (implemented in 004-006).

5. **Performance**: For large lists (100+ items), consider virtual scrolling in future iterations. For v1, assume typical usage has 5-20 pending observations.

---

## Acceptance Criteria

- [x] Component renders a scrollable list of observations
- [x] Each observation displays via ObservationItem component
- [x] Empty state shows when no observations provided
- [x] Selection state displayed visually (selectedIndex prop)
- [x] Callbacks propagate correctly (onApprove, onDeny, onSkip)
- [x] Keyboard scrolling functional (via OpenTUI scrollbox)
- [x] Component exports correctly for App.tsx integration
- [x] No console errors or warnings in typical usage
- [x] Component integrates seamlessly with 004-006 keyboard navigation

---

## Related Tasks

| Task | Relationship | Notes |
|------|--------------|-------|
| 004-004 | Dependency | ObservationItem component required |
| 004-003 | Integrates with | App.tsx calls ObservationList |
| 004-006 | Depends on this | Adds keyboard navigation to list |
| 004-007 | Sibling | ActionBar displays actions for selected item |
| 004-008 | Uses callbacks | Actions update ObservationStore |
