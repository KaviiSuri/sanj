# Spec: 007-001 - Implement cron install subcommand adding crontab entry

**Task ID**: 007-001
**JTBD**: 007 - Scheduled Automation
**Title**: Implement cron install subcommand adding crontab entry
**Status**: Not Started
**Dependencies**: 001-002 (CLI entry point), 003-012 (analyze command)

---

## Overview

Implement the `sanj cron install` subcommand that adds crontab entries to the system for automated analysis runs. This enables users to schedule periodic pattern extraction without manual intervention.

---

## Context

### Problem Statement

Users want Sanj to analyze their coding sessions automatically without running commands manually. The `cron install` subcommand is the primary mechanism for setting up this automation.

### Key Constraints

- Must work on macOS and Linux (crontab-based)
- Should not be run multiple times (idempotent or warn about duplicates)
- Must validate that `sanj analyze` command is available in PATH
- Should provide clear feedback about what was installed
- Must reference a valid schedule from configuration

### Related JTBDs

- JTBD-002: First-Time Setup (init command can optionally call cron install)
- JTBD-005: Status Check (displays next scheduled runs)
- JTBD-007: Scheduled Automation (core scheduling feature)

---

## Requirements

### Functional Requirements

#### FR-1: Parse and Execute Install
- Accept `sanj cron install` as subcommand
- Support optional `--schedule` flag to override default schedule
- Validate that schedule is in valid crontab format
- Generate appropriate crontab entry with proper paths

#### FR-2: Crontab Entry Format
The crontab entry must:
- Call `sanj analyze` with full absolute path
- Redirect stdout and stderr to log files in `~/.sanj/logs/`
- Use a clear, identifiable comment for easy detection and removal
- Run with user's shell environment
- Example format:
  ```
  # Sanj: automated session analysis (added 2026-01-26)
  0 20 * * * /path/to/bun /path/to/sanj analyze >> ~/.sanj/logs/analyze.log 2>&1
  ```

#### FR-3: Crontab Manipulation
- Read current crontab via `crontab -l`
- Detect if Sanj entries already exist (warn if found)
- Append new entry to crontab
- Write updated crontab via `crontab -`
- Handle errors gracefully if crontab is not available

#### FR-4: Default Schedule
- Default schedule: daily at 8:00 PM (20:00)
- Crontab format: `0 20 * * *`
- Configurable via config.json `cron.schedule` setting
- Allow user to override with `--schedule` flag

#### FR-5: Validation
- Verify that `sanj` command is in PATH and executable
- Verify that crontab command is available
- Verify schedule format is valid crontab syntax
- Prevent installation if `~/.sanj/` directory doesn't exist
- Provide helpful error messages if validation fails

#### FR-6: User Feedback
- Show confirmation of what was added
- Display when the next run will occur
- Suggest running `sanj cron status` to verify
- Warn if Sanj crontab entries already exist

### Non-Functional Requirements

#### NFR-1: Error Handling
- Graceful handling of crontab not available (suggest manual setup)
- Graceful handling if sanj command not found in PATH
- Clear error messages for all failure modes
- Exit code 1 on failure, 0 on success

