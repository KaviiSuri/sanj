# Spec: Task 005-005 - Add cron schedule info to status output

## Overview

This task extends the `sanj status` command to display information about the current cron schedule. This provides users with quick visibility into when automated analysis runs are scheduled.

## Task ID
- **Task**: 005-005
- **JTBD**: 005 - Status Check
- **Dependencies**: 005-001, 007-002

## Context

The `sanj status` command provides a summary of Sanj's state. Currently (per task 005-004), it displays:
- Number of pending observations
- Number of items in long-term memory
- Number of items ready for core memory promotion
- Last analysis run timestamp

This task adds cron schedule information to give users visibility into the automation setup without requiring them to manually check their crontab.

## Requirements

### Functional Requirements

1. **Display cron schedule information in status output**
   - Show whether cron jobs are installed
   - Show the schedule for analysis runs (e.g., "Daily at 8:00 PM")
   - Show the schedule for promotion reviews (e.g., "Weekly on Sunday at 10:00 AM")
   - If no cron jobs are set up, show a helpful message

2. **Extract schedule info from system crontab**
   - Read the system crontab to find Sanj entries
   - Parse cron expressions to human-readable schedules
   - Handle cases where crontab is not accessible or Sanj entries don't exist

3. **Format output clearly**
   - Display schedule information in a readable way
   - Indicate if cron is not configured
   - Suggest the command to set up cron if missing (`sanj cron install`)

### Non-Functional Requirements

1. **Performance**: Status command should complete in < 1 second
2. **Reliability**: Gracefully handle:
   - Missing crontab
   - Malformed cron entries
   - Non-existent Sanj entries
3. **Compatibility**: Work on macOS and Linux (as per project constraints)

## Design

### Data Model

The status output will include a `schedules` object with the following structure:

```typescript
interface ScheduleInfo {
  isInstalled: boolean;
  analysis: {
    cronExpression?: string;
    humanReadable?: string;
    nextRun?: Date;
  };
  promotion: {
    cronExpression?: string;
    humanReadable?: string;
    nextRun?: Date;
  };
  message?: string; // Helpful message if not configured
}
```

### Implementation Approach

1. **Crontab Reading**
   - Use `crontab -l` command to read user's crontab
   - Filter for entries containing "sanj"
   - Handle errors gracefully (e.g., `crontab: no crontab for user`)

2. **Cron Expression Parsing**
   - Parse cron expressions to extract schedule information
   - Use a simple parser or existing library (if available)
   - Convert to human-readable format (e.g., "Daily at 8:00 PM")

3. **Next Run Calculation**
   - Calculate next run time based on current time and cron expression
   - Display this in the status output

4. **Integration with StatusHandler**
   - Extend the existing `StatusHandler` (implemented in task 005-001)
   - Add a new method to fetch cron schedule info
   - Include schedule info in the status output

### File Structure

```
src/
├── cli/
│   └── commands/
│       └── status.ts  (extend StatusHandler)
└── storage/
    └── cron.ts        (new - cron utilities)
```

### New Files/Modules

**src/storage/cron.ts** - Cron utilities
- `readCrontab()`: Read system crontab
- `parseCronEntry(entry: string)`: Parse a cron entry for Sanj
- `getCronScheduleInfo()`: Get current schedule info
- `humanReadableCron(expression: string)`: Convert cron to readable format
- `calculateNextRun(expression: string)`: Calculate next run time

## Implementation Details

### Cron Entry Format

Sanj cron entries created by task 007-002 will have a consistent format:
```
0 20 * * * /path/to/sanj analyze # sanj-analysis
0 10 * * 0 /path/to/sanj review # sanj-promotion
```

The handler will:
1. Search for entries with comment markers `# sanj-analysis` and `# sanj-promotion`
2. Extract the cron expression (first 5 fields)
3. Parse and convert to human-readable format

### Cron Expression Parsing

Handle standard 5-field cron format:
```
minute hour day-of-month month day-of-week
```

Example conversions:
- `0 20 * * *` → "Daily at 8:00 PM"
- `0 10 * * 0` → "Weekly on Sunday at 10:00 AM"
- `*/15 * * * *` → "Every 15 minutes"
- `0 9-17 * * 1-5` → "Every hour from 9 AM to 5 PM on weekdays"

