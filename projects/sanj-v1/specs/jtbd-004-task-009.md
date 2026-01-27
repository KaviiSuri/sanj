# Specification: Task 004-009 - Implement MemoryHierarchy with promotion logic

**Task ID**: 004-009
**JTBD**: 004 - Review & Approve Observations (TUI)
**Dependency**: 003-001 (Define core types)
**Status**: Pending

---

## Overview

Implement the `MemoryHierarchy` class that manages promotion of observations through three memory levels:

1. **Observations** (pending) → stored in observations.json
2. **Long-Term Memory** → stored in long-term-memory.md
3. **Core Memory** → written to CLAUDE.md / AGENTS.md

This is a core domain component that enforces the promotion logic and thresholds required for the TUI review flow.

---

## Scope

### In Scope
- Implement `MemoryHierarchy` class with promotion methods
- Define promotion thresholds (count, time-in-memory)
- Implement state management for observations at each level
- Validation before promotion (count checks, time checks)
- Integration with ObservationStore for reading observations
- Integration with CoreMemoryAdapter for writing to final destinations

### Out of Scope
- User interface/TUI logic (handled by 004-013)
- Writing to CLAUDE.md/AGENTS.md directly (delegated to CoreMemoryAdapters)
- LLM-based judgment for promotions (can be added in future iterations)
- Cron scheduling logic (handled by 007-001)

---

## Detailed Requirements

### MemoryHierarchy Class

**Location**: `src/core/MemoryHierarchy.ts`

**Responsibilities**:
1. Track observations through their lifecycle (pending → long-term → core)
2. Enforce promotion thresholds
3. Read/write state to persistent storage
4. Calculate promotion readiness
5. Execute promotions (transitions between levels)

### Data Structures

#### Promotion Thresholds (from config or sensible defaults)

```typescript
interface PromotionThresholds {
  // Observation → Long-Term
  observationToLongTerm: {
    minCount: number;        // e.g., 3 occurrences
    requiresApproval: boolean; // true
  };

  // Long-Term → Core
  longTermToCore: {
    minCount: number;         // e.g., 5 occurrences
    minDaysInLongTerm: number; // e.g., 7 days
    requiresApproval: boolean; // true
  };
}
```

#### Memory Item (extended from Observation)

```typescript
interface MemoryItem {
  // From original observation
  id: string;
  text: string;
  count: number;
  sessionRefs: string[];    // session IDs where observed
  firstSeen: Date;
  lastSeen: Date;

  // Memory hierarchy state
  level: 'pending' | 'long_term' | 'core';
  deniedAt?: Date;          // if marked as denied
  approvedAt?: Date;        // when user approved promotion
  promotedToLongTermAt?: Date;
  promotedToCoreAt?: Date;
  coreMemoryTargets?: ('claude_md' | 'agents_md')[]; // where written
}
```

#### Storage Format

Long-term memory stored in `~/.sanj/long-term-memory.md`:
```markdown
# Long-Term Memory

## [Observation Text]
- Count: 5
- First seen: 2026-01-20
- Last seen: 2026-01-26
- Sessions: session-1, session-2
- Status: pending_core_promotion | approved_for_core

## [Another Observation]
...
```

### Core Methods

#### Constructor & Initialization

```typescript
class MemoryHierarchy {
  constructor(
    private observationStore: ObservationStore,
    private coreMemoryAdapters: CoreMemoryAdapter[],
    private thresholds: PromotionThresholds,
    private storagePath: string // ~/.sanj/long-term-memory.md
  ) {}

  // Initialize from persistent storage
  async load(): Promise<void> {
    // Read long-term-memory.md
    // Parse and reconstruct MemoryItem objects
    // Restore state
  }

  async save(): Promise<void> {
    // Write current state to long-term-memory.md
    // Ensure all memory items are persisted
  }
}
```

#### Promotion Methods

**1. Observation → Long-Term**

```typescript
async promoteToLongTerm(
  observationId: string
): Promise<{ success: boolean; reason?: string }> {
  // Validate observation exists and is pending
  // Check thresholds (count >= minCount, approval already given by user)
  // Move from observations.json to long-term-memory.md
  // Update ObservationStore to mark as promoted
  // Return result with reason if failed
}
```

**2. Long-Term → Core**

```typescript
async promoteToCore(
  memoryId: string,
  targets: ('claude_md' | 'agents_md')[]
): Promise<{ success: boolean; reason?: string }> {
  // Validate memory exists in long-term
  // Check thresholds (count >= minCount, time >= minDays)
  // Write to specified CoreMemoryAdapters
  // Update state to 'core'
  // Save updated state
  // Return result with reason if failed
}
```

#### Query Methods

```typescript
// Get all long-term memories ready for core promotion
async getPromotableToCore(): Promise<MemoryItem[]> {
  // Filter long-term memories by thresholds
  // Count >= minCount AND (now - promotedToLongTermAt) >= minDays
  // Return sorted by count descending
}

// Get all pending long-term memories (recently promoted)
async getLongTermMemories(): Promise<MemoryItem[]> {
  // Return all non-core, non-denied memories
  // Sorted by last updated time
}

// Get memory by ID
async getMemoryById(id: string): Promise<MemoryItem | undefined> {
  // Look up in long-term storage
}

// Get count of memories at each level
async getCounts(): Promise<{
  pending: number;
  longTerm: number;
  core: number;
}> {
  // Return counts for status display
}
```

#### Validation Methods

