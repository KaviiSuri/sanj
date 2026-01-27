# Spec: Task 005-002 - Add pending observations count to status output

**Task ID**: 005-002
**JTBD**: 005 - Status Check
**Dependencies**: 005-001, 003-008
**Estimated Effort**: 1-2 hours
**Priority**: P1

---

## Overview

This task extends the `sanj status` command to display the count of pending observations awaiting user review. This provides users with a quick way to determine if there are unreviewed observations that require attention.

---

## Context

### Current State

- **005-001** has been completed: The status command skeleton exists and can be invoked
- **003-008** has been completed: The ObservationStore with full CRUD operations is implemented and can query pending observations

### What "Pending" Means

Pending observations are those that:
- Have been captured by the analysis engine (`sanj analyze`)
- Have not yet been approved by the user
- Have not been marked as denied/rejected
- Are waiting in the ObservationStore for user review via `sanj review`

---

## Requirements

### Functional Requirements

1. **Query Pending Observations**
   - Retrieve the count of pending observations from ObservationStore
   - A "pending" observation is one that has `status !== "approved"` and `status !== "denied"`
   - Handle the case where no observations exist (return 0)
   - Handle file system errors gracefully (missing observations file, malformed JSON)

2. **Display in Status Output**
   - Add a line to the status output showing pending observations count
   - Format: "Pending observations: X"
   - Include this alongside other status info (last analysis timestamp, long-term memory count, etc.)
   - Ensure clear, concise formatting

3. **Error Handling**
   - If observations store is missing or empty, show 0 (not an error condition)
   - If observations store is corrupted, log a warning and show 0
   - Never crash the status command due to observation store issues

4. **Status Code**
   - Command should exit with code 0 on success
   - A high pending observation count does not affect exit code (informational only)

### Non-Functional Requirements

1. **Performance**
   - Counting should be instantaneous (< 100ms)
   - Reading observations file should be efficient (avoid unnecessary parsing)
   - No LLM calls required for this task

2. **Code Quality**
   - Add type-safe count query to ObservationStore interface if needed
   - Use existing ObservationStore methods (prefer `getPending()` or similar over direct file reads)
   - Follow existing code patterns in the status command handler

3. **Testing**
   - Unit test: count() returns 0 for empty store
   - Unit test: count() returns correct number for various pending states
   - Unit test: count() handles corrupted/missing file gracefully
   - Integration test: status output includes pending count with correct formatting

---

## Design

### Architecture

```
StatusHandler (CLI layer)
  │
  └─> ObservationStore.getPending() or .count()
       │
       └─> Read observations.json
            │
            └─> Filter for pending items
                 │
                 └─> Return count
```

### Data Structure

Pending observations are stored in `~/.sanj/observations.json`:

```json
{
  "observations": [
    {
      "id": "obs-001",
      "text": "User prefers explicit error handling over try-catch when dealing with file I/O",
      "count": 3,
      "status": "pending",
      "sessionReferences": ["session-123", "session-456"],
      "createdAt": "2025-01-26T10:00:00Z",
      "lastSeen": "2025-01-26T12:30:00Z"
    },
    {
      "id": "obs-002",
      "text": "Another pattern",
      "count": 1,
      "status": "approved",
      "sessionReferences": ["session-789"],
      "createdAt": "2025-01-26T11:00:00Z",
      "lastSeen": "2025-01-26T11:00:00Z"
    }
  ]
}
```

Filtering logic:
- Count observations where `status === "pending"`
- Ignore observations where `status === "approved"` or `status === "denied"`

### Implementation Steps

1. **Verify ObservationStore has count/getPending method**
   - Check if `ObservationStore` already has a method to count pending observations
   - If not, add a simple `getPendingCount(): number` method
   - Method should handle file I/O errors gracefully

2. **Update StatusHandler**
   - Import ObservationStore (already done from 005-001)
   - Initialize ObservationStore instance
   - Call `observationStore.getPendingCount()`
   - Format output line: "Pending observations: {count}"
   - Add to status output display

3. **Update Status Output Format**
   - Example output structure:
     ```
     Sanj Status
     ============
     Pending observations: 5
     Long-term memory: 12
     Last analysis: 2025-01-26 14:30:00
     Next scheduled: 2025-01-27 20:00:00
     ```

4. **Add Tests**
   - Test `observationStore.getPendingCount()` with various scenarios
   - Test status handler formats output correctly
   - Test error handling (missing/corrupted file)

---

## Dependencies

### Code Dependencies

