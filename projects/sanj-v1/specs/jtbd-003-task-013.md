# Spec: 003-013 - Write Unit Tests for ObservationStore

## Task Summary

Write comprehensive unit tests for the ObservationStore class, covering CRUD operations, deduplication logic, counting, and state transitions. This task validates the core data persistence layer for observations before integration testing.

**Task ID**: 003-013
**JTBD**: 003 - Session Analysis & Pattern Capture
**Depends On**: 003-009 (ObservationStore with deduplication logic)
**Priority**: High (core testing task)

---

## Context & Motivation

ObservationStore is the central data structure for managing observations throughout their lifecycle:
- Storing new observations from analysis
- Deduplicating semantically similar observations
- Tracking observation frequency (counts)
- Recording session references and timestamps
- Transitioning observations through approval states

Since ObservationStore is critical to the analysis pipeline (task 003-011 depends on it), comprehensive unit tests ensure:
- Correctness of deduplication logic
- Proper count tracking
- Session reference tracking
- State transitions work as expected
- Edge cases are handled gracefully

---

## Implementation Details

### Test Structure

Tests will be organized in `/Users/kaviisuri/code/KaviiSuri/sanj/tests/core/ObservationStore.test.ts` with the following test suites:

#### 1. CRUD Operations
- **Create observations**: Verify new observations are stored with correct properties
- **Read observations**: Retrieve single and multiple observations by ID and filters
- **Update observations**: Modify existing observation properties (count, timestamps, state)
- **Delete observations**: Remove observations and confirm deletion
- **Query operations**: Filter by state (pending/approved/denied), count ranges, date ranges

#### 2. Deduplication & Similarity
- **Exact duplicates**: Same observation text should increment count, not create duplicate
- **Semantic similarity**: Similar observations (via mocked LLMAdapter) should deduplicate
- **Not similar**: Different observations should create separate entries
- **Similarity threshold**: Verify threshold behavior (accept/reject boundary cases)
- **Session tracking**: Each deduplication should record source session references

#### 3. Counting Logic
- **Initial count**: New observations start with count=1
- **Increment on match**: Duplicates increment existing observation count
- **Count accuracy**: Multiple additions verify cumulative counts
- **Count persistence**: Counts survive serialization/deserialization

#### 4. State Transitions
- **Pending state**: New observations start as pending
- **Mark approved**: Move observation from pending to approved (for promotion to long-term)
- **Mark denied**: Move observation from pending to denied (discard)
- **State immutability**: Cannot transition denied observations back to pending

#### 5. Session References
- **Track sources**: Each observation records which sessions generated it
- **Multiple sessions**: Same observation from different sessions should increment count and track all sessions
- **Session metadata**: Reference includes session ID, timestamp, and source tool

#### 6. Serialization/Deserialization
- **JSON round-trip**: Write observations to JSON and read back with perfect reconstruction
- **Data integrity**: No information loss during serialization
- **Format compatibility**: Serialized format matches expected storage schema

#### 7. Error Handling
- **Invalid input**: Creating observations with missing required fields should fail
- **Concurrent updates**: Multiple concurrent writes should not corrupt state
- **File system errors**: Handle gracefully if observations.json becomes unreadable
- **Type validation**: Invalid types should be rejected with clear errors

### Mock Dependencies

Tests will use a **mocked LLMAdapter** to avoid external LLM calls:

```typescript
class MockLLMAdapter implements LLMAdapter {
  name = "MockLLM";

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async extractPatterns(session: Session): Promise<Observation[]> {
    // Return predictable test data
  }

  async checkSimilarity(a: Observation, b: Observation): Promise<boolean> {
    // Control similarity outcomes in tests
  }
}
```

### Test Data

#### Sample Observations