```typescript
private validateThresholdsForObservationPromotion(
  observation: Observation
): { valid: boolean; reason?: string } {
  // Check count >= minCount
  // Return validation result
}

private validateThresholdsForCorePromotion(
  memory: MemoryItem
): { valid: boolean; reason?: string } {
  // Check count >= minCount
  // Check time in long-term >= minDays
  // Return validation result
}
```

#### Helper Methods

```typescript
// Check if a memory is eligible for core promotion
isEligibleForCorePromotion(memory: MemoryItem): boolean {
  // Returns boolean based on thresholds
}

// Get days since promotion to long-term
daysSinceLongTermPromotion(memory: MemoryItem): number {
  // Calculate (now - promotedToLongTermAt) / 86400000
}

// Format memory for writing to CLAUDE.md/AGENTS.md
private formatForCoreMemory(memory: MemoryItem): string {
  // Return markdown-formatted text suitable for CLAUDE.md
  // Include observation, count, first/last seen
  // Example:
  // "## [Observation text]\n- Count: 5\n- Last seen: 2026-01-26\n"
}
```

---

## Integration Points

### With ObservationStore (003-008)

- Call `observationStore.getObservation(id)` to read observations
- Call `observationStore.markPromoted(id, 'long_term')` to update status
- Query pending observations for promotion

### With CoreMemoryAdapters (004-010, 004-011, 004-012)

- Instantiate adapters for CLAUDE.md and AGENTS.md
- Call `adapter.append(formattedContent)` to write promotions
- Handle adapter availability checking

### With TUI Components (004-013)

- Expose methods for querying promotion-ready items
- Return structured data for display
- Accept user approval/denial decisions
- Update state based on user actions

### With Storage (002-001)

- Read/write to `~/.sanj/long-term-memory.md`
- May read config for thresholds

---

## Default Promotion Thresholds

If no custom config, use these sensible defaults:

```typescript
const DEFAULT_THRESHOLDS: PromotionThresholds = {
  observationToLongTerm: {
    minCount: 2,              // Need to see it at least twice
    requiresApproval: true,   // User must approve via TUI
  },
  longTermToCore: {
    minCount: 3,              // Higher bar for core memory
    minDaysInLongTerm: 7,     // Wait a week in long-term first
    requiresApproval: true,   // User must approve via TUI
  },
};
```

---

## Error Handling

1. **Missing observation/memory**: Return error with helpful message
2. **Thresholds not met**: Return reason (e.g., "Count too low: 2/3")
3. **Adapter unavailable**: Return error about which adapter failed
4. **File write failures**: Log and return error
5. **Parsing errors**: Recover gracefully, log warning

---

## Testing

Tests should be in `tests/core/MemoryHierarchy.test.ts`.

### Test Cases

1. **Initialization**
   - Load from empty file
   - Load from file with existing memories
   - Save round-trip consistency

2. **Observation → Long-Term Promotion**
   - Successful promotion when thresholds met
   - Reject when count too low
   - Reject when not approved
   - Update state correctly

3. **Long-Term → Core Promotion**
   - Successful promotion when all thresholds met
   - Reject when count too low
   - Reject when not enough time elapsed
   - Write to correct adapters
   - Handle multi-adapter writes

4. **Querying**
   - getPromotableToCore returns correct items
   - getLongTermMemories returns all long-term items
   - getCounts returns correct counts
   - getMemoryById retrieves correct item

5. **Validation**
   - Validation methods return correct results
   - Error messages are clear

6. **Edge Cases**
   - Very old long-term memory (ready for promotion)
   - Multiple promotions of same observation
   - Denied observations (should not be promotable)
   - Writing to multiple adapters simultaneously

---

## Success Criteria

- [ ] MemoryHierarchy class created and implements all required methods
- [ ] Promotion logic enforces thresholds correctly
- [ ] State persists to `~/.sanj/long-term-memory.md`
- [ ] Can promote observations to long-term
- [ ] Can promote long-term memories to core (with adapter writing)
- [ ] Query methods return correct data structures
- [ ] Error handling covers all failure scenarios
- [ ] Unit tests cover all major paths
- [ ] Integration with ObservationStore verified
- [ ] Ready for use by TUI components (004-013)

---

## Implementation Notes

1. **Time handling**: Use ISO 8601 strings for dates in storage, Date objects in memory
2. **ID generation**: Reuse IDs from observations; consistency is critical
3. **Backwards compatibility**: If long-term-memory.md format changes, handle migration
4. **Performance**: For v1, assume small numbers of observations (< 1000)
5. **Testing**: Use mock CoreMemoryAdapters to avoid writing test data to user files

---

## Dependencies

- `src/core/types.ts` (Observation, ObservationStore types)
- `src/adapters/memory/CoreMemoryAdapter.ts` (interface for writing)
- `src/storage/paths.ts` (for paths constant)

---

## Blocks

- 004-013: PromotionList view needs MemoryHierarchy.getPromotableToCore()
- 004-015: Unit tests for MemoryHierarchy
- 005-003: Status command needs MemoryHierarchy.getCounts()

---

## Acceptance Criteria

1. Observations can be promoted to long-term memory with user approval
2. Long-term memories can be promoted to core memory with appropriate thresholds
3. Promotion logic is transparent and testable
4. State persists across runs
5. Promotion messages written to CLAUDE.md/AGENTS.md are well-formatted
6. All thresholds are configurable (currently via code, can move to config later)