- **ObservationStore** (from 003-008): Must have a method to query/count pending observations
  - Method signature: `getPendingCount(): number`
  - Or: `getPending(): Observation[]` (existing method if available)

- **StatusHandler** (from 005-001): Existing status command structure

### File Dependencies

- `~/.sanj/observations.json`: The observation store file

### External Dependencies

- None (no new NPM packages required)

---

## Types & Interfaces

### ObservationStore

Ensure the ObservationStore type includes:

```typescript
class ObservationStore {
  // Existing methods
  getPending(): Observation[];
  getAll(): Observation[];

  // New method (if not already present)
  getPendingCount(): number {
    return this.getPending().length;
  }
}
```

### Observation Type

```typescript
interface Observation {
  id: string;
  text: string;
  count: number;
  status: "pending" | "approved" | "denied";
  sessionReferences: string[];
  createdAt: string;
  lastSeen: string;
}
```

---

## Testing Strategy

### Unit Tests

```typescript
describe("ObservationStore", () => {
  describe("getPendingCount()", () => {
    test("returns 0 for empty store", () => {
      const store = new ObservationStore(emptyPath);
      expect(store.getPendingCount()).toBe(0);
    });

    test("returns count of pending observations only", () => {
      const store = new ObservationStore(fixtureWithMixed);
      // Fixture has 5 pending, 2 approved, 1 denied
      expect(store.getPendingCount()).toBe(5);
    });

    test("handles missing file gracefully", () => {
      const store = new ObservationStore(nonexistentPath);
      expect(store.getPendingCount()).toBe(0);
    });

    test("handles corrupted JSON gracefully", () => {
      const store = new ObservationStore(corruptedPath);
      expect(store.getPendingCount()).toBe(0);
    });
  });
});

describe("StatusHandler", () => {
  test("displays pending observations count", async () => {
    const output = await runStatusCommand();
    expect(output).toContain("Pending observations:");
  });

  test("shows correct pending count in output", async () => {
    // Setup: 3 pending observations in store
    const output = await runStatusCommand();
    expect(output).toMatch(/Pending observations:\s+3/);
  });

  test("exits with code 0 even with many pending observations", async () => {
    const { exitCode } = await runStatusCommand();
    expect(exitCode).toBe(0);
  });
});
```

### Integration Tests

```typescript
describe("Status Command Integration", () => {
  test("status output includes all required fields", async () => {
    const output = await runStatusCommand();
    expect(output).toContain("Pending observations:");
    expect(output).toContain("Long-term memory:");
    expect(output).toContain("Last analysis:");
  });

  test("pending count updates after new observations added", async () => {
    // 1. Run status (baseline)
    let output = await runStatusCommand();
    const initialCount = extractPendingCount(output);

    // 2. Add observation
    const store = new ObservationStore();
    await store.create({
      text: "New observation",
      sessionReferences: ["test-session"]
    });

    // 3. Run status again
    output = await runStatusCommand();
    const updatedCount = extractPendingCount(output);

    expect(updatedCount).toBe(initialCount + 1);
  });
});
```

---

## Success Criteria

- [ ] ObservationStore has a reliable method to count pending observations
- [ ] StatusHandler queries pending count and formats output correctly
- [ ] Status output includes "Pending observations: X" line
- [ ] Graceful error handling (missing/corrupted file returns 0, no crash)
- [ ] Exit code is always 0 for status command
- [ ] Unit tests pass for observation counting
- [ ] Integration test shows pending count updates correctly
- [ ] No performance degradation (< 100ms to display status)

---

## Acceptance Criteria

Running `sanj status` shows:

```
Sanj Status
============
Pending observations: 5
Long-term memory: 12
Last analysis: 2025-01-26 14:30:00
Next scheduled: 2025-01-27 20:00:00
```

Where:
- "5" is the actual count of pending observations from the store
- If no observations exist, shows "0"
- If file is missing/corrupted, shows "0" with no error message
- Exit code is 0

---

## Related Docs

- **JTBD-005**: Status Check (03-jtbd.md, lines 140-161)
- **Task 005-001**: Implement status command skeleton
- **Task 003-008**: Implement ObservationStore with CRUD operations
- **HLD**: Status Check component (05-hld.md, section on StatusHandler)

---

## Notes

- This task is relatively straightforward and builds directly on 005-001 and 003-008
- The main work is adding the count/query method to ObservationStore if not already present
- Ensure consistent error handling patterns with rest of codebase
- Consider if additional status fields (ready for promotion, rejected) should also be shown in future iterations
