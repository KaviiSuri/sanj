# Spec: Task 004-013 - Create PromotionList View for Long-Term to Core Promotions

**JTBD**: 004 - Review & Approve Observations (TUI)
**Task**: 004-013 - Create PromotionList view for long-term to core promotions
**Dependencies**: 004-009 (MemoryHierarchy), 004-011 (ClaudeMdAdapter), 004-012 (AgentsMdAdapter)
**Blocked By**: 004-008 (Wire approve/deny/skip actions)
**Blocks**: 004-014 (Implement review command)

---

## Overview

This task involves creating a React-based TUI component called `PromotionList` that displays long-term memories ready for promotion to core memory files (CLAUDE.md/AGENTS.md). Users can navigate through these promotion candidates and approve/deny each one, with changes written to the appropriate core memory files.

This component works in tandem with the `ObservationList` component (004-005) as the second major view in the `sanj review` command.

---

## Context

### Memory Hierarchy Flow

The sanj tool uses a 3-tier memory system:

```
Observations (pending)
    ↓ [user approval in TUI]
Long-Term Memory (long-term-memory.md)
    ↓ [count threshold + time threshold + user approval]
Core Memory (CLAUDE.md / AGENTS.md)
```

The PromotionList handles the second transition: Long-Term → Core Memory.

### Integration Points

- **MemoryHierarchy** (004-009): Provides `getPromotable()` method returning memories ready for promotion
- **ClaudeMdAdapter** (004-011): Writes approved promotions to ~/.claude/CLAUDE.md
- **AgentsMdAdapter** (004-012): Writes approved promotions to global AGENTS.md location
- **ObservationList** (004-005): Shows observations awaiting promotion to long-term
- **App.tsx** (004-003): Main TUI app that switches between ObservationList and PromotionList views

---

## Requirements

### Functional Requirements

#### FR-1: Display Promotable Memories
- Query `MemoryHierarchy.getPromotable()` to get long-term memories meeting promotion thresholds
- Display each promotion candidate with:
  - Memory text/content
  - Current count (frequency in long-term)
  - Time since first captured
  - Target destination(s) (which core memory file(s): CLAUDE.md, AGENTS.md, or both)
  - Source session references (optional: which observations led to this memory)

#### FR-2: Keyboard Navigation
- Arrow keys (up/down) to select between items
- Enter to expand details of selected item
- Keyboard shortcuts for actions:
  - `A` or Enter: Approve and write to core memory
  - `D`: Deny/reject and remove from promotion candidates
  - `S`: Skip (keep in long-term, decide later)
  - `Q` or Esc: Quit/return to observation review

#### FR-3: Approve Actions
- When user approves a promotion:
  - Format the memory appropriately for the target file(s)
  - Write to ClaudeMdAdapter if CLAUDE.md is enabled
  - Write to AgentsMdAdapter if AGENTS.md is enabled
  - Remove from promotion candidates list
  - Update MemoryHierarchy state to mark as promoted
  - Show success/confirmation message

#### FR-4: Deny Actions
- When user denies a promotion:
  - Mark the memory as rejected in MemoryHierarchy
  - Don't show in future promotion lists (unless manually reset)
  - Remove from current view
  - Show confirmation message

#### FR-5: Skip Actions
- Keep the memory in the promotion queue
- Show next memory
- User can come back to skipped items

#### FR-6: Empty State
- If no promotions are ready, display clear message: "No long-term memories ready for promotion"
- Show what thresholds must be met (e.g., "Memories need X occurrences and Y days in long-term")
- Offer option to return to observation review

#### FR-7: Error Handling
- If write to core memory fails:
  - Display error message
  - Don't mark as promoted
  - Offer retry or skip options
- If MemoryHierarchy fails to load:
  - Show error and return to main menu
- If file system permission denied:
  - Show informative error about permissions

---

### Non-Functional Requirements

#### NFR-1: Performance
- Load promotion list within 100ms
- No blocking I/O during navigation
- Lazy load large content previews if needed

#### NFR-2: UX Polish
- Clear visual distinction between current item and others
- Highlight which files will be written to
- Show progress (e.g., "3 of 7 promotions reviewed")
- Confirm destructive actions (writing to core memory files)

#### NFR-3: Consistency
- Match UI patterns from ObservationList component
- Use same ActionBar component or similar
- Consistent color scheme and layout

#### NFR-4: Testing
- Unit tests for promotion logic integration
- Mock MemoryHierarchy and CoreMemoryAdapters
- Test edge cases: empty promotions, write errors, invalid data

---

## Design

### Component Structure