```typescript
const observation1: Observation = {
  id: "obs-1",
  text: "Prefers TypeScript strict mode enabled",
  count: 1,
  status: "pending",
  createdAt: new Date("2025-01-20"),
  lastSeen: new Date("2025-01-20"),
  sessionReferences: [{
    sessionId: "session-123",
    toolName: "claude-code",
    timestamp: new Date("2025-01-20"),
  }],
  tags: ["preferences", "typescript"],
};

const observation2: Observation = {
  id: "obs-2",
  text: "Always uses ESLint with specific config",
  count: 2,
  status: "pending",
  createdAt: new Date("2025-01-19"),
  lastSeen: new Date("2025-01-20"),
  sessionReferences: [
    { sessionId: "session-121", toolName: "opencode", timestamp: new Date("2025-01-19") },
    { sessionId: "session-122", toolName: "opencode", timestamp: new Date("2025-01-20") },
  ],
  tags: ["linting", "tools"],
};
```

---

## Test Cases

### Suite 1: Creation & Retrieval
```
✓ Should create a new observation
✓ Should assign unique ID to new observation
✓ Should set count=1 on creation
✓ Should set status='pending' on creation
✓ Should record creation timestamp
✓ Should retrieve observation by ID
✓ Should retrieve all observations
✓ Should return empty array when no observations exist
```

### Suite 2: Deduplication
```
✓ Should deduplicate exact observation text
✓ Should not create duplicate, increment count instead
✓ Should deduplicate semantically similar observations
✓ Should respect similarity threshold
✓ Should NOT deduplicate different observations
✓ Should track session references on deduplicate
✓ Should update lastSeen timestamp on match
✓ Should not mutate original observation
```

### Suite 3: Counting
```
✓ Should start with count=1
✓ Should increment count on duplicate detection
✓ Should accumulate counts correctly over multiple additions
✓ Should maintain count accuracy after serialization
✓ Should track count per observation independently
```

### Suite 4: Filtering
```
✓ Should filter observations by status='pending'
✓ Should filter observations by status='approved'
✓ Should filter observations by status='denied'
✓ Should filter by count range (min, max)
✓ Should filter by date range (createdAt)
✓ Should filter by tags
✓ Should combine multiple filters (AND logic)
```

### Suite 5: State Transitions
```
✓ Should mark observation as approved
✓ Should mark observation as denied
✓ Should not allow transition from denied to pending
✓ Should not allow transition from approved to denied
✓ Should update timestamps on state change
```

### Suite 6: Session References
```
✓ Should track single session reference
✓ Should track multiple session references
✓ Should avoid duplicate session references for same session
✓ Should update lastSeen when same session appears again
✓ Should serialize session references correctly
```

### Suite 7: Serialization
```
✓ Should serialize observation to JSON
✓ Should deserialize observation from JSON
✓ Should maintain data integrity through round-trip
✓ Should handle dates correctly (ISO format)
✓ Should handle nested objects (sessionReferences, tags)
```

### Suite 8: Error Handling
```
✓ Should reject observation with missing text
✓ Should reject observation with missing required fields
✓ Should throw on invalid observation ID format
✓ Should handle file system read errors gracefully
✓ Should handle concurrent write attempts
✓ Should provide descriptive error messages
```

### Suite 9: Edge Cases
```
✓ Should handle very long observation text (>10000 chars)
✓ Should handle special characters in observation text
✓ Should handle empty sessionReferences array
✓ Should handle null/undefined gracefully in updates
✓ Should handle simultaneous operations correctly
```

---

## Testing Approach

### Using Bun Test Runner

Tests will use Bun's built-in test runner for speed and simplicity:

```bash
bun test tests/core/ObservationStore.test.ts
bun test tests/core/  # Run all core tests
```

### Mock LLM Integration

The ObservationStore deduplication method will be tested with:

```typescript
describe("ObservationStore with mocked LLMAdapter", () => {
  let store: ObservationStore;
  let mockLLM: MockLLMAdapter;

  beforeEach(async () => {
    mockLLM = new MockLLMAdapter();
    store = new ObservationStore(tempDir, mockLLM);
    await store.initialize();
  });

  afterEach(async () => {
    await cleanup(tempDir);
  });

  test("should deduplicate observations", async () => {
    // Test logic here
  });
});
```