#### NFR-2: Security
- Don't expose sensitive file paths in normal output
- Cron logs can contain session references (acceptable, user's machine)
- Don't modify system files other than crontab

#### NFR-3: Idempotency
- Should warn if installing again (detect existing entries)
- Should not add duplicate entries
- Suggest `cron uninstall` then `cron install` if updating schedule

---

## Implementation Details

### Command Structure

```typescript
// In src/cli/commands/cron.ts

interface CronInstallOptions {
  schedule?: string;  // Optional override for crontab schedule
}

async function handleCronInstall(ctx: CommandContext, options: CronInstallOptions): Promise<void> {
  // Implementation
}
```

### Algorithm

```
1. Load config from ~/.sanj/config.json
2. Get default schedule from config.cron.schedule (fallback to "0 20 * * *")
3. Override with --schedule flag if provided
4. Validate crontab schedule format (via regex or library)
5. Validate that sanj command exists in PATH
6. Validate that crontab command exists
7. Resolve full path to sanj binary (e.g., /usr/local/bin/sanj)
8. Generate crontab entry with full paths
9. Read existing crontab (crontab -l)
10. Check if Sanj entries already exist (warn but allow override with flag)
11. Append new entry to crontab
12. Write updated crontab (crontab -)
13. Parse entry to determine next run time
14. Display confirmation message with next run time
```

### Crontab Entry Details

```bash
# Location in crontab: appended after existing entries
# Format: standard 5-field crontab + command

# Comment line for easy identification
# Sanj: automated session analysis (added YYYY-MM-DD)

# The actual entry
0 20 * * * /full/path/to/sanj analyze >> ~/.sanj/logs/analyze.log 2>&1
```

**Path Resolution**:
- Use `which sanj` to find executable in PATH
- If `which` fails, construct path based on Bun global installation
- Store resolved path in comment for debugging

### Log Directory Setup

- Log directory must exist: `~/.sanj/logs/`
- Create if missing during install (already handled by 002-004)
- Logs rotate based on file size (handled separately in 007-004)

### Configuration Schema

In `config.json`, expect:
```json
{
  "cron": {
    "schedule": "0 20 * * *",
    "enabled": true
  }
}
```

### Error Messages

**Error: crontab not available**
```
Error: crontab command not found on this system.
Sanj requires crontab for automated scheduling.
Please install crontab or set up the following entry manually:

  0 20 * * * /path/to/sanj analyze >> ~/.sanj/logs/analyze.log 2>&1

More info: https://crontab.guru/
```

**Error: sanj not in PATH**
```
Error: sanj command not found in PATH.
Please ensure sanj is installed and accessible globally.

Run: bun install -g sanj
Then try: sanj cron install
```

**Error: ~/.sanj/ not initialized**
```
Error: Sanj not initialized.
Run: sanj init
Then: sanj cron install
```

**Warning: Sanj crontab entries already exist**
```
Warning: Sanj crontab entries already detected.
To update your schedule, run:
  sanj cron uninstall
  sanj cron install --schedule "0 6 * * *"

To skip this warning: sanj cron install --force
```

**Success: Installation complete**
```
✓ Crontab entry installed
  Schedule: 0 20 * * * (daily at 8:00 PM)
  Next run: 2026-01-27 at 20:00

Next steps:
  View schedule: sanj cron status
  Remove schedule: sanj cron uninstall

Logs available at: ~/.sanj/logs/analyze.log
```

### Validation Functions

```typescript
// Validate crontab schedule format (5 fields: minute hour day month weekday)
function isValidCronSchedule(schedule: string): boolean {
  const cronRegex = /^(\d+|\*|\?|\*\/\d+|(\d+-\d+)) (\d+|\*|\?|\*\/\d+|(\d+-\d+)) (\d+|\*|\?|\*\/\d+|(\d+-\d+)) (\d+|\*|\?|\*\/\d+|(\d+-\d+)) (\d+|\*|\?|\*\/\d+|(\d+-\d+))$/;
  return cronRegex.test(schedule);
}

// Check if sanj command is available
async function isSanjAvailable(): Promise<boolean> {
  // Use 'which sanj' or similar
}

// Check if crontab is available
async function isCrontabAvailable(): Promise<boolean> {
  // Use 'which crontab' or similar
}

// Resolve full path to sanj executable
async function resolveSanjPath(): Promise<string> {
  // Return absolute path from 'which' or Bun installation directory
}
```

### Next Run Time Calculation

- Parse crontab schedule to determine next execution time
- Use a library like `cron-parser` or implement simple calculation
- Display in user-friendly format: "2026-01-27 at 20:00"
- Handle edge cases: next day, next month, next year

---

## Dependencies

### External Dependencies
- `clerc`: Already available from CLI layer (001-002)
- `cron-parser` (optional): For calculating next run time
  - Alternative: implement simple next-run calculation for default schedule

### Internal Dependencies
- Config system (002-002): Read cron.schedule setting
- Paths system (002-001): Access to ~/.sanj/ directory
- Storage validation: Ensure ~/.sanj/ exists

### System Dependencies
- `crontab` command (Unix-like systems only)
- `which` command (for PATH resolution)
- User's shell environment

---

## Testing Strategy

### Unit Tests

```typescript
// tests/commands/cron.test.ts

test("validateCronSchedule - accepts valid formats", () => {
  expect(isValidCronSchedule("0 20 * * *")).toBe(true);
  expect(isValidCronSchedule("*/15 * * * *")).toBe(true);
  expect(isValidCronSchedule("0 6,12,18 * * *")).toBe(true);
});

test("validateCronSchedule - rejects invalid formats", () => {
  expect(isValidCronSchedule("invalid")).toBe(false);
  expect(isValidCronSchedule("60 * * * *")).toBe(false);
});

test("resolveSanjPath - returns absolute path", async () => {
  const path = await resolveSanjPath();
  expect(path).toMatch(/^\/.*sanj$/);
});

test("generateCrontabEntry - creates correct format", () => {
  const entry = generateCrontabEntry("/usr/local/bin/sanj", "0 20 * * *");
  expect(entry).toContain("# Sanj:");
  expect(entry).toContain("0 20 * * *");
  expect(entry).toContain("/usr/local/bin/sanj analyze");
  expect(entry).toContain(">> ~/.sanj/logs/analyze.log 2>&1");
});
```

### Integration Tests

```typescript
// tests/integration/cron-install.test.ts

test("cron install - creates crontab entry", async () => {
  // Mock crontab command
  // Run: sanj cron install
  // Verify: entry appears in crontab
  // Verify: success message displayed
});

test("cron install - warns on duplicate", async () => {
  // Install once
  // Install again
  // Verify: warning message displayed
});

test("cron install - fails without ~/.sanj/", async () => {
  // Remove ~/.sanj/ directory
  // Run: sanj cron install
  // Verify: error message, exit code 1
});
```

### Manual Testing Checklist

- [ ] `sanj cron install` with default schedule (8 PM)
- [ ] `sanj cron install --schedule "0 6 * * *"` (6 AM)
- [ ] Run twice, verify warning about existing entries
- [ ] Run `crontab -l` and verify entry is present
- [ ] Verify entry includes comment with timestamp
- [ ] Verify entry logs to ~/.sanj/logs/analyze.log
- [ ] Test on macOS (BSD crontab)
- [ ] Test on Linux (GNU crontab)
- [ ] Error case: no crontab available (mock)
- [ ] Error case: sanj not in PATH
- [ ] Error case: ~/.sanj/ doesn't exist

---

## Acceptance Criteria

1. **AC-1**: `sanj cron install` command is recognized and parsed by CLI
2. **AC-2**: Creates valid crontab entry in user's crontab
3. **AC-3**: Default schedule is 8 PM daily (`0 20 * * *`)
4. **AC-4**: Schedule can be overridden with `--schedule` flag
5. **AC-5**: Validates schedule format before installation
6. **AC-6**: Validates sanj command is available in PATH
7. **AC-7**: Validates crontab command is available
8. **AC-8**: Validates ~/.sanj/ directory exists
9. **AC-9**: Warns if Sanj crontab entries already exist
10. **AC-10**: Displays success message with next run time
11. **AC-11**: Logs are configured to write to ~/.sanj/logs/analyze.log
12. **AC-12**: Exit code is 0 on success, 1 on failure
13. **AC-13**: Error messages are clear and actionable

---

## Implementation Notes

### Order of Implementation

1. Define types and interfaces
2. Implement validation functions
3. Implement path resolution
4. Implement crontab entry generation
5. Implement crontab read/write operations
6. Implement command handler with error handling
7. Add help text and command registration
8. Write unit and integration tests

### Known Limitations (v1)

- Crontab-based only (no systemd timers or Windows Task Scheduler)
- Manual uninstall required if schedule needs changing
- No automatic log rotation (handled in 007-004)
- Simple schedule format only (no complex cron expressions in UI)

### Future Enhancements (Not v1)

- Support for systemd timers on Linux
- Windows Task Scheduler support
- GUI for schedule selection (instead of cron syntax)
- Weekly promotion reminder scheduling
- Cron log viewer/analyzer

---

## Files Affected

### New Files
- `src/cli/commands/cron.ts` (cron command handler)
- `tests/commands/cron.test.ts` (unit tests)
- `tests/integration/cron-install.test.ts` (integration tests)

### Modified Files
- `src/cli/index.ts` (add cron command registration)
- `src/storage/config.ts` (may need to add cron.schedule defaults)
- `package.json` (optional: add cron-parser dependency if needed)

---

## Related Specifications

- **007-002**: Implement cron status subcommand (depends on this)
- **007-003**: Implement cron uninstall subcommand (depends on this)
- **007-004**: Set up logging directory and log rotation (related)
- **003-012**: Implement analyze command (must be working)
- **002-001** through **002-008**: Storage and initialization (must be complete)

---

## Success Metrics

1. **Reliability**: Zero crontab corruption in testing
2. **Usability**: Users understand what was installed and next run time
3. **Compatibility**: Works on macOS and Linux systems
4. **Maintainability**: Code is testable and well-documented
5. **Safety**: Clear warnings for existing entries, easy to undo
