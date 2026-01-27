# Spec: Task 003-010 - Create storage/state.ts for Tracking Last Run Timestamp

## Overview

This task involves implementing a `storage/state.ts` module that manages Sanj's state file (`~/.sanj/state.json`). The module tracks:
- **Last analysis run timestamp** - When `sanj analyze` was last executed
- **Session cursors** (future) - Positions in session streams to enable incremental analysis
- **Error recovery data** - Information for resuming failed operations

This is a core component of the Session Analysis & Pattern Capture JTBD (003), enabling incremental analysis by tracking the last successful run.

---

## Dependencies

- **Blocks**: Task 003-011 (AnalysisEngine orchestration)
- **Blocks**: Task 005-004 (Status command showing last analysis timestamp)
- **Depends on**: Task 002-001 (storage/paths.ts path constants)

---

## Requirements

### 1. State File Management

**File Location**: `~/.sanj/state.json`

**Initialization**:
- Create `state.json` on first run if it doesn't exist
- Initialize with sensible defaults
- Ensure directory exists before writing

**Schema**:
```json
{
  "lastAnalysisRun": "2026-01-26T10:30:00Z",
  "sessionCursors": {
    "claude_code": "2026-01-26T10:25:00Z",
    "opencode": "2026-01-26T10:20:00Z"
  },
  "version": 1,
  "lastError": null
}
```

**Fields**:
- `lastAnalysisRun` (ISO 8601 string): Timestamp of the last complete analysis run
- `sessionCursors` (object): Per-adapter cursors for incremental analysis
  - `claude_code`: Last session timestamp processed from Claude Code
  - `opencode`: Last session timestamp processed from OpenCode
- `version` (number): State file schema version for migrations
- `lastError` (string | null): Last error message, if any, for debugging

### 2. Core Functions

#### `getState(): Promise<State>`

**Purpose**: Load current state from disk or return defaults if file doesn't exist.

**Signature**:
```typescript
export async function getState(): Promise<State>
```

**Behavior**:
- Read `~/.sanj/state.json`
- Parse JSON and return typed State object
- If file doesn't exist, return default state with current timestamp
- Validate schema version for future migrations
- Throw descriptive error if JSON is malformed

**Returns**: State object with all required fields

**Error Handling**:
- Log warning if file doesn't exist (this is normal on first run)
- Throw error if JSON is invalid (indicates corruption)

#### `setState(state: State): Promise<void>`

**Purpose**: Persist state object to disk.

**Signature**:
```typescript
export async function setState(state: State): Promise<void>
```

**Behavior**:
- Write state object to `~/.sanj/state.json`
- Use JSON format with 2-space indentation for readability
- Create parent directory if needed
- Use atomic write pattern: write to temp file, then rename

**Error Handling**:
- Throw descriptive error if write fails
- Include path in error message

#### `updateLastAnalysisRun(): Promise<void>`

**Purpose**: Update the last analysis run timestamp to now.

**Signature**:
```typescript
export async function updateLastAnalysisRun(): Promise<void>
```

**Behavior**:
- Load current state
- Set `lastAnalysisRun` to current ISO 8601 timestamp
- Persist to disk
- Clear any error state

**Usage Context**: Called by AnalysisEngine at the end of a successful analysis run

#### `getLastAnalysisRun(): Promise<Date | null>`

**Purpose**: Get the timestamp of the last analysis run.

**Signature**:
```typescript
export async function getLastAnalysisRun(): Promise<Date | null>
```

**Returns**: Date object or null if no run has occurred

**Usage Context**: Used by status command and AnalysisEngine to filter sessions

#### `updateSessionCursor(adapter: string, timestamp: Date): Promise<void>`

**Purpose**: Update the cursor for a specific session adapter.

**Signature**:
```typescript
export async function updateSessionCursor(adapter: string, timestamp: Date): Promise<void>
```

**Parameters**:
- `adapter`: SessionAdapter name (e.g., "claude_code", "opencode")
- `timestamp`: Last session timestamp processed from this adapter

**Behavior**:
- Load current state
- Update `sessionCursors[adapter]` with ISO 8601 timestamp
- Persist to disk

**Usage Context**: Called by AnalysisEngine after processing sessions from each adapter

#### `getSessionCursor(adapter: string): Promise<Date | null>`

**Purpose**: Get the last processed session timestamp for an adapter.

**Signature**:
```typescript
export async function getSessionCursor(adapter: string): Promise<Date | null>
```

**Returns**: Date object or null if no sessions have been processed yet

**Usage Context**: Used by AnalysisEngine to filter which sessions to process

#### `recordError(message: string): Promise<void>`

**Purpose**: Record an error for debugging and recovery.

**Signature**:
```typescript
export async function recordError(message: string): Promise<void>
```

**Behavior**:
- Load current state
- Set `lastError` to the provided message
- Persist to disk
- Error recording should not throw (use try-catch internally)

**Usage Context**: Called by AnalysisEngine if an error occurs during analysis

---

## Type Definitions

```typescript
interface State {
  lastAnalysisRun: string | null;  // ISO 8601 timestamp
  sessionCursors: {
    [adapterName: string]: string | null;  // ISO 8601 timestamps
  };
  version: number;
  lastError: string | null;
}

interface SessionCursor {
  adapter: string;
  timestamp: Date;
}
```

