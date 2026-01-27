# Specification: Task 003-011
## Implement AnalysisEngine Orchestrating the Full Flow

**JTBD**: 003 - Session Analysis & Pattern Capture
**Task ID**: 003-011
**Status**: Pending
**Depends On**: 003-003, 003-004, 003-009, 003-010
**Blocks**: 003-012, 003-014

---

## Overview

The AnalysisEngine is the orchestrator component that brings together all the pieces of the session analysis workflow. It coordinates reading sessions from multiple adapters, extracting patterns using the LLM adapter, deduplicating observations, and managing run state. This task implements the core logic that powers the `sanj analyze` command.

---

## Requirements

### 1. Core Responsibilities

The AnalysisEngine must:

1. **Load Configuration**
   - Read `~/.sanj/config.json`
   - Determine which SessionAdapters are enabled
   - Determine which LLMAdapter is configured
   - Access adapter settings (model name, etc.)

2. **Session Ingestion**
   - Get list of enabled SessionAdapters
   - For each adapter, check `isAvailable()`
   - Call `getSessions(since: Date)` passing the last analysis timestamp
   - Collect all sessions from all adapters into a single list
   - Handle cases where sessions are empty or unavailable gracefully

3. **Pattern Extraction**
   - For each session, call `LLMAdapter.extractPatterns(session)`
   - LLM returns list of candidate observations
   - Handle LLM failures gracefully (skip session, log error, continue)
   - Preserve session metadata for traceability

4. **Observation Deduplication & Storage**
   - For each candidate observation from LLM:
     - Pass to `ObservationStore.addOrUpdate(candidate)`
     - Store handles similarity checking via LLMAdapter
     - Bump count if similar to existing
     - Create new observation if truly novel

5. **State Management**
   - Update `lastAnalysisRun` timestamp in state.json
   - Track how many sessions were processed
   - Track how many observations were created/updated
   - Log analysis results for debugging

### 2. Implementation Details

#### Class Definition

```typescript
class AnalysisEngine {
  private config: Config;
  private sessionAdapters: SessionAdapter[];
  private llmAdapter: LLMAdapter;
  private observationStore: ObservationStore;
  private state: State;

  constructor(
    config: Config,
    sessionAdapters: SessionAdapter[],
    llmAdapter: LLMAdapter,
    observationStore: ObservationStore,
    state: State
  );

  async run(): Promise<AnalysisResult>;
}
```

#### Main Method: `run()`

**Signature**:
```typescript
async run(): Promise<AnalysisResult>
```

**Algorithm**:
```
1. Get last analysis timestamp from state
2. Load list of enabled SessionAdapters from config
3. For each enabled adapter:
   a. Check if available via isAvailable()
   b. If not available, log warning and skip
   c. If available, call getSessions(since: lastAnalysisRun)
   d. Append returned sessions to global list
4. Log "Processing N sessions from M adapters"
5. For each session:
   a. Try to extract patterns via LLMAdapter.extractPatterns(session)
   b. On success:
      - Add session to processed count
      - For each extracted observation:
        - Store in ObservationStore.addOrUpdate(observation)
        - Track update type (new vs. bumped)
   c. On LLM error:
      - Log error with session ID
      - Continue to next session
      - Track failed count
6. Update state.lastAnalysisRun = now()
7. Return AnalysisResult with counts and status
```

#### Return Type: `AnalysisResult`

```typescript
interface AnalysisResult {
  status: 'success' | 'partial_failure' | 'failure';
  sessionsProcessed: number;
  sessionsFailed: number;
  observationsCreated: number;
  observationsBumped: number;
  startTime: Date;
  endTime: Date;
  durationMs: number;
  errors: AnalysisError[];
}

interface AnalysisError {
  sessionId: string;
  adapter: string;
  reason: string;
}
```

### 3. Error Handling

The AnalysisEngine should be resilient:

