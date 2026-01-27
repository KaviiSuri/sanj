# Spec: ObservationItem Component (Task 004-004)

**JTBD**: 004 - Review & Approve Observations (TUI)
**Task**: 004-004 - Create ObservationItem component displaying single observation
**Dependencies**: 004-003 (App.tsx shell with OpenTUI renderer)

---

## Overview

The `ObservationItem` component is a reusable TUI element that renders a single observation for review. It displays the observation text, metadata (count, timestamps), and source session references in a clear, readable format. This component is the building block for the `ObservationList` component and is used in the observation review flow.

---

## Purpose

- Render a single observation in the terminal UI
- Display observation content with supporting metadata
- Show source session references for user context
- Maintain consistent styling across all observations
- Set up container and layout patterns for action buttons (approve/deny/skip) in downstream components

---

## Component Specification

### Props

```typescript
interface ObservationItemProps {
  observation: Observation;
  isSelected?: boolean;
  isHighlighted?: boolean;
}
```

**Property Definitions**:

- **`observation: Observation`** (required)
  - The observation data to render
  - Type definition from `src/core/types.ts`
  - See "Data Structure" section below for required fields

- **`isSelected?: boolean`** (optional, default: `false`)
  - Indicates if this item is the currently selected item in the list
  - Used for keyboard navigation highlighting
  - When `true`, the component should render with a distinct visual indicator (e.g., inverse video, border, or color)

- **`isHighlighted?: boolean`** (optional, default: `false`)
  - Indicates if this item matches a search filter or highlight condition
  - Used for visual feedback during list filtering
  - When `true`, the component should render with a distinct visual indicator (e.g., background color)

### Data Structure

The `Observation` type is defined in `src/core/types.ts` and should include at minimum:

```typescript
interface Observation {
  id: string;                    // Unique identifier (UUID)
  text: string;                  // The observation content
  count: number;                 // Frequency (how many times this pattern was observed)
  createdAt: Date;               // When first observed
  lastSeenAt: Date;              // When most recently observed
  sourceSessionIds: string[];    // References to sessions where this was found
  status: 'pending' | 'approved' | 'denied'; // Current state
}
```

### Layout Structure

The component should render the following layout using OpenTUI components:

```
┌─────────────────────────────────────────────────────────────┐
│ [COUNT] OBSERVATION TEXT HERE                               │
│ First seen: 2025-01-15 | Last seen: 2025-01-25            │
│ Sources: session-abc, session-def, session-ghi              │
└─────────────────────────────────────────────────────────────┘
```

#### Detailed Layout Description

1. **Header Row**:
   - Badge showing observation count (e.g., `[3x]`)
   - Observation text (main content)
   - Should wrap to multiple lines if observation text is long

2. **Metadata Row**:
   - First seen timestamp (formatted as `YYYY-MM-DD HH:mm`)
   - Last seen timestamp (formatted as `YYYY-MM-DD HH:mm`)
   - Displayed as: `First seen: <date> | Last seen: <date>`

3. **Sources Row**:
   - Session reference IDs comma-separated
   - Displayed as: `Sources: <session-id>, <session-id>, ...`
   - If sourceSessionIds is empty, display: `Sources: (unknown)`

4. **Borders & Spacing**:
   - Use OpenTUI `<Box>` component with borders
   - Padding: 1 unit on all sides
   - Margin: 0 (list container will handle spacing between items)
   - When `isSelected`, use a distinctive border style (e.g., `border="round"` for selected, `border="single"` for unselected)
   - When `isHighlighted`, apply background color

### Visual Styling

Use OpenTUI and terminal-safe styling:

- **Text colors**: Use standard 16-color palette (not extended colors)
- **Borders**: Use OpenTUI border styles (`single`, `double`, `round`, `bold`)
- **Selected state**:
  - Border style: `bold`
  - Or inverse video if supported
  - Or background color (e.g., dim/bright)

- **Highlighted state**:
  - Background color (if supported)
  - Or text color change

- **Text wrapping**: Ensure observation text wraps properly on narrow terminals

### Implementation Guidelines

1. **Use OpenTUI Components**:
   - `<Box>`: Container with borders and padding
   - `<Text>`: For text content
   - Wrap in React.Fragment or additional Box containers for layout

2. **Width Handling**:
   - Component should be flexible and adapt to parent container width
   - Do not hard-code terminal width (parent will provide via layout context)
   - Ensure text wraps gracefully

3. **Type Safety**:
   - Use TypeScript for all component code
   - Import `Observation` type from `src/core/types.ts`
   - Validate `observation` prop (null checks if needed)

4. **Testing Considerations**:
   - Component should be easily testable with mock Observation data
   - No side effects (pure render component)
   - Accept all necessary data via props

5. **Accessibility**:
   - Use semantic text for metadata
   - Ensure count is clearly labeled (e.g., `3 observations` not just `[3]`)
   - Keep source session IDs readable

### Implementation File

Create: `/Users/kaviisuri/code/KaviiSuri/sanj/src/tui/components/ObservationItem.tsx`

