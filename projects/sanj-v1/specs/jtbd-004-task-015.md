# Spec: Write Unit Tests for MemoryHierarchy

**Task ID**: 004-015
**JTBD**: 004 - Review & Approve Observations (TUI)
**Depends On**: 004-009 (Implement MemoryHierarchy)
**Status**: Pending

---

## Overview

This task involves writing comprehensive unit tests for the `MemoryHierarchy` class to ensure the promotion logic between memory levels works correctly. The MemoryHierarchy manages three distinct memory levels and validates the transitions between them.

---

## Context

### What is MemoryHierarchy?

The `MemoryHierarchy` class (implemented in task 004-009) is responsible for:
- Managing promotion of observations through three memory levels:
  1. **Observations** (pending) → stored in `observations.json`
  2. **Long-Term Memory** → stored in `long-term-memory.md`
  3. **Core Memory** → written to `CLAUDE.md` / `AGENTS.md`

- Applying promotion thresholds:
  - **Observation → Long-Term**: User approval in TUI
  - **Long-Term → Core**: Count threshold + time threshold + user approval

- Tracking metadata: counts, first-seen timestamps, last-seen timestamps, source sessions

### Why Test This?

The promotion logic is critical to Sanj's value proposition. Incorrect promotion could:
- Elevate noise to core memory files
- Miss important patterns due to strict thresholds
- Lose information due to improper state transitions
- Corrupt user's memory files with malformed content

Testing ensures this logic is deterministic, handles edge cases, and maintains data integrity.

---

## Success Criteria

### Functional Requirements

1. **Observation → Long-Term Promotion**
   - Can promote an approved observation to long-term memory
   - Observation is marked as promoted (not re-processed)
   - Long-term memory entry includes original text, count, timestamps, session references
   - Duplicate promotions are prevented

2. **Long-Term → Core Promotion**
   - Can only promote memories meeting both thresholds:
     - Count >= configured threshold (default: 3)
     - Time in long-term >= configured duration (default: 7 days)
   - Promotion requires explicit user approval
   - Formatted content is prepared correctly for target adapters (CLAUDE.md vs AGENTS.md)
   - Promoted memory is marked to prevent re-promotion

3. **Status Queries**
   - Can list promotable observations (approved but not yet long-term)
   - Can list promotable long-term memories (meeting thresholds)
   - Can check promotion eligibility with reason explanations

4. **Edge Cases**
   - Handle observations with zero count gracefully
   - Handle memories with missing timestamps
   - Prevent promotion of denied/rejected observations
   - Prevent circular promotions (observation promoted twice)

5. **Data Integrity**
   - All state changes are persisted to disk
   - Promotion metadata is accurate and verifiable
   - Rollback capability in case of adapter failures

### Test Coverage

1. **Unit Tests** (isolated, no file I/O)
   - Promotion eligibility checks
   - Threshold calculations
   - State transition logic
   - Error handling for invalid inputs

2. **Integration Tests** (with mock storage)
   - Full promotion workflow from observation → long-term → core
   - Storage persistence and retrieval
   - Interaction with ObservationStore
   - Interaction with CoreMemoryAdapters

3. **Error Scenarios**
   - Storage failures during promotion
   - Invalid observation/memory objects
   - Missing required fields
   - Concurrent access (if applicable)

---

## Test Structure

### Test File Location
`/src/tests/core/MemoryHierarchy.test.ts`

### Test Framework
- **Runner**: Bun's built-in test runner
- **Assertions**: Bun's built-in test assertion library (or import Chai if preferred)
- **Mocking**: Manual mock implementations (no external mocking library)

### Mock Dependencies

1. **MockObservationStore**
   - Stores observations in-memory
   - Implements CRUD operations
   - No file system access

2. **MockCoreMemoryAdapters**
   - MockClaudeMdAdapter: records writes without touching filesystem
   - MockAgentsMdAdapter: records writes without touching filesystem

3. **MockTimeProvider** (optional)
   - Allows tests to manipulate timestamps
   - Simulate time passing (e.g., 7 days)

---

## Test Cases

### Category 1: Observation → Long-Term Promotion

| Test Name | Input | Expected Output | Notes |
|-----------|-------|-----------------|-------|
| `test_promote_approved_observation_to_longterm` | Approved observation | Observation moved to long-term; original removed from pending | Happy path |
| `test_promote_observation_creates_longterm_metadata` | Approved observation with count=5 | Long-term entry has count, timestamps, session refs | Metadata preservation |
| `test_prevent_duplicate_promotion_of_same_observation` | Try promoting same observation twice | Second attempt rejected with error | Idempotency |
| `test_deny_observation_prevents_promotion` | Denied observation | Cannot be promoted to long-term | State validation |
| `test_promote_observation_with_missing_fields` | Observation missing ID | Throws error with helpful message | Error handling |

### Category 2: Long-Term → Core Promotion

