# Spec: Task 004-014 - Implement review command that spawns TUI process

## Overview

Implement the `sanj review` command that serves as the CLI entry point for the observation review and promotion workflow. This command spawns the OpenTUI-based interactive interface for users to approve/deny observations and promote items through the memory hierarchy.

## Context

**JTBD**: 004 - Review & Approve Observations (TUI)
**Task**: 004-014 - Implement review command that spawns TUI process
**Dependencies**: 004-013, 001-002

This task is the culmination of the TUI implementation work. All supporting components (ObservationList, PromotionList, ActionBar, MemoryHierarchy, CoreMemoryAdapters) are implemented in prior tasks. This task wires everything together through the CLI.

## Scope

### In Scope

1. Create `src/cli/commands/review.ts` that:
   - Implements the review command handler
   - Loads pending observations from ObservationStore
   - Spawns the TUI process
   - Handles TUI exit and any returned state

2. Integrate with CLERC CLI framework:
   - Register command with CLERC
   - Add help text for the command
   - Map user input to handler

3. TUI spawning:
   - Execute TUI entry point as separate process
   - Pass necessary data (observations, long-term memory) to TUI
   - Wait for TUI to complete
   - Handle TUI exit codes and errors

4. Error handling:
   - No pending observations (graceful message)
   - TUI process failures
   - File system errors when loading state

### Out of Scope

- TUI component implementation (handled in 004-004 through 004-013)
- ObservationStore implementation (handled in 003-008)
- MemoryHierarchy implementation (handled in 004-009)
- CoreMemoryAdapter implementations (handled in 004-011, 004-012)

## Implementation Details

### File Structure

```
src/cli/commands/review.ts
```

### Command Definition

**Command**: `sanj review`
**Aliases**: None
**Arguments**: None required
**Flags**: None required
**Exit Codes**:
- `0`: Success (TUI exited normally)
- `1`: Error (missing dependencies, file system error, TUI crash)

### Handler Responsibilities

The review command handler should:

1. **Load state**
   - Initialize ObservationStore
   - Query pending observations
   - Check if any observations exist
     - If none: print message "No observations pending review" and exit gracefully
     - If found: proceed to TUI

2. **Load long-term memory**
   - Load long-term-memory.md from storage
   - Check which items are ready for promotion to core memory
   - Prepare promotion candidates

3. **Spawn TUI process**
   - Execute `src/tui/index.ts` as child process
   - Pass observations and memory state (via environment variables or stdin)
   - Capture stdout/stderr

4. **Handle TUI response**
   - TUI modifies state files directly (ObservationStore, MemoryHierarchy)
   - Wait for TUI process to exit
   - Check exit code
   - If successful: show confirmation message
   - If error: show error details from stderr

5. **Cleanup**
   - Ensure child process is terminated
   - Close any open file handles

### Function Signature

```typescript
export async function review(ctx: CliContext): Promise<void>
```

Where `CliContext` is the CLERC context object containing:
- Command arguments and flags
- stdio handles
- Exit method

### Communication Pattern: TUI Spawning

The TUI spawning can use one of two approaches:

**Option A: Child Process (recommended)**
- Spawn TUI as child process using Node/Bun APIs
- TUI modifies shared state files (observations.json, long-term-memory.md)
- CLI waits for child process exit
- Simpler data passing, clear separation of concerns

**Option B: In-Process**
- Initialize TUI components directly in same process
- Pass ObservationStore and MemoryHierarchy instances
- Maintain same memory throughout
- More complex integration, but avoids subprocess overhead

Recommendation: **Option A (Child Process)** for cleaner separation.

### Error Handling

```typescript
try {
  // Load observations
  // Spawn TUI
  // Wait for completion
} catch (error) {
  if (error instanceof FileNotFoundError) {
    console.error('Error: Unable to load observations. Run "sanj analyze" first.');
    process.exit(1);
  } else if (error instanceof ChildProcessError) {
    console.error('Error: TUI process crashed.');
    console.error(error.stderr);
    process.exit(1);
  } else {
    throw error;
  }
}
```

### Dependencies

This task depends on:

1. **004-013**: PromotionList view must be complete
2. **001-002**: CLERC CLI framework must be set up
3. **003-008**: ObservationStore implementation
4. **004-009**: MemoryHierarchy for promotion logic
5. **004-011, 004-012**: CoreMemoryAdapters for writing to CLAUDE.md/AGENTS.md

### Integration Points