### Error Handling

1. **No crontab**: Show "Cron not configured. Run: sanj cron install"
2. **Permission denied**: Show "Unable to read crontab (permission denied)"
3. **Malformed entries**: Skip and show "Found malformed cron entries"
4. **Missing Sanj entries**: Show "Analysis: Not scheduled"

### Status Output Example

```
Sanj Status Report
==================

Observations:     5 pending
Long-term Memory: 3 items
Core Memory:      Ready to promote 1 item
Last Analysis:    2 hours ago

Scheduled Tasks:
  Analysis:      Daily at 8:00 PM (next run: in 4 hours)
  Promotion:     Weekly on Sunday 10:00 AM (next run: in 3 days)

All systems ready!
```

If cron is not configured:
```
Sanj Status Report
==================

Observations:     5 pending
Long-term Memory: 3 items
Core Memory:      Ready to promote 1 item
Last Analysis:    2 hours ago

Scheduled Tasks:
  ⚠️  Not configured. Run: sanj cron install

Next Steps: Set up cron automation with `sanj cron install`
```

## Dependencies

### Code Dependencies
- **task 005-001**: `StatusHandler` must be implemented first
- **task 007-002**: `cron status` command (provides the foundation for reading cron entries)

### External Dependencies
- System `crontab` command (available on macOS/Linux)
- Possible npm package for cron parsing (TBD during implementation)

## Testing

### Unit Tests

```typescript
// test cases for cron.ts
describe('cron utilities', () => {
  test('parseCronEntry extracts expression from Sanj comment', () => {
    // Test parsing "0 20 * * * /path/to/sanj # sanj-analysis"
    // Should return { expression: "0 20 * * *", type: "analysis" }
  });

  test('humanReadableCron converts expressions', () => {
    // Test "0 20 * * *" → "Daily at 8:00 PM"
    // Test "0 10 * * 0" → "Weekly on Sunday at 10:00 AM"
  });

  test('calculateNextRun returns future date', () => {
    // Given a cron expression and current time
    // Should return the next run time
  });

  test('getCronScheduleInfo handles missing crontab', () => {
    // Mock crontab -l to fail
    // Should return { isInstalled: false, message: "..." }
  });

  test('getCronScheduleInfo parses existing entries', () => {
    // Mock crontab -l to return Sanj entries
    // Should extract and parse both analysis and promotion schedules
  });
});
```

### Integration Tests

```typescript
// Test status command with cron info
describe('sanj status', () => {
  test('status includes cron schedule info when installed', async () => {
    // Run status command
    // Output should contain schedule information
  });

  test('status shows helpful message when cron not configured', async () => {
    // Mock: no crontab
    // Output should suggest `sanj cron install`
  });
});
```

## Acceptance Criteria

- [ ] `sanj status` displays current cron schedules (if configured)
- [ ] Human-readable schedule format (e.g., "Daily at 8:00 PM")
- [ ] Shows next run time for each schedule
- [ ] Handles missing/unconfigured cron gracefully
- [ ] Suggests `sanj cron install` if cron not set up
- [ ] Parses at least common cron patterns correctly
- [ ] Works on macOS and Linux
- [ ] Completes in < 1 second
- [ ] Unit tests pass (cron utilities)
- [ ] Integration tests pass (status command with cron info)

## Open Questions

1. **Cron parsing library**: Should we use an npm package (e.g., `cron-parser`) or implement simple parser?
2. **Time zone handling**: Should next run times account for user's time zone?
3. **Windows future support**: Current design assumes `crontab -l` available (macOS/Linux only)

## Future Scope

- Add ability to change cron schedule via `sanj config`
- Display cron logs and errors
- Timezone-aware next run calculations
- Windows Task Scheduler support (future scope beyond v1)

## Implementation Order

1. Create `src/storage/cron.ts` with utility functions
2. Extend `StatusHandler` in `src/cli/commands/status.ts`
3. Integrate cron info into status output
4. Add error handling for edge cases
5. Write unit tests for cron utilities
6. Write integration tests for status command
