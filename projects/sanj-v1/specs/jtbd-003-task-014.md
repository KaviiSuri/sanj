# Task 003-014: Write unit tests for AnalysisEngine with mock adapters

## Overview

Write comprehensive unit tests for the `AnalysisEngine` class to verify the core orchestration logic of the session analysis flow. Tests must use mock implementations of `SessionAdapter`, `LLMAdapter`, and `ObservationStore` to isolate AnalysisEngine behavior.

## JTBD Context

- **JTBD**: 003 - Session Analysis & Pattern Capture
- **Related Task**: 003-011 (Implement AnalysisEngine)
- **Dependency**: 003-011

## Acceptance Criteria

### Test Coverage
- [ ] Tests verify AnalysisEngine initialization with configuration
- [ ] Tests verify session fetching from all enabled adapters
- [ ] Tests verify filtering of sessions by last analysis timestamp
- [ ] Tests verify LLM pattern extraction is called for each session
- [ ] Tests verify extracted observations are passed to ObservationStore
- [ ] Tests verify state.json is updated with last run timestamp
- [ ] Tests verify error handling when adapters are unavailable
- [ ] Tests verify error handling when LLM calls fail
- [ ] Tests verify correct exit codes and status reporting
- [ ] Tests verify logging of session counts and observation counts

### Mock Implementations
- [ ] MockSessionAdapter that returns configurable test sessions
- [ ] MockLLMAdapter that returns predictable observations
- [ ] MockObservationStore that tracks all method calls
- [ ] MockFileSystem (or temp directories) for state persistence testing

### Test Organization
- [ ] All tests in `tests/core/AnalysisEngine.test.ts`
- [ ] Use Bun's built-in test runner with `describe()` and `it()` blocks
- [ ] Clear test names describing behavior being verified
- [ ] Setup and teardown fixtures for mock data

### Edge Cases & Error Handling
- [ ] No sessions available (empty results from all adapters)
- [ ] Single adapter available, others unavailable
- [ ] Session with no extractable patterns (empty observations from LLM)
- [ ] Duplicate patterns across multiple sessions (deduplication flow)
- [ ] LLM adapter timeout or network failure
- [ ] SessionAdapter returns sessions but LLM processing fails partway through
- [ ] State file is corrupted or missing on first run

### Test Data & Fixtures
- [ ] Sample session objects matching Session type definition
- [ ] Sample observation objects with various fields
- [ ] Test configuration with different adapter combinations
- [ ] Realistic timestamps and session metadata

## Implementation Guidance

### Mock Adapter Patterns

#### MockSessionAdapter
```typescript
class MockSessionAdapter implements SessionAdapter {
  name = "mock-session";
  sessions: Session[];
  availableFlag = true;

  constructor(sessions: Session[] = []) {
    this.sessions = sessions;
  }

  async isAvailable(): Promise<boolean> {
    return this.availableFlag;
  }

  async getSessions(since?: Date): Promise<Session[]> {
    if (!since) return this.sessions;
    return this.sessions.filter(s => new Date(s.timestamp) > since);
  }

  setAvailable(available: boolean): void {
    this.availableFlag = available;
  }
}
```

#### MockLLMAdapter
```typescript
class MockLLMAdapter implements LLMAdapter {
  name = "mock-llm";
  observations: Observation[];
  callCount = 0;

  constructor(observations: Observation[] = []) {
    this.observations = observations;
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async extractPatterns(session: Session): Promise<Observation[]> {
    this.callCount++;
    return this.observations;
  }

  async checkSimilarity(a: Observation, b: Observation): Promise<boolean> {
    return a.id === b.id;
  }

  getCallCount(): number {
    return this.callCount;
  }
}
```

#### MockObservationStore
```typescript
class MockObservationStore implements ObservationStore {
  addCalls: Observation[] = [];
  findSimilarCalls: Observation[] = [];
  updateCountCalls: string[] = [];

  async add(observation: Observation): Promise<void> {
    this.addCalls.push(observation);
  }

  async findSimilar(observation: Observation): Promise<Observation | null> {
    this.findSimilarCalls.push(observation);
    return null; // For testing, return no matches
  }

  async updateCount(id: string): Promise<void> {
    this.updateCountCalls.push(id);
  }

  // ... other methods
}
```

### Test Structure

