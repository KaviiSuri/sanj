# Spec: Task 007-004 - Set up logging directory and log rotation for cron runs

## Overview

This task establishes a robust logging infrastructure for automated cron-based analysis runs. The system must capture analysis output, errors, and state changes in a way that's easy to inspect and debug while managing disk space through rotation.

## Context

- **JTBD**: 007 - Scheduled Automation
- **Task ID**: 007-004
- **Dependency**: 002-001 (Create storage/paths.ts with path constants)
- **Related**: 007-001, 007-002, 007-003 (other cron-related tasks)

## Problem Statement

When `sanj analyze` runs via cron without interactive output, users have no visibility into:
- Whether analysis succeeded or failed
- What observations were discovered
- What errors occurred
- How much disk space logs are consuming

This task addresses the need for accessible, rotated logs that remain useful over time.

## Requirements

### Functional Requirements

#### FR1: Log Directory Creation
- Create `~/.sanj/logs/` directory during initialization (task 002-001 or lazily on first write)
- Directory must be readable and writable by the user
- Must handle case where directory already exists (idempotent)

#### FR2: Log File Organization
- Each cron run creates a new log file with timestamp
- Log file naming: `analysis-YYYY-MM-DD-HHmmss.log`
- Example: `~/.sanj/logs/analysis-2025-01-26-143022.log`

#### FR3: Log Content Structure
- Each log entry has a timestamp prefix: `[HH:mm:ss]`
- Log levels: INFO, WARN, ERROR
- Format: `[HH:mm:ss] [LEVEL] message`
- Structured data for metrics (JSON format for programmatic access)

#### FR4: Log Rotation
- **Retention policy**: Keep logs for 30 days by default
- **Max file size**: Not enforced per-file (cron runs are typically small)
- **Cleanup trigger**: Run cleanup check at start of each analysis
- **Cleanup action**: Delete logs older than 30 days
- **Configurable retention**: Allow override in config.json (`logRetentionDays`)

#### FR5: Analysis Run Logging
- Log start timestamp and version
- Log for each session adapter: available status, sessions found
- Log for each session processed: session ID, patterns extracted, observations created/updated
- Log deduplication results: similar observations found, counts bumped
- Log final summary: total sessions processed, observations created, observations updated, analysis duration
- Log any errors with full context

#### FR6: Accessibility
- `sanj status` shows path to latest log file
- `sanj logs` command to view recent logs (future scope, but paths ready for it)
- Logs are plain text, human-readable
- Log file rotation makes it easy to find logs for specific dates

### Non-Functional Requirements

#### NFR1: Performance
- Logging operations must not block analysis (async where possible)
- File I/O batching if needed for high-volume logging

#### NFR2: Reliability
- Missing log directory must not crash analysis
- Write failures should log to stderr but not halt execution

#### NFR3: Disk Space
- Logs should not accumulate indefinitely
- 30-day retention should keep disk usage reasonable for typical usage

#### NFR4: Debuggability
- Logs must provide sufficient context to diagnose issues
- Include session references, observation IDs, error messages with stack traces

## Technical Design

### Directory Structure

```
~/.sanj/
├── logs/
│   ├── analysis-2025-01-26-140000.log
│   ├── analysis-2025-01-26-141500.log
│   ├── analysis-2025-01-25-140000.log
│   └── ... (older logs)
├── config.json
├── observations.json
├── long-term-memory.md
└── state.json
```

### Log File Format

```
[14:00:00] [INFO] sanj v1.0.0 - Analysis started
[14:00:00] [INFO] Config loaded: adapters=[claude_code,opencode], llm=opencode
[14:00:02] [INFO] SessionAdapter[claude_code] available: true, sessions found: 3
[14:00:03] [INFO] SessionAdapter[opencode] available: true, sessions found: 2
[14:00:05] [INFO] Processing session claude_code/project_abc/session_001
[14:00:05] [INFO] LLM extracted 4 patterns
[14:00:06] [INFO] - observation_001: "prefer-async-functions", count bumped from 2 to 3
[14:00:06] [INFO] - observation_new_1: "use-error-boundaries", created new (count=1)
[14:00:10] [INFO] Processing session opencode/project_xyz/session_042
[14:00:10] [INFO] LLM extracted 2 patterns
[14:00:11] [INFO] - observation_002: "prefer-named-exports", count bumped from 5 to 6
[14:00:15] [INFO] Summary: processed=5 sessions, created=1, updated=2, duration=15.2s
[14:00:15] [INFO] Analysis completed successfully
```