- **Missing or empty sessions**: Log and continue (not an error)
- **Adapter unavailable**: Log warning and skip that adapter
- **LLM extraction failure**: Log error with session ID, continue with next session
- **ObservationStore write failure**: Log error, mark as failure, continue
- **Config read failure**: Fail hard (can't run without config)
- **State read/write failure**: Log warning, continue with current timestamp

Status rules:
- `success`: All sessions processed, no errors
- `partial_failure`: Some sessions failed, but at least one succeeded
- `failure`: All sessions failed or config error

### 4. Logging

All significant events should be logged to help users debug:

```
[sanj] Starting analysis...
[sanj] Config loaded: 2 session adapters, OpenCode LLM
[sanj] Loading sessions since 2025-01-23 10:30:00...
[sanj] Found 5 sessions (ClaudeCode: 3, OpenCode: 2)
[sanj] Processing session: claude-project/session-123
[sanj] Extracted 4 patterns from session-123
[sanj] Observation "prefer TypeScript strict mode" is similar to existing, bumped count
[sanj] Observation "use ESM imports" is new
[sanj] Processing session: opencode-xyz/session-456
[sanj] LLM error processing session-456: timeout (skipping)
[sanj] Analysis complete: 2 created, 3 bumped, 1 failed
[sanj] Last run updated: 2025-01-23 14:45:00
```

### 5. Dependencies

- **Config**: Read enabled adapters, LLM settings
- **SessionAdapters**: Interface, instance of each enabled adapter
- **LLMAdapter**: Single instance, configured in constructor
- **ObservationStore**: Instance for storing/updating observations
- **State**: For lastAnalysisRun timestamp management

All injected via constructor (allows testing with mocks).

### 6. File Location

Implementation should be at: `/src/core/AnalysisEngine.ts`

Export: `export class AnalysisEngine`

### 7. Testing Considerations

While 003-014 handles actual tests, this spec should enable:

- Unit tests with mock adapters
- Mock SessionAdapters that return fixed sessions
- Mock LLMAdapter with controlled pattern extraction
- Mock ObservationStore to track calls
- Test success path (all sessions processed)
- Test partial failure (some adapters unavailable)
- Test LLM errors (one session fails, others succeed)
- Test deduplication flow
- Test state update

---

## Acceptance Criteria

- [ ] AnalysisEngine class exists at `/src/core/AnalysisEngine.ts`
- [ ] Constructor accepts config, sessionAdapters array, llmAdapter, observationStore, state
- [ ] `run()` method orchestrates the full analysis flow
- [ ] Sessions are read from all enabled adapters using `getSessions(since: lastAnalysisRun)`
- [ ] Adapter availability is checked before reading sessions
- [ ] LLM pattern extraction is called for each session
- [ ] Extracted observations are passed to ObservationStore.addOrUpdate()
- [ ] Errors in LLM extraction are logged and don't crash the engine
- [ ] AnalysisResult includes session counts, observation counts, timing, and errors
- [ ] lastAnalysisRun timestamp is updated after successful run
- [ ] Comprehensive logging for debugging analysis flow
- [ ] All public methods/interfaces are exported
- [ ] TypeScript compilation succeeds with no errors
- [ ] Can be imported and instantiated by 003-012 (analyze command)

---

## Dependencies Detailed

### From 003-003: ClaudeCodeSessionAdapter
- Provides `SessionAdapter` implementation for Claude Code sessions
- AnalysisEngine will instantiate this if enabled in config
- Must be available before AnalysisEngine can be tested with real adapters

### From 003-004: OpenCodeSessionAdapter
- Provides `SessionAdapter` implementation for OpenCode sessions
- AnalysisEngine will instantiate this if enabled in config
- Must be available before AnalysisEngine can be tested with real adapters

### From 003-009: ObservationStore with Deduplication
- Provides `ObservationStore.addOrUpdate(observation)` method
- Includes similarity checking and count bumping logic
- AnalysisEngine calls this for every extracted observation
- Must handle both new and update cases transparently

### From 003-010: storage/state.ts
- Provides `State` class/interface for managing lastAnalysisRun
- AnalysisEngine queries `state.getLastAnalysisRun()`
- AnalysisEngine calls `state.setLastAnalysisRun(timestamp)`
- Must persist to `~/.sanj/state.json` after each run

---

## Integration Points

### With 003-012 (analyze command)
The analyze command will:
1. Load config
2. Instantiate all enabled SessionAdapters
3. Instantiate LLMAdapter
4. Load ObservationStore
5. Load State
6. Instantiate AnalysisEngine with these dependencies
7. Call `engine.run()`
8. Handle AnalysisResult (log, exit code, etc.)

### With 003-014 (AnalysisEngine tests)
- Tests will use mock adapters and stores
- Tests will verify run() behavior in various scenarios
- Tests will check AnalysisResult format and counts

---

## Notes

- AnalysisEngine should be agnostic to storage details (adapters handle that)
- It coordinates but doesn't execute; delegates to adapters and store
- Designed to run non-interactively (suitable for cron)
- No user prompts or interactive input
- All LLM calls should have reasonable timeouts (inherit from LLMAdapter config)
- Session filtering by timestamp should be inclusive (>= lastAnalysisRun)
