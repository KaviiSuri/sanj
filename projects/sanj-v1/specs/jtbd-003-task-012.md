# Spec: Task 003-012 - Implement analyze Command Wiring AnalysisEngine

**JTBD**: 003 - Session Analysis & Pattern Capture
**Task ID**: 003-012
**Dependencies**: 003-011 (AnalysisEngine), 001-002 (CLI foundation)
**Estimated Effort**: Medium (4-6 hours)

---

## Overview

This task implements the `sanj analyze` command that serves as the CLI entry point for running session analysis. The command wires together the AnalysisEngine with the CLI framework to enable non-interactive pattern extraction from coding sessions.

The `analyze` command is designed to be called either manually by the user or automatically by cron jobs, making it the core driver of Sanj's value proposition.

---

## Objectives

1. Create the analyze command handler that receives and validates CLI input
2. Wire the AnalysisEngine into the analyze command handler
3. Implement proper error handling and logging for analysis runs
4. Ensure the command works silently for cron job execution
5. Provide clear feedback to the user on analysis results
6. Update state tracking with the last analysis run timestamp

---

## Requirements

### Functional Requirements

#### 1. Command Implementation
- Create `src/cli/commands/analyze.ts` file
- Implement handler function that is invoked when `sanj analyze` is called
- Handler must accept optional flags (to be defined below)
- Handler must instantiate and call AnalysisEngine

#### 2. Input & Flags
- **No required arguments** - the command is called as `sanj analyze`
- **Optional flags**:
  - `--verbose` or `-v`: Enable detailed logging output (default: false)
  - `--since <date>`: Analyze sessions since a specific date (default: last run)
  - `--write-state` or `-w`: Update state.json with new last-run timestamp (default: true)

#### 3. AnalysisEngine Integration
- Create new AnalysisEngine instance with:
  - Current config (loaded from `~/.sanj/config.json`)
  - Last run timestamp from `state.json`
- Call `AnalysisEngine.run()` to execute the full analysis flow
- Capture the result (success/failure, counts)

#### 4. State Management
- Before running: Read last analysis timestamp from `~/.sanj/state.json`
- After running: Update `state.json` with:
  - `lastAnalysisRun`: current timestamp (ISO 8601)
  - `lastAnalysisResults`: object with counts (sessionsProcessed, observationsCreated, observationsUpdated)
- Perform atomic write to avoid corruption on interruption

#### 5. Output & Logging
- **On success**: Print summary to stdout:
  ```
  ✓ Analysis complete
  - Sessions processed: N
  - New observations: M
  - Updated observations: P
  - Last run: 2026-01-26 14:30:00 UTC
  ```
- **On verbose mode**: Include per-adapter details:
  ```
  ✓ AnalysisEngine completed

  SessionAdapters:
  - ClaudeCodeSessionAdapter: X sessions, Y observations
  - OpenCodeSessionAdapter: A sessions, B observations

  Deduplication:
  - Similar observations found: C
  - New observations created: D
  ```
- **On error**: Print to stderr with exit code 1:
  ```
  ✗ Analysis failed: <error message>
  Check ~/.sanj/logs/analyze.log for details
  ```

#### 6. Logging
- Create `~/.sanj/logs/analyze.log` for permanent record
- Log format: `[TIMESTAMP] [LEVEL] message`
- Levels: DEBUG (verbose only), INFO, WARN, ERROR
- Always log:
  - Analysis start time
  - Which adapters were enabled/disabled
  - Session counts per adapter
  - Observation counts
  - Analysis end time and duration
  - Any errors or warnings encountered