| Test Name | Input | Expected Output | Notes |
|-----------|-------|-----------------|-------|
| `test_promote_eligible_memory_to_core` | Memory with count=5, 8 days old | Promoted to core memory | Happy path |
| `test_prevent_promotion_below_count_threshold` | Memory with count=2, threshold=3 | Blocked; reason shows "count too low" | Threshold validation |
| `test_prevent_promotion_below_time_threshold` | Memory with count=5, 3 days old | Blocked; reason shows "not enough time passed" | Time validation |
| `test_promote_memory_meets_both_thresholds` | Memory: count=3, 7 days old | Promoted when thresholds are exactly met | Boundary condition |
| `test_core_promotion_formats_for_adapter` | Memory for CLAUDE.md | Formatted with metadata header and content | Adapter-specific formatting |
| `test_prevent_double_promotion_to_core` | Try promoting same memory twice | Second attempt rejected | Idempotency |

### Category 3: Status Queries

| Test Name | Input | Expected Output | Notes |
|-----------|-------|-----------------|-------|
| `test_list_promotable_observations` | Mix of approved/denied/pending | Returns only approved observations | Filtering logic |
| `test_list_promotable_longterm_memories` | Mix of eligible/ineligible memories | Returns only those meeting both thresholds | Threshold filtering |
| `test_get_promotion_status_with_reasons` | Ineligible memory | Returns status + reasons for ineligibility | User feedback |
| `test_empty_promotable_lists` | No eligible items | Returns empty list without errors | Edge case |

### Category 4: Configuration & Thresholds

| Test Name | Input | Expected Output | Notes |
|-----------|-------|-----------------|-------|
| `test_use_custom_count_threshold` | threshold=5, memory count=4 | Blocked by count | Config respected |
| `test_use_custom_time_threshold` | threshold=14 days, memory age=10 days | Blocked by time | Config respected |
| `test_invalid_threshold_values` | threshold=-1 | Throws error during init | Validation |

### Category 5: Edge Cases & Error Handling

| Test Name | Input | Expected Output | Notes |
|-----------|-------|-----------------|-------|
| `test_promotion_with_zero_count` | Observation with count=0 | Rejected with error | Data validation |
| `test_promotion_with_missing_timestamp` | Memory missing created_at | Handled gracefully or error | Robustness |
| `test_promotion_with_empty_session_refs` | Observation with empty session references | Still promotable if count/time OK | Partial data |
| `test_adapter_failure_during_promotion` | CoreMemoryAdapter.append throws error | Transaction rolled back; state unchanged | Failure recovery |
| `test_concurrent_promotions` | Multiple promotions in quick succession | All handled correctly; no race conditions | Thread safety (if applicable) |

---

## Implementation Guidance

### Test File Template

```typescript
import { describe, it, expect } from "bun:test";
import { MemoryHierarchy } from "src/core/MemoryHierarchy";
import { Observation, LongTermMemory } from "src/core/types";
import { MockObservationStore } from "./mocks/MockObservationStore";
import { MockClaudeMdAdapter } from "./mocks/MockClaudeMdAdapter";

describe("MemoryHierarchy", () => {
  let hierarchy: MemoryHierarchy;
  let mockStore: MockObservationStore;
  let mockAdapter: MockClaudeMdAdapter;

  beforeEach(() => {
    mockStore = new MockObservationStore();
    mockAdapter = new MockClaudeMdAdapter();
    hierarchy = new MemoryHierarchy({
      observationStore: mockStore,
      coreMemoryAdapters: [mockAdapter],
      countThreshold: 3,
      timeThresholdDays: 7,
    });
  });

  describe("Observation → Long-Term Promotion", () => {
    it("should promote approved observation to long-term memory", () => {
      // Test code
    });
    // ... more tests
  });

  describe("Long-Term → Core Promotion", () => {
    // ... tests
  });

  // ... more describe blocks
});
```

### Mock Implementation Notes

Each mock should be minimal but realistic:
- **MockObservationStore**: In-memory map of observations
- **MockCoreMemoryAdapters**: Track method calls and written content
- **TimeProvider**: Allow setting current time for threshold tests

---

## Acceptance Criteria

1. All test cases listed above have implementations with passing tests
2. Code coverage for `MemoryHierarchy.ts` >= 85%
3. All edge cases are tested
4. Tests are isolated (no shared state between tests)
5. Test names clearly describe what is being tested
6. Mock implementations are documented
7. Test file includes comments for complex assertions
8. Tests run in < 100ms total

---

## Related Files

- **Implementation**: `/src/core/MemoryHierarchy.ts` (task 004-009)
- **Types**: `/src/core/types.ts` (task 003-001)
- **ObservationStore**: `/src/core/ObservationStore.ts` (task 003-008)
- **CoreMemoryAdapter**: `/src/adapters/memory/CoreMemoryAdapter.ts` (task 004-010)
- **Other tests**: `/src/tests/core/ObservationStore.test.ts` (task 003-013)

---

## Notes

- This task unblocks no other tasks
- It is blocked by task 004-009 (MemoryHierarchy implementation)
- Tests should be deterministic and not depend on system time (use mocks)
- Consider parameterized tests for threshold variations to reduce duplication
- If using Bun's test runner, ensure proper beforeEach/afterEach cleanup
