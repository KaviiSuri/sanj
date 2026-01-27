# Spec: Task 004-003 - Create basic App.tsx shell with OpenTUI renderer

## Overview

This task creates the foundational React component for the TUI (Terminal User Interface) that will serve as the root of the review interface. The App.tsx acts as the main container for all TUI views, handling the overall layout and state management initialization.

**Depends On**: 004-002 (TUI entry point created)
**Blocks**: 004-004, 004-007 (component hierarchy)
**JTBD**: 004 - Review & Approve Observations (TUI)

---

## Objective

Create a functional React component (`src/tui/App.tsx`) that:
1. Initializes the OpenTUI rendering environment
2. Sets up the root layout for the review interface
3. Manages global state/context for observations
4. Renders placeholder views ready for sub-components
5. Provides clean exit handling

---

## Technical Requirements

### Environment Setup

- **Framework**: OpenTUI with React reconciler (`@opentui/react`)
- **Language**: TypeScript
- **Component Model**: React functional components with hooks
- **Styling**: OpenTUI built-in styling (box, text components)

### Component Structure

The App.tsx must:

1. **Import Required Dependencies**
   - OpenTUI components: `Box`, `Text` (from `@opentui/core`)
   - React: `useState`, `useEffect`, `useCallback` (as needed)
   - Local types: `Observation` from `src/core/types.ts`
   - Local services: `ObservationStore` from `src/core/ObservationStore.ts`

2. **Define Component Props Interface**
   ```typescript
   interface AppProps {
     mode: 'observations' | 'promotions'; // which view to show
     onExit?: () => void;
   }
   ```

3. **Implement Root Layout**
   - Header: Display title and current mode
   - Content area: Placeholder for child view components
   - Footer: Show navigation hints (e.g., "↑/↓ navigate, Enter select, q quit")
   - Status line: Show count of pending items

4. **Initialize State Management**
   - Load observations from disk using ObservationStore
   - Handle loading states gracefully
   - Provide context/state for child components to access

5. **Keyboard Event Handling**
   - Capture 'q' key for clean exit
   - Capture 'tab' for switching between views (observations ↔ promotions)
   - Pass other keystrokes to child components
   - Ensure Ctrl+C terminates gracefully

### File Location & Module Exports

**Path**: `/Users/kaviisuri/code/KaviiSuri/sanj/src/tui/App.tsx`

**Exports**:
```typescript
export default function App(props: AppProps): React.ReactElement;
```

### Component Hierarchy

This component serves as the parent for:
- `ObservationList` (004-004) - displays pending observations
- `PromotionList` (004-013) - displays long-term memories ready for core memory
- `ActionBar` (004-007) - action buttons and controls

Layout structure example:
```
┌─────────────────────────────────┐
│  Sanj Review - Observations (5) │  ← Header with count
├─────────────────────────────────┤
│                                 │
│  [Child component renders here] │  ← Content area
│  (ObservationList or            │
│   PromotionList)                │
│                                 │
├─────────────────────────────────┤
│ ↑/↓: navigate | Enter: select   │  ← Footer with hints
│ Tab: switch view | q: quit      │
└─────────────────────────────────┘
```

---

## Implementation Details

### 1. Type Definitions

Ensure the component uses types from `src/core/types.ts`:
```typescript
interface Observation {
  id: string;
  text: string;
  count: number;
  createdAt: Date;
  lastSeenAt: Date;
  status: 'pending' | 'approved' | 'denied';
  sessionReferences: string[];
}
```

### 2. State Hook Structure

```typescript
const App: React.FC<AppProps> = ({ mode, onExit }) => {
  const [observations, setObservations] = useState<Observation[]>([]);
  const [currentMode, setCurrentMode] = useState(mode);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load data on mount
  useEffect(() => {
    // Load observations from store
  }, []);

  // Handle keyboard input
  useEffect(() => {
    // Listen for key presses
  }, []);
};
```

### 3. Error Handling

- Handle missing or unreadable observations file gracefully
- Display user-friendly error messages in TUI
- Provide fallback behavior (empty list, retry option)

### 4. Logging

- Log component lifecycle events (mount, unmount, mode changes) to stderr
- Log errors for debugging (will go to cron logs)
- Keep logging minimal to avoid TUI output pollution

---

## Acceptance Criteria

✓ Component renders without errors
✓ Header displays title and current mode (observations/promotions)
✓ Footer displays navigation hints
✓ Status line shows count of pending observations
✓ Loads observations from disk on mount
✓ Handles missing/empty observation file gracefully
✓ 'q' key triggers clean exit
✓ 'Tab' key switches between views
✓ Error states display user-friendly messages
✓ Component is fully typed with TypeScript
✓ Ready to receive child components (ObservationList, PromotionList, ActionBar)

---

## Testing Notes

- **No unit tests for this task** (integration testing will cover component behavior)
- Manual testing: verify TUI launches without crashes
- Verify keyboard input is captured and processed
- Verify data loads from disk correctly

---

## Dependencies

### Runtime
- `@opentui/core` - TUI components
- `@opentui/react` - React reconciler
- `react` - Component framework

### Internal
- `src/core/types.ts` - Type definitions
- `src/core/ObservationStore.ts` - Data access

---

## Notes & Gotchas

### OpenTUI Considerations
- OpenTUI is still in active development; some features may be unstable
- TMPDIR environment variable issues reported - ensure proper env setup in parent process
- Windows compatibility is limited; this is macOS/Linux only
- No built-in styling system - rely on Box layout and Text components
- React reconciler may have differences from web React; test carefully

### Code Patterns
- Use functional components with hooks (not class components)
- Avoid side effects in render; use useEffect for data loading
- Keep state in App.tsx minimal; delegate complex state to child components
- Use context if multiple levels of props drilling occur

### Future Extensibility
- Design with potential for dark mode / theme switching later
- Consider how to support additional views beyond observations/promotions
- Ensure state management can scale to hundreds of observations

---

## Implementation Checklist

- [ ] Create `src/tui/App.tsx` file
- [ ] Import OpenTUI components (Box, Text)
- [ ] Import React hooks (useState, useEffect, useCallback)
- [ ] Define AppProps interface
- [ ] Implement App component function
- [ ] Add header layout with title and mode display
- [ ] Add content placeholder area
- [ ] Add footer with navigation hints
- [ ] Add status line with observation count
- [ ] Initialize observations state hook
- [ ] Add useEffect for loading observations on mount
- [ ] Add useEffect for keyboard event handling
- [ ] Implement 'q' key exit handler
- [ ] Implement 'Tab' key mode switcher
- [ ] Add error state display
- [ ] Add loading state display
- [ ] Verify TypeScript compilation
- [ ] Verify component is exportable from module
- [ ] Manual test: TUI launches and displays correctly
- [ ] Manual test: keyboard input captured
- [ ] Manual test: clean exit on 'q' key

---

## Reference Files

- **Entry Point**: `src/tui/index.ts` (404-002) - spawns this component
- **Types**: `src/core/types.ts` (003-001) - Observation, Session types
- **Data Access**: `src/core/ObservationStore.ts` (003-008) - CRUD operations
- **Child Components**:
  - `src/tui/components/ObservationList.tsx` (004-004)
  - `src/tui/components/ActionBar.tsx` (004-007)
  - `src/tui/components/PromotionList.tsx` (004-013)

---

## Success Signal

Component successfully renders when `sanj review` is executed:
1. TUI window appears with header, content area, and footer
2. Observations are loaded and count displayed
3. Keyboard input is captured and processed
4. No console errors or TypeScript compilation errors
5. Clean exit when 'q' is pressed