```
PromotionList
├── State
│   ├── promotions: PromotableMemory[]  (from MemoryHierarchy)
│   ├── selectedIndex: number
│   ├── isLoading: boolean
│   ├── error: string | null
│   └── confirming: boolean  (for confirmation dialog)
├── Render
│   ├── Header (title + progress)
│   ├── EmptyState (if no promotions)
│   ├── PromotionItem (current selection)
│   ├── Preview (optional: next few items)
│   └── ActionBar (approve/deny/skip buttons)
└── Handlers
    ├── handleApprove()
    ├── handleDeny()
    ├── handleSkip()
    ├── handleKeydown()
    └── handleExit()
```

### Data Types (from 004-009 MemoryHierarchy)

```typescript
interface PromotableMemory {
  id: string;
  content: string;
  count: number;
  firstCapturedAt: Date;
  lastUpdatedAt: Date;
  targetAdapters: Array<'claude-md' | 'agents-md'>;  // which files to write to
  readyReason?: string;  // why it's ready (e.g., "count=5, age=30 days")
  observations?: string[];  // optional: linked observation IDs
}
```

### Layout

```
┌──────────────────────────────────────────┐
│ Promote Long-Term Memories to Core       │
│ [2 of 5 ready for promotion]             │
├──────────────────────────────────────────┤
│                                          │
│ Memory #2:                               │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│ "Always prefer composition over          │
│  inheritance in TypeScript code"         │
│                                          │
│ Count: 4                                 │
│ Age: 28 days                             │
│ Target: CLAUDE.md, AGENTS.md             │
│                                          │
│ Next: "Use strict mode for all JS..."    │
│                                          │
├──────────────────────────────────────────┤
│ [A]pprove  [D]eny  [S]kip  [Q]uit        │
└──────────────────────────────────────────┘
```

### Approval Confirmation Flow

When user presses Approve:

```
1. Show confirmation dialog:
   "Write to CLAUDE.md and AGENTS.md?"
   Yes / No / Cancel

2. On Yes:
   - Call ClaudeMdAdapter.append(formattedContent)
   - Call AgentsMdAdapter.append(formattedContent)
   - If both succeed: mark as promoted in MemoryHierarchy
   - If one fails: show error, ask retry/skip
   - Update UI to move to next promotion
   - Show "✓ Promotion approved and written"

3. On No/Cancel:
   - Return to normal view, item still selected
```

### Content Formatting

When writing to core memory files:

```markdown
## Promotion from Long-Term Memory

**Observation**: "Always prefer composition over inheritance in TypeScript code"

**Frequency**: 4 times in analysis runs
**Age**: 28 days since first captured
**Source Sessions**: session-abc123, session-def456

---
```

---

## Implementation Details

### File Location

```
src/tui/components/PromotionList.tsx
```

### Component Props (if reusable)

```typescript
interface PromotionListProps {
  memoryHierarchy: MemoryHierarchy;
  claudeMdAdapter: CoreMemoryAdapter;
  agentsMdAdapter: CoreMemoryAdapter;
  onExit: () => void;  // return to main menu or observation list
}
```

### Hook Dependencies

```typescript
// Load promotable memories on mount
const [promotions, setPromotions] = useState<PromotableMemory[]>([]);
const [selectedIndex, setSelectedIndex] = useState(0);
const [isLoading, setIsLoading] = useState(true);
const [error, setError] = useState<string | null>(null);
const [confirming, setConfirming] = useState(false);

useEffect(() => {
  loadPromotions();
}, [memoryHierarchy]);

useEffect(() => {
  handleKeydown;  // wire keyboard events
}, []);
```

### Key Methods

#### loadPromotions()
```typescript
async function loadPromotions() {
  try {
    setIsLoading(true);
    const promotable = await memoryHierarchy.getPromotable();
    setPromotions(promotable);
    if (promotable.length === 0) {
      setError(null);  // not an error, just empty
    }
  } catch (err) {
    setError(`Failed to load promotions: ${err.message}`);
  } finally {
    setIsLoading(false);
  }
}
```

#### handleApprove()
```typescript
async function handleApprove() {
  const memory = promotions[selectedIndex];
  if (!memory) return;

  setConfirming(true);
  try {
    // Format content for core memory
    const formatted = formatForCoreMemory(memory);

    const errors: string[] = [];

    // Write to each target adapter
    if (memory.targetAdapters.includes('claude-md')) {
      try {
        await claudeMdAdapter.append(formatted);
      } catch (err) {
        errors.push(`CLAUDE.md: ${err.message}`);
      }
    }

    if (memory.targetAdapters.includes('agents-md')) {
      try {
        await agentsMdAdapter.append(formatted);
      } catch (err) {
        errors.push(`AGENTS.md: ${err.message}`);
      }
    }

    if (errors.length > 0) {
      setError(errors.join('; '));
      return;
    }

    // Mark as promoted
    await memoryHierarchy.markPromoted(memory.id);

    // Remove from list and move to next
    const newPromotions = promotions.filter((_, i) => i !== selectedIndex);
    setPromotions(newPromotions);

    if (newPromotions.length === 0) {
      showSuccess('All ready promotions approved!');
    } else {
      setSelectedIndex(Math.min(selectedIndex, newPromotions.length - 1));
      showSuccess(`Promotion approved and written`);
    }
  } finally {
    setConfirming(false);
  }
}
```

