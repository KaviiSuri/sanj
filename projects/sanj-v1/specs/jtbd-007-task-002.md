# Specification: JTBD-007-002 - Implement Cron Status Subcommand

## Overview

Implement the `sanj cron status` subcommand to display the current cron schedule for Sanj analysis and promotion tasks. This command provides users with visibility into their scheduled automation setup.

## Task ID

**007-002** - Implement cron status subcommand showing current schedule

**JTBD**: 007 - Scheduled Automation
**Dependency**: 001-002 (CLI entry point)

---

## User Story

**As** a Sanj user,
**I want** to see the current cron schedule for my automated tasks,
**So that** I know when analysis and promotions are scheduled to run.

---

## Acceptance Criteria

- [ ] `sanj cron status` command exists and is callable
- [ ] Command displays all Sanj-related cron entries currently in the system crontab
- [ ] For each entry, show:
  - The cron schedule expression (e.g., `0 20 * * *`)
  - The command being run (e.g., `sanj analyze`)
  - Human-readable interpretation of the schedule (e.g., "Daily at 8:00 PM")
- [ ] Exit code is 0 (success) when called
- [ ] Exit code is 1 (failure) if cron cannot be read or has errors
- [ ] Output is clear and scannable (not overly verbose)
- [ ] Works correctly even if no Sanj cron entries exist yet (shows helpful message)
- [ ] Non-interactive, suitable for scripting or quick checks

---

## Detailed Requirements

### 1. Command Registration

Register the subcommand with CLERC in the CLI entry point:

```
sanj cron status
```

**Location**: `/src/cli/commands/cron.ts` (or appropriate handler file)

---

### 2. Implementation Details

#### 2.1 Read System Crontab

- Use `crontab -l` to read the user's crontab
- Handle the case where no crontab exists (graceful error message)
- Parse the output to identify Sanj entries (look for `sanj analyze` and `sanj review` commands)

#### 2.2 Parse Cron Expressions

For each Sanj cron entry found, parse the expression and generate a human-readable description.

**Cron expression format**: `minute hour day month day-of-week command`

**Examples**:
- `0 20 * * *` → "Daily at 8:00 PM"
- `0 10 * * 0` → "Weekly on Sunday at 10:00 AM"
- `0 8 * * 1-5` → "Weekdays at 8:00 AM"
- `*/6 * * * *` → "Every 6 hours"

**Library recommendation**: Use a small parsing utility or simple regex/string parsing. Do not add heavy dependencies for this if a simple solution works.

#### 2.3 Output Format

Display in a clear, structured format (table or list):

```
Sanj Cron Schedule:

Schedule          Command               When
──────────────────────────────────────────────────────────────
0 20 * * *        sanj analyze          Daily at 8:00 PM
0 10 * * 0        sanj review           Weekly on Sunday at 10:00 AM

Next scheduled run: 2026-01-27 20:00 (analyze)
```

**Alternative simple format:**
```
Sanj Cron Schedule:

Daily at 8:00 PM:
  0 20 * * *  sanj analyze

Weekly on Sunday at 10:00 AM:
  0 10 * * 0  sanj review

Next scheduled run: 2026-01-27 20:00
```

---

### 3. Edge Cases

| Case | Behavior |
|------|----------|
| No Sanj entries in crontab | Show: "No Sanj cron entries found. Run `sanj init` to set up scheduling." |
| Crontab not readable | Show: "Unable to read crontab. Is cron installed?" (Exit code: 1) |
| Invalid cron expression | Log the raw expression with a warning, continue parsing others |
| User runs on system without crontab support | Gracefully handle and suggest alternatives |

---

### 4. Integration Points

### 4.1 Dependency on 001-002

This task depends on the CLI entry point being established (001-002), so the command handler can be registered with CLERC.

### 4.2 Used by 005-005

The `sanj status` command (005-005) will call this internally to show cron schedule info in its output. Ensure the core logic is extracted into a reusable function.

### 4.3 Related Commands

- `sanj cron install` (007-001) - Sets up the cron entries
- `sanj cron uninstall` (007-003) - Removes the entries
- `sanj status` (005-005) - Shows overall status including cron info

---

## Implementation Checklist