### File System Isolation

Each test will use a temporary directory to avoid conflicts:

```typescript
const tempDir = await createTempDir();
const store = new ObservationStore(tempDir, mockLLM);
// ... test code ...
await cleanup(tempDir);
```

---

## Acceptance Criteria

- [ ] All CRUD operations have passing tests
- [ ] Deduplication logic is thoroughly tested (exact and semantic)
- [ ] Counting logic is verified correct across multiple scenarios
- [ ] State transitions work as designed
- [ ] Session reference tracking is complete
- [ ] Serialization/deserialization round-trips preserve data
- [ ] Error cases are handled with descriptive error messages
- [ ] Tests use mocked LLMAdapter (no external calls)
- [ ] Tests use isolated file system (temporary directories)
- [ ] All tests pass with Bun test runner
- [ ] Test coverage for ObservationStore is >90%
- [ ] Tests run in <5 seconds total
- [ ] No flaky tests (deterministic)

---

## Dependencies & Mocking

### Real Dependencies Used
- **Bun test runner**: Built-in, no additional setup
- **TypeScript**: Already required by project
- **Temporary file utilities**: Bun.file() or node:fs for test isolation

### Mocked Dependencies
- **LLMAdapter**: MockLLMAdapter with configurable similarity responses
- **File system (partially)**: Use temp directories instead of ~/.sanj/

### No Dependencies On
- **Claude Code/OpenCode**: Not needed for unit tests
- **External LLM services**: Mocked completely
- **CLERC or CLI**: These are integration concerns

---

## Success Metrics

1. **Test Coverage**: ≥90% code coverage for ObservationStore.ts
2. **Execution Speed**: All tests complete in <5 seconds
3. **Determinism**: 100% pass rate on repeated runs (no flaky tests)
4. **Clarity**: Each test has clear name describing what is tested
5. **Documentation**: Comment on complex test scenarios
6. **Maintenance**: Tests should be easy to modify as ObservationStore evolves

---

## Notes & Considerations

### Mock LLM Behavior
Control similarity checks via test configuration:
```typescript
mockLLM.setSimilarityResult("obs-1", "obs-2", true); // Make them similar
mockLLM.setSimilarityResult("obs-3", "obs-4", false); // Make them different
```

### Async Testing
ObservationStore operations are async. Use Bun's native async/await support:
```typescript
test("async operation", async () => {
  await store.createObservation(obs);
  const retrieved = await store.getObservation("id");
  expect(retrieved).toBeDefined();
});
```

### State File Isolation
Each test gets its own temp directory to avoid state pollution:
```typescript
const tempDir = await mkdtemp(join(tmpdir(), "sanj-test-"));
```

### Snapshot Testing (Optional)
Consider snapshot tests for serialized JSON format to catch unintended changes:
```typescript
test("observation serialization format", () => {
  const json = JSON.stringify(observation);
  expect(json).toMatchSnapshot();
});
```

---

## Files & Locations

| File | Purpose |
|------|---------|
| `/Users/kaviisuri/code/KaviiSuri/sanj/tests/core/ObservationStore.test.ts` | Main test file |
| `/Users/kaviisuri/code/KaviiSuri/sanj/tests/fixtures/observations.fixtures.ts` | Test data |
| `/Users/kaviisuri/code/KaviiSuri/sanj/tests/mocks/MockLLMAdapter.ts` | Mock implementation |
| `/Users/kaviisuri/code/KaviiSuri/sanj/src/core/ObservationStore.ts` | Code under test |

---

## Deliverable

**Output**: Fully passing test suite with:
- Comprehensive test file: `tests/core/ObservationStore.test.ts`
- Mock adapter: `tests/mocks/MockLLMAdapter.ts`
- Test fixtures: `tests/fixtures/observations.fixtures.ts`
- All tests passing: `bun test` shows green checkmarks
- Coverage report shows >90% for ObservationStore.ts