File structure:
```typescript
// Imports
import React from 'react';
import { Box, Text } from '@opentui/react';
import { Observation } from '../../core/types';

// Props interface
interface ObservationItemProps {
  observation: Observation;
  isSelected?: boolean;
  isHighlighted?: boolean;
}

// Component implementation
export const ObservationItem: React.FC<ObservationItemProps> = ({ ... }) => {
  // ... implementation
};

// Export
export default ObservationItem;
```

---

## Integration Points

### Consumed By

- **ObservationList component** (004-005): Iterates over pending observations, rendering each as an `ObservationItem`
- **TUI App** (004-003): May use directly for previews or single-item displays

### Dependencies

- **Types**: `src/core/types.ts` (Observation type)
- **OpenTUI**: `@opentui/react` components (Box, Text)
- **React**: JSX and React utilities

---

## Success Criteria

- Component renders without errors in OpenTUI terminal context
- Observation text, count, and timestamps are displayed correctly
- Source session references are shown
- `isSelected` prop visually highlights the item
- `isHighlighted` prop applies visual styling
- Component handles long observation text with proper line wrapping
- Component handles empty sourceSessionIds gracefully
- TypeScript compilation is clean (no errors or warnings)
- Component is a pure functional component (no side effects)

---

## Testing Strategy

### Unit Tests

Create test file: `tests/tui/components/ObservationItem.test.ts`

Test cases to implement:

1. **Renders basic observation**:
   - Given a valid Observation object
   - Should render text, count, and metadata

2. **Renders long observation text**:
   - Given observation with text > 100 characters
   - Should wrap text properly

3. **Shows correct timestamps**:
   - Given observation with createdAt and lastSeenAt
   - Should format and display dates correctly

4. **Renders source session references**:
   - Given observation with sourceSessionIds array
   - Should display all session IDs comma-separated

5. **Handles empty sources**:
   - Given observation with empty sourceSessionIds
   - Should display "(unknown)" or similar fallback

6. **Applies selected styling**:
   - Given isSelected={true}
   - Should render with selected border/color style

7. **Applies highlighted styling**:
   - Given isHighlighted={true}
   - Should render with highlighted background/color

### Manual Testing

- Run TUI and navigate observation list
- Verify styling in actual terminal
- Test with various observation lengths
- Verify keyboard navigation highlighting works correctly

---

## Dependencies & Prerequisites

**Must be completed before**:
- 004-005 (ObservationList component)
- 004-006 (Keyboard navigation)

**Depends on**:
- 004-003 (App.tsx with OpenTUI renderer) - Component uses OpenTUI context/exports
- 003-001 (Core types) - Observation type definition

**Related tasks**:
- 004-007 (ActionBar) - Will sit alongside/below ObservationItem in the list
- 004-008 (Wiring actions) - Will use ObservationItem to display state

---

## Technical Notes

### Terminal Constraints

- Terminal width is variable (typically 80-200 characters)
- Use OpenTUI's width calculation for responsive layout
- Avoid hard-coded terminal dimensions

### React & Reconciler

- Component must work with `@opentui/react` reconciler
- Follow React patterns (functional components, hooks if needed)
- Avoid browser-specific APIs

### Date Formatting

Recommend using a utility function for consistent date formatting:

```typescript
const formatDate = (date: Date): string => {
  return date.toISOString().slice(0, 16).replace('T', ' ');
};
```

Or use a library like `date-fns` if added to dependencies.

---

## Acceptance Checklist

- [ ] File created at `/Users/kaviisuri/code/KaviiSuri/sanj/src/tui/components/ObservationItem.tsx`
- [ ] Component exports `ObservationItem` as default export and named export
- [ ] Props interface defined with `Observation`, `isSelected`, `isHighlighted`
- [ ] Component renders with OpenTUI Box and Text components
- [ ] Observation text, count, timestamps, and sources are displayed
- [ ] Selected state applies distinct styling
- [ ] Highlighted state applies distinct styling
- [ ] Text wrapping works for long observation content
- [ ] Empty sourceSessionIds handled gracefully
- [ ] TypeScript compiles without errors
- [ ] Component is pure (no side effects, no async operations)
- [ ] Unit tests pass (if applicable to this stage)
- [ ] Component can be imported by ObservationList (004-005)

---

## References

- **HLD**: `/Users/kaviisuri/code/KaviiSuri/sanj/projects/sanj-v1/05-hld.md` - Architecture overview
- **Task Breakdown**: `/Users/kaviisuri/code/KaviiSuri/sanj/projects/sanj-v1/04-tasks.md` - JTBD-004 task dependencies
- **JTBD-004**: `/Users/kaviisuri/code/KaviiSuri/sanj/projects/sanj-v1/03-jtbd.md` - Review & Approve Observations context
- **OpenTUI Docs**: https://opentui.dev/ - Component reference
- **React Docs**: https://react.dev/ - React patterns and hooks

---

## Notes

- Keep component lightweight and focused on rendering a single observation
- Action handling (approve/deny/skip) will be implemented in parent components and ActionBar (004-007)
- This component is read-only; mutations happen in parent via callbacks
- Consider reusability for different list contexts (pending observations, long-term memory, etc.)