```typescript
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { AnalysisEngine } from "../../src/core/AnalysisEngine";
import { MockSessionAdapter, MockLLMAdapter, MockObservationStore } from "./fixtures";

describe("AnalysisEngine", () => {
  let engine: AnalysisEngine;
  let mockSessionAdapter: MockSessionAdapter;
  let mockLLMAdapter: MockLLMAdapter;
  let mockObservationStore: MockObservationStore;

  beforeEach(() => {
    // Initialize mocks and engine
  });

  afterEach(() => {
    // Cleanup
  });

  describe("initialization", () => {
    it("should accept adapters and configuration", () => {
      // Test setup with valid config
    });
  });

  describe("analysis flow", () => {
    it("should fetch sessions from all enabled adapters", async () => {
      // Test that all adapter.getSessions() are called
    });

    it("should filter sessions by last run timestamp", async () => {
      // Test that sessions before last run are excluded
    });

    it("should extract patterns for each session", async () => {
      // Test that LLMAdapter.extractPatterns is called per session
    });

    it("should store observations in the store", async () => {
      // Test that observations are added to store
    });

    it("should update state with last run timestamp", async () => {
      // Test that state.json is written with new timestamp
    });
  });

  describe("error handling", () => {
    it("should handle unavailable session adapters gracefully", async () => {
      // Test that missing adapters don't block analysis
    });

    it("should propagate LLM adapter errors", async () => {
      // Test error from LLM is caught and reported
    });
  });
});
```

## Specification Details

### AnalysisEngine.run() Method

The core method being tested should:

1. **Load Configuration**
   - Get enabled SessionAdapters from config
   - Get enabled LLMAdapter from config
   - Get last run timestamp from state.json

2. **Session Collection**
   - For each enabled SessionAdapter:
     - Call `isAvailable()` to check if it can be used
     - Call `getSessions(since: Date)` to fetch new sessions
     - Filter out sessions already seen (track in state)

3. **Pattern Extraction**
   - For each collected session:
     - Call `LLMAdapter.extractPatterns(session)`
     - Receive array of candidate observations

4. **Observation Processing**
   - For each candidate observation:
     - Call `ObservationStore.findSimilar(candidate)`
     - If similar found: call `ObservationStore.updateCount(id)`
     - If new: call `ObservationStore.add(candidate)`
     - Track session reference in observation metadata

5. **State Update**
   - Write current timestamp to state.lastAnalysisRun
   - Write processed session IDs to state.processedSessions (to avoid re-processing)

6. **Return Status**
   - Return object with: sessionsProcessed, observationsCreated, observationsUpdated, errors

### Key Testing Scenarios

#### Scenario 1: Happy Path - Single Session, Single Pattern
- Setup: One MockSessionAdapter with one session
- MockLLMAdapter returns one observation
- Expected: ObservationStore.add() called once, state updated

#### Scenario 2: Multiple Sessions, Deduplication
- Setup: Two sessions with overlapping patterns
- MockLLMAdapter returns similar observations both times
- Expected: First call creates observation, second calls updateCount()

#### Scenario 3: Mixed Adapter Availability
- Setup: Two SessionAdapters, one unavailable
- Expected: Available adapter is processed, unavailable is skipped with warning

#### Scenario 4: Empty Sessions
- Setup: All SessionAdapters return empty arrays
- Expected: Analysis completes successfully with 0 observations

#### Scenario 5: LLM Failure Mid-Analysis
- Setup: First session processes fine, second fails
- Expected: Error logged, first observation stored, second session skipped

#### Scenario 6: State File Missing
- Setup: state.json doesn't exist (first run)
- Expected: Analysis runs on all sessions, state created with current timestamp

## Test File Location

`/Users/kaviisuri/code/KaviiSuri/sanj/tests/core/AnalysisEngine.test.ts`

## Test Dependencies

- `AnalysisEngine` from `src/core/AnalysisEngine.ts` (task 003-011)
- `SessionAdapter` interface from `src/adapters/session/SessionAdapter.ts` (task 003-002)
- `LLMAdapter` interface from `src/adapters/llm/LLMAdapter.ts` (task 003-005)
- `ObservationStore` from `src/core/ObservationStore.ts` (task 003-008)
- `Session` and `Observation` types from `src/core/types.ts` (task 003-001)

## Related Files

- Tests for `ObservationStore`: task 003-013
- Tests for `MemoryHierarchy`: task 004-015
- Integration tests for full `analyze` command: future scope

## Success Metrics

- All test cases pass
- Code coverage > 90% for AnalysisEngine.ts
- Tests run in < 1 second (using Bun test runner)
- Error scenarios are covered with meaningful assertions
- Mock implementations are reusable for other test files

## Notes

- Use TypeScript strict mode to catch type errors early
- Mocks should be in `tests/fixtures/` for reusability across test files
- Consider creating a test helper factory for common mock configurations
- Document any assumptions about adapter behavior in test comments