#### handleDeny()
```typescript
async function handleDeny() {
  const memory = promotions[selectedIndex];
  if (!memory) return;

  try {
    await memoryHierarchy.markRejected(memory.id);
    const newPromotions = promotions.filter((_, i) => i !== selectedIndex);
    setPromotions(newPromotions);
    setSelectedIndex(Math.min(selectedIndex, newPromotions.length - 1));
  } catch (err) {
    setError(`Failed to deny promotion: ${err.message}`);
  }
}
```

#### handleKeydown()
```typescript
function handleKeydown(e: KeyboardEvent) {
  if (confirming) {
    // Handle confirmation dialog keys
    if (e.key === 'y' || e.key === 'Y') handleConfirmApprove();
    if (e.key === 'n' || e.key === 'N') setConfirming(false);
    return;
  }

  switch (e.key) {
    case 'ArrowUp':
      setSelectedIndex(Math.max(0, selectedIndex - 1));
      break;
    case 'ArrowDown':
      setSelectedIndex(Math.min(promotions.length - 1, selectedIndex + 1));
      break;
    case 'Enter':
    case 'a':
    case 'A':
      handleApprove();
      break;
    case 'd':
    case 'D':
      handleDeny();
      break;
    case 's':
    case 'S':
      handleSkip();
      break;
    case 'q':
    case 'Q':
    case 'Escape':
      onExit();
      break;
  }
}
```

---

## Testing Strategy

### Unit Tests (004-013.test.ts)

1. **Load promotions**
   - Mock MemoryHierarchy returning valid promotions
   - Verify promotions are displayed

2. **Approve promotion**
   - Mock both adapters
   - Call handleApprove()
   - Verify both adapters.append() called with correct content
   - Verify memory marked as promoted
   - Verify UI updates to next item

3. **Approve with partial failure**
   - Mock one adapter to throw error
   - Call handleApprove()
   - Verify error is displayed
   - Verify memory is NOT marked as promoted
   - Verify item remains in list

4. **Deny promotion**
   - Call handleDeny()
   - Verify MemoryHierarchy.markRejected() called
   - Verify item removed from list
   - Verify next item selected

5. **Keyboard navigation**
   - Simulate arrow up/down
   - Verify selectedIndex changes correctly
   - Verify wrapping at boundaries

6. **Empty state**
   - Mock MemoryHierarchy returning empty array
   - Verify empty state message displayed

### Integration Notes

- PromotionList should integrate with the main App component
- App should manage switching between ObservationList and PromotionList
- After observation review completes, automatically show promotions if any exist
- On promotion review complete, offer option to re-run analysis or exit

---

## Acceptance Criteria

- [ ] PromotionList component renders with correct layout
- [ ] Loads promotable memories from MemoryHierarchy on mount
- [ ] Keyboard navigation (arrows, A/D/S/Q) works correctly
- [ ] Approve writes to correct core memory adapters
- [ ] Deny marks memory as rejected and removes from list
- [ ] Skip keeps memory in queue and moves to next
- [ ] Error messages are clear and actionable
- [ ] Empty state handled gracefully with helpful message
- [ ] Confirmation dialog before writing to core memory
- [ ] All unit tests pass
- [ ] Component integrates cleanly with App and review command flow

---

## Dependencies Summary

| Dependency | From Task | Status | Usage |
|---|---|---|---|
| MemoryHierarchy | 004-009 | Required | Load promotable memories, mark promoted/rejected |
| ClaudeMdAdapter | 004-011 | Required | Write to CLAUDE.md |
| AgentsMdAdapter | 004-012 | Required | Write to AGENTS.md |
| App.tsx | 004-003 | Required | Parent component, state management |
| OpenTUI | 004-001 | Required | Rendering framework |
| React | 004-001 | Required | Component model |

---

## Future Enhancements (Not v1)

- Preview pane showing what will be appended to each file
- Bulk approve/deny all remaining promotions
- Filter/search by content or age
- Undo last promotion (rollback from core memory)
- Custom formatting per adapter
- Scheduling: postpone promotion to later date