**With CLERC**:
```typescript
Cli()
  .command("review", "Review and approve pending observations")
  .on("review", review)
```

**With ObservationStore**:
```typescript
const store = new ObservationStore(paths.observations);
const pending = await store.getPending();
```

**With TUI**:
```typescript
const child = spawn('bun', ['src/tui/index.ts'], {
  stdio: ['ignore', 'inherit', 'pipe'],
  env: {
    ...process.env,
    SANJ_DATA_DIR: paths.sanjDir,
  }
});
```

## Acceptance Criteria

- [ ] `sanj review` command is registered in CLI
- [ ] Command loads pending observations from ObservationStore
- [ ] If no observations exist, shows helpful message and exits with code 0
- [ ] TUI process is spawned correctly
- [ ] User can interact with TUI for approve/deny/skip actions
- [ ] TUI process exits successfully and returns to CLI
- [ ] Exit code 0 on success, 1 on error
- [ ] Error messages are helpful and actionable
- [ ] No dangling child processes on normal exit
- [ ] CTRL+C in TUI properly terminates child process

## Testing Strategy

### Unit Tests

```typescript
describe('review command', () => {
  it('should print message if no observations pending', async () => {
    // Mock ObservationStore.getPending() to return empty array
    // Call review()
    // Verify output message
    // Verify exit code 0
  });

  it('should spawn TUI process if observations exist', async () => {
    // Mock ObservationStore.getPending() with sample data
    // Mock spawn() to return mock child process
    // Call review()
    // Verify spawn called with correct arguments
  });

  it('should handle TUI process error', async () => {
    // Mock spawn() to return process with error
    // Call review()
    // Verify error handling and exit code 1
  });
});
```

### Integration Test

```typescript
describe('review command integration', () => {
  it('should flow through entire review cycle', async () => {
    // Create actual test observations
    // Call review() with mock TUI process
    // Verify state changes propagate to storage
  });
});
```

### Manual Testing Checklist

- [ ] Run `sanj review` with no observations → see helpful message
- [ ] Run `sanj analyze` to create observations
- [ ] Run `sanj review` → TUI launches
- [ ] Navigate observations, approve/deny/skip
- [ ] Exit TUI → return to CLI
- [ ] Verify observations were updated in storage
- [ ] Verify promoted items moved through hierarchy

## Edge Cases

1. **No observations pending**
   - Output: "No observations pending review"
   - Exit code: 0 (not an error)

2. **Observations file corrupted**
   - Output: Error message with recovery steps
   - Exit code: 1

3. **TUI process crashes**
   - Output: Error message with stderr output
   - Exit code: 1
   - No partial state updates

4. **User CTRL+C during TUI**
   - Child process receives signal
   - CLI waits for clean termination
   - Exit code: 130 (SIGINT)

5. **TUI spawning fails (e.g., missing dependencies)**
   - Output: Error message indicating missing dependency
   - Exit code: 1

## Related Files

- `/Users/kaviisuri/code/KaviiSuri/sanj/projects/sanj-v1/src/cli/index.ts` - CLERC setup
- `/Users/kaviisuri/code/KaviiSuri/sanj/projects/sanj-v1/src/tui/index.ts` - TUI entry point
- `/Users/kaviisuri/code/KaviiSuri/sanj/projects/sanj-v1/src/core/ObservationStore.ts` - Observation state
- `/Users/kaviisuri/code/KaviiSuri/sanj/projects/sanj-v1/src/core/MemoryHierarchy.ts` - Promotion logic
- `/Users/kaviisuri/code/KaviiSuri/sanj/projects/sanj-v1/specs/jtbd-004-task-013.md` - PromotionList view

## Implementation Notes

1. **Subprocess stdio handling**: Consider whether to inherit stdio (more responsive TUI) or capture (better control)
2. **Data serialization**: If passing observations to TUI via environment variables, ensure proper JSON serialization
3. **Timeout handling**: Consider adding timeout for TUI process in case of hang
4. **Logging**: Log review command invocation for debugging cron-based analysis workflows
5. **Idempotency**: Review command can be run multiple times safely; users can skip items and review again later

## Verification

Run these commands to verify implementation:

```bash
# No observations yet
bun run cli review

# Trigger analysis
bun run cli analyze

# Now review observations
bun run cli review

# Verify state files updated
cat ~/.sanj/observations.json
cat ~/.sanj/long-term-memory.md
```

---

**Last Updated**: 2025-01-26
**Status**: Ready for Implementation
**Assignee**: TBD