- [ ] Create cron command handler file (`src/cli/commands/cron.ts`)
- [ ] Implement `status` subcommand
- [ ] Implement crontab reading via `crontab -l`
- [ ] Implement cron expression parsing (minute, hour, day, month, dow)
- [ ] Implement human-readable schedule conversion
- [ ] Format output in clear table/list structure
- [ ] Handle edge cases (no entries, unreadable crontab, etc.)
- [ ] Register command with CLERC in CLI index
- [ ] Test with various cron expressions
- [ ] Validate exit codes (0 for success, 1 for errors)
- [ ] Ensure output is suitable for scripting (no interactive prompts)

---

## Testing Strategy

### Unit Tests

Test the cron parsing logic with various expressions:

```typescript
describe('cron expression parsing', () => {
  test('parses daily schedule', () => {
    expect(parseCronExpression('0 20 * * *')).toBe('Daily at 8:00 PM');
  });

  test('parses weekly schedule', () => {
    expect(parseCronExpression('0 10 * * 0')).toBe('Weekly on Sunday at 10:00 AM');
  });

  test('parses weekday schedule', () => {
    expect(parseCronExpression('0 8 * * 1-5')).toBe('Weekdays at 8:00 AM');
  });

  test('parses interval schedule', () => {
    expect(parseCronExpression('*/6 * * * *')).toBe('Every 6 hours');
  });
});
```

### Integration Tests

- Test reading actual crontab (if available in test environment)
- Test output formatting with multiple entries
- Test error handling when crontab doesn't exist

### Manual Testing

- Run `sanj cron status` when no cron entries exist
- Run after `sanj init` sets up entries
- Run after `sanj cron uninstall` removes entries

---

## Performance Considerations

- Reading crontab is fast (single shell command)
- Parsing is simple string operations (milliseconds)
- No external API calls
- No heavy dependencies

---

## Error Handling

| Error | Response |
|-------|----------|
| `crontab -l` fails (permission denied) | Show helpful message about crontab permissions |
| Crontab not found | Show: "No crontab installed or accessible" |
| Malformed cron entry | Log warning and show raw expression |
| Parsing failure | Graceful degradation (show raw expression) |

---

## Output Examples

### Example 1: With Cron Entries Set Up

```
$ sanj cron status
Sanj Cron Schedule:

  0 20 * * *    sanj analyze              Daily at 8:00 PM
  0 10 * * 0    sanj review               Weekly on Sunday at 10:00 AM

Next scheduled run: 2026-01-27 at 20:00 (analyze)
```

### Example 2: No Entries Found

```
$ sanj cron status
No Sanj cron entries found.

To set up automated analysis, run:
  sanj init
```

### Example 3: Crontab Not Accessible

```
$ sanj cron status
Unable to read crontab. Is cron installed?
```

---

## File Structure

```
src/
├── cli/
│   ├── commands/
│   │   ├── cron.ts           ← Implement status subcommand here
│   │   └── ...
│   ├── utils/
│   │   ├── cronParser.ts     ← Utility for parsing cron expressions
│   │   └── output.ts         ← Formatting helpers
│   └── index.ts              ← Register cron command
```

---

## Implementation Notes

1. **Cron Parsing**: A simple implementation parsing the 5 fields (minute, hour, day, month, dow) is sufficient. For complex expressions (ranges, steps), provide best-effort human-readable output.

2. **Next Run Calculation**: Use JavaScript `Date` objects to calculate when the next scheduled run will occur based on current time.

3. **Reusability**: Extract cron reading and parsing logic into utility functions so it can be reused by `sanj status` (005-005).

4. **Cross-Platform**: Note that crontab is Unix/Linux/macOS specific. Windows support can be deferred to future versions.

---

## Success Metrics

- Users can quickly see their Sanj cron schedule
- Output is clear and actionable
- Works reliably across different cron configurations
- Helps with debugging scheduling issues

---

## Related Documentation

- JTBD-007: Scheduled Automation
- Task 007-001: Implement cron install subcommand
- Task 007-003: Implement cron uninstall subcommand
- Task 005-005: Add cron schedule info to status output
- HLD Section: CLI Commands and Cron Automation