---

## Implementation Details

### Atomicity

State writes must be atomic to prevent corruption:
1. Write to `state.json.tmp`
2. Rename `state.json.tmp` → `state.json`
3. This prevents partial writes if process crashes

### Concurrency

The state file is read/written sequentially. Since Sanj runs as a cron job once per day, concurrent access is unlikely. If needed in the future, consider file locking.

### Defaults

Default state when file doesn't exist:
```typescript
{
  lastAnalysisRun: null,
  sessionCursors: {},
  version: 1,
  lastError: null
}
```

### Error Messages

Provide specific error contexts:
- "Failed to read state file: [path] - [reason]"
- "Invalid state.json format: [parsing error]"
- "Failed to write state file: [path] - [reason]"

---

## Testing Requirements

### Unit Tests

1. **getState()** - File I/O
   - Load valid state.json
   - Return defaults when file doesn't exist
   - Throw error on invalid JSON
   - Preserve state between calls

2. **setState()** - File I/O
   - Write state to disk
   - Create directory if needed
   - Format JSON with indentation
   - Use atomic write (temp file rename)

3. **updateLastAnalysisRun()** - State update
   - Update timestamp to current time
   - Clear error state
   - Persist changes

4. **getLastAnalysisRun()** - State query
   - Return Date object when run exists
   - Return null when no run has occurred
   - Parse ISO 8601 correctly

5. **updateSessionCursor()** - Cursor management
   - Create new cursor entry
   - Update existing cursor
   - Persist changes

6. **getSessionCursor()** - Cursor query
   - Return Date object when cursor exists
   - Return null when no cursor exists
   - Support multiple adapters

7. **recordError()** - Error handling
   - Store error message
   - Never throw (swallow errors internally)
   - Persist changes

### Integration Tests

- Full flow: initialize state → update run → check cursor → record error
- Verify state file format on disk
- Verify atomic writes (no partial files)

### Test Fixtures

Use temporary directory for test files (avoid modifying real ~/.sanj/):
```typescript
const tempDir = await fs.mkdtemp(...)
const statePath = path.join(tempDir, 'state.json')
```

---

## Acceptance Criteria

- [ ] `storage/state.ts` exports all required functions
- [ ] State file is created at `~/.sanj/state.json` with correct schema
- [ ] `getState()` returns typed State object with all fields
- [ ] `setState()` persists state to disk atomically
- [ ] Timestamp functions work with ISO 8601 format
- [ ] Session cursor functions support multiple adapters
- [ ] Error recording doesn't throw exceptions
- [ ] Default state is returned when file doesn't exist
- [ ] Malformed state.json throws descriptive error
- [ ] All 7 functions are type-safe and documented
- [ ] Unit tests cover all functions and edge cases
- [ ] Integration tests verify full state management flow

---

## Integration Points

### Used by Task 003-011 (AnalysisEngine)

```typescript
import {
  getState,
  updateLastAnalysisRun,
  getSessionCursor,
  updateSessionCursor,
  recordError
} from './storage/state';

// In AnalysisEngine.run():
const state = await getState();
const lastRun = state.lastAnalysisRun ? new Date(state.lastAnalysisRun) : null;

// For each session adapter:
const cursor = await getSessionCursor('claude_code');
const sessions = await adapter.getSessions(cursor);

// After processing:
await updateSessionCursor('claude_code', latestSessionTime);

// On completion:
await updateLastAnalysisRun();

// On error:
await recordError('Analysis failed: ...');
```

### Used by Task 005-004 (Status Command)

```typescript
import { getLastAnalysisRun } from './storage/state';

const lastRun = await getLastAnalysisRun();
if (lastRun) {
  console.log(`Last analysis: ${lastRun.toISOString()}`);
}
```

---

## Module Exports

```typescript
export type State;
export type SessionCursor;
export function getState(): Promise<State>;
export function setState(state: State): Promise<void>;
export function updateLastAnalysisRun(): Promise<void>;
export function getLastAnalysisRun(): Promise<Date | null>;
export function updateSessionCursor(adapter: string, timestamp: Date): Promise<void>;
export function getSessionCursor(adapter: string): Promise<Date | null>;
export function recordError(message: string): Promise<void>;
```

---

## Notes for Implementation

1. **Path Resolution**: Use the `getStatePath()` function from `storage/paths.ts` to construct `~/.sanj/state.json`

2. **Async/Await**: All file I/O is async. Use `await` consistently.

3. **Date Handling**: Use `new Date().toISOString()` for writing, `new Date(string)` for parsing

4. **Directory Creation**: Use `fs.mkdir(dir, { recursive: true })` to ensure parent directory exists

5. **Temporary Files**: For atomic writes, use a `.tmp` suffix and rename with `fs.rename()`

6. **Logging**: Use a simple logging utility (not required for v1, but helpful for debugging)

---

## Future Enhancements

- Add locking mechanism if concurrent access becomes necessary
- Add state migration logic for future schema changes
- Add metrics (session count, observation count) to state file
- Add configurable retention policy for state history