### Structured Metrics (appended as JSON at end of log)

```json
{
  "timestamp": "2025-01-26T14:00:15Z",
  "version": "1.0.0",
  "duration_seconds": 15.2,
  "sessions_processed": 5,
  "observations_created": 1,
  "observations_updated": 2,
  "adapters": {
    "claude_code": {
      "available": true,
      "sessions_found": 3,
      "sessions_processed": 3
    },
    "opencode": {
      "available": true,
      "sessions_found": 2,
      "sessions_processed": 2
    }
  },
  "errors": []
}
```

### Implementation Approach

#### 1. Create Logger Utility (`src/core/Logger.ts`)

```typescript
interface LogEntry {
  timestamp: string;      // "HH:mm:ss"
  level: 'INFO' | 'WARN' | 'ERROR';
  message: string;
}

class Logger {
  private logFilePath: string;
  private metrics: {
    startTime: Date;
    sessionsProcessed: number;
    observationsCreated: number;
    observationsUpdated: number;
    adapters: Record<string, AdapterMetrics>;
    errors: string[];
  };

  constructor(logsDir: string);

  // Logging methods
  info(message: string): void;
  warn(message: string): void;
  error(message: string, error?: Error): void;

  // Metrics tracking
  trackSessionProcessed(adapterId: string): void;
  trackObservationCreated(): void;
  trackObservationUpdated(): void;
  addError(error: string): void;

  // Finalization
  finalize(): Promise<void>;

  // Cleanup
  static async cleanupOldLogs(logsDir: string, retentionDays: number): Promise<void>;
}
```

#### 2. Integration Points

- **AnalysisEngine**: Inject Logger instance, call tracking methods during analysis
- **init command**: Create logs directory if it doesn't exist
- **analyze command**: Create new Logger at start, finalize at end
- **status command**: Read latest log file, extract metrics

#### 3. Path Management

Add to `src/storage/paths.ts`:

```typescript
export function logsDirectory(): string {
  return path.join(sanjDirectory(), 'logs');
}

export function logFilePath(timestamp: Date = new Date()): string {
  const formatted = formatTimestamp(timestamp); // YYYY-MM-DD-HHmmss
  return path.join(logsDirectory(), `analysis-${formatted}.log`);
}
```

#### 4. Config Extension

Add to config schema:

```json
{
  "logRetentionDays": 30,
  "logLevel": "INFO"
}
```

## Success Criteria

1. **Directory Creation**: `~/.sanj/logs/` exists after first run, idempotent
2. **Log Files**: Analysis creates dated log files with correct naming
3. **Log Content**: Logs contain required information (start, adapters, sessions, observations, summary)
4. **Rotation**: Logs older than 30 days are deleted (or configurable retention)
5. **Status Integration**: `sanj status` shows path to latest log
6. **No Crashes**: Logging failures don't break analysis
7. **Accessibility**: Logs are readable plain text, easy to find by date

## Testing Strategy

- Unit tests for Logger class (timing, formatting, metrics)
- Integration test: Run analysis, verify log file created with correct content
- Rotation test: Create old log files, run cleanup, verify deletion based on retention policy
- Error handling test: Simulate write failures, verify graceful degradation

## Future Enhancements (Not in v1)

- `sanj logs` command to list/filter/tail recent logs
- Structured log viewing (JSON log format for machine parsing)
- Log streaming to external service (Datadog, CloudWatch, etc.)
- Compressed log archival (.gz)
- Per-session detailed logs (separate log per session adapter run)

## Related Tasks

- **002-001**: Provides path constants foundation
- **002-002**: Config loading/writing for retention settings
- **003-012**: AnalysisEngine integration point
- **007-001**: Cron install uses logs for debugging
- **005-001**: Status command displays log information

## References

- JTBD-007: Scheduled Automation
- HLD: Storage section (logs/ directory)
- Task 04-tasks.md: Task breakdown with dependencies