#### 7. Error Handling
- **Missing config**: Suggest running `sanj init` first
- **LLM unavailable**: Warn user, suggest checking configuration
- **Session adapter errors**: Log and continue with other adapters
- **Observation store errors**: Log and fail gracefully
- **State file corruption**: Log warning and continue (don't crash)

#### 8. Cron Compatibility
- When run non-interactively (no TTY), suppress all output except errors
- Log all details to file instead
- Exit with code 0 on success, 1 on failure
- Make it safe for cron to call repeatedly

---

## Implementation Details

### File Structure

```
src/cli/commands/analyze.ts          # New command handler
src/cli/utils/output.ts              # Already exists, add helper functions
```

### Command Handler Signature

```typescript
// src/cli/commands/analyze.ts

export async function handleAnalyze(ctx: CommandContext): Promise<void> {
  // Implementation
}

// Register in src/cli/index.ts:
// .command("analyze", "Analyze recent sessions")
// .option("--verbose", "-v", { description: "Enable detailed logging" })
// .option("--since", { description: "Analyze since date (ISO 8601)" })
// .option("--write-state", "-w", { default: true })
// .on("analyze", handleAnalyze)
```

### AnalysisEngine Instantiation

The handler must create an AnalysisEngine with:

```typescript
const config = await loadConfig();
const lastRun = await getLastAnalysisTimestamp();
const engine = new AnalysisEngine(
  config,
  {
    since: ctx.flags.since ? new Date(ctx.flags.since) : lastRun,
    verbose: ctx.flags.verbose || false
  }
);
const result = await engine.run();
```

### Expected AnalysisEngine Response

```typescript
interface AnalysisResult {
  success: boolean;
  error?: string;
  summary: {
    startTime: Date;
    endTime: Date;
    sessionsProcessed: number;
    observationsCreated: number;
    observationsUpdated: number;
    adapterResults: {
      [adapterName: string]: {
        sessionsRead: number;
        patternsExtracted: number;
      }
    }
  }
}
```

### State File Format

```json
{
  "lastAnalysisRun": "2026-01-26T14:30:00.000Z",
  "lastAnalysisResults": {
    "sessionsProcessed": 5,
    "observationsCreated": 3,
    "observationsUpdated": 2
  }
}
```

### Logging Implementation

```typescript
// Create a Logger instance or simple logging function
function logToFile(level: string, message: string): void {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] [${level}] ${message}\n`;
  // Append to ~/.sanj/logs/analyze.log
}
```

---

## Edge Cases & Error Scenarios

| Scenario | Behavior |
|----------|----------|
| No sessions found | Log info, count as 0, exit success |
| LLM adapter fails | Log error, continue with other sessions, exit 1 if critical |
| State file missing | Create new one with this run's data, log info |
| State file corrupted | Log warning, use current time as "last run", continue |
| Output directory missing | Create ~/.sanj/logs/ automatically |
| Permission denied on state file | Log error and fail, suggest checking ~/.sanj/ permissions |

---

## Testing Considerations

The implementation should be testable with:

1. **Mock AnalysisEngine**: A test double that returns predictable results
2. **Mock file system**: For testing state file reads/writes
3. **Capture stdout/stderr**: Verify correct output messages
4. **Mock date/time**: Control the current timestamp in tests

Key test scenarios:
- Successful analysis with observations created
- Successful analysis with no observations
- AnalysisEngine throws error
- State file operations fail gracefully
- Verbose flag changes output
- --since flag overrides last-run timestamp
- Cron-compatible mode (no output)

---

## Integration Points

### Depends On (Must Exist First)
- **003-011**: AnalysisEngine class with `run()` method
- **001-002**: CLERC CLI infrastructure with command registration
- **003-008**: ObservationStore (used by AnalysisEngine)
- **003-010**: State management for lastAnalysisRun tracking

### Blocks (Required By)
- **007-001**: Cron install needs analyze command to be functional
- **005-002**: Status command needs last-run timestamp written by analyze

---

## Acceptance Criteria

- [x] `sanj analyze` can be called without arguments
- [x] Analyze command instantiates AnalysisEngine with correct parameters
- [x] Analysis results are logged to file with timestamp and details
- [x] State.json is updated with lastAnalysisRun timestamp
- [x] Success case prints summary to stdout with correct counts
- [x] Verbose flag enables detailed per-adapter output
- [x] Error cases exit with code 1 and print helpful messages
- [x] Non-TTY mode (cron) suppresses normal output
- [x] Works repeatedly without errors or state corruption
- [x] Log file grows over time (never truncated)
- [x] Missing config or adapters fail gracefully with helpful errors

---

## Success Metrics

1. **User can run `sanj analyze`** and it completes without errors
2. **State tracking works**: `lastAnalysisRun` is written to state.json
3. **Pattern capture happens**: New observations appear in observations.json
4. **Logging is comprehensive**: ~/.sanj/logs/analyze.log shows what happened
5. **Cron-ready**: Can be safely called from crontab (no interactive prompts)
6. **No data loss**: Repeated runs don't duplicate or corrupt observations

---

## Notes for Implementation

- Use async/await for all I/O operations
- Handle process.exit() carefully (let CLI framework control exit)
- Don't catch all errors globally; handle specific cases explicitly
- Consider making logging functionality reusable for other commands
- Keep the handler focused on CLI concerns; delegate to AnalysisEngine for business logic
- Test with empty config and missing adapters to ensure graceful degradation
