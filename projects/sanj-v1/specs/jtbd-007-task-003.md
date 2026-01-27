# Spec: JTBD-007, Task 007-003
## Implement cron uninstall subcommand removing entries

**Task ID**: 007-003
**JTBD**: 007 - Scheduled Automation
**Status**: Pending
**Priority**: P0
**Dependencies**: 007-001 (Implement cron install subcommand)

---

## Overview

Implement the `sanj cron uninstall` subcommand to remove all Sanj-related crontab entries. This provides users with a clean way to disable automated analysis scheduling.

This task depends on 007-001, which establishes the pattern for how Sanj crontab entries are created and identified in the system crontab.

---

## Acceptance Criteria

1. **Crontab Entry Removal**
   - `sanj cron uninstall` successfully removes all Sanj entries from the user's crontab
   - Only Sanj-specific entries are removed (identified by comment markers)
   - Non-Sanj entries remain untouched
   - Handles edge cases: missing crontab, already uninstalled state, empty crontab

2. **User Feedback**
   - Shows confirmation before removing entries
   - Displays what entries will be removed
   - Shows success message after removal
   - Clear error messages if removal fails

3. **Idempotency**
   - Can be run multiple times safely
   - Second run detects no entries to remove and exits gracefully
   - Returns exit code 0 on success (whether entries existed or not)

4. **Error Handling**
   - Gracefully handles missing or unreadable crontab
   - Handles permission errors when modifying crontab
   - Provides helpful error messages with recovery suggestions
   - Returns exit code 1 on failure

5. **Integration**
   - Works correctly with entries created by 007-001
   - Preserves exact format of non-Sanj cron entries
   - Maintains proper crontab syntax after removal
   - Compatible with system crontab tools (`crontab -l`, `crontab -e`)

---

## User Story

**As** a user who no longer wants Sanj to run automatically,
**I want** to run a single command to remove all Sanj scheduling,
**So that** my crontab is cleaned up and Sanj stops running in the background.

---

## Technical Requirements

### Input

- **Command**: `sanj cron uninstall`
- **Arguments**: None
- **Flags**: None (all arguments optional for v1)
- **Environment**: User's system crontab

### Output

**Success Case**:
```
Removing Sanj cron entries...
Found 2 entries to remove:
  - Daily analysis at 20:00
  - Weekly promotion at 10:00 on Sunday
Continue? [y/N]: y

Successfully removed 2 cron entries.
Sanj automation is now disabled.
```

**Already Uninstalled**:
```
No Sanj cron entries found.
Sanj automation is not currently scheduled.
```

**Error Case**:
```
Error: Unable to modify crontab (Permission denied)
Try running: sudo crontab -e
```

### Implementation Approach

1. **Read Current Crontab**
   - Execute `crontab -l` to retrieve current crontab
   - Catch error if no crontab exists (exit gracefully, not an error)

2. **Identify Sanj Entries**
   - Parse crontab content line by line
   - Identify Sanj entries using comment marker from 007-001 (e.g., `# sanj:`)
   - Build list of entries to remove with human-readable descriptions
   - Preserve non-Sanj entries

3. **Prompt User for Confirmation**
   - Display list of entries found
   - Ask for explicit confirmation before proceeding
   - On "no", exit without modifying crontab
   - Use standard interactive prompt pattern from project

4. **Write Modified Crontab**
   - Create new crontab content without Sanj entries
   - Write to temporary file
   - Use `crontab <tempfile>` to install modified crontab
   - Clean up temporary file

5. **Report Results**
   - Show count of removed entries
   - Confirm automation is disabled
   - Provide next steps if applicable

### Error Handling Strategy

| Scenario | Handling |
|----------|----------|
| No crontab exists | Exit gracefully: "No Sanj automation currently scheduled" |
| No Sanj entries in crontab | Exit gracefully: "No Sanj entries found" |
| Permission denied | Error message with `sudo` suggestion |
| Crontab syntax error (edge case) | Preserve original, warn user, exit without changes |
| Temp file creation failure | Error with recovery suggestion |
| `crontab` command not found | Error message explaining crontab requirement |

### File Locations

- **Current Crontab**: System crontab (accessed via `crontab -l`)
- **Temp File**: Use `~/.sanj/temp/crontab-backup-<timestamp>`
- **Backup**: No persistent backup needed (user has `crontab -l` history if needed)

### Command Implementation Details

**File**: `/src/cli/commands/cron.ts`
**Export**: Part of `cron` command subcommand handlers

**Function Signature**:
```typescript
async function handleCronUninstall(ctx: CommandContext): Promise<void>
```

**Subcommand Registration**:
```typescript
Cli()
  .command("cron uninstall", "Remove Sanj entries from crontab")
  .on("cron uninstall", handleCronUninstall)
```

---

## Shared Dependencies (from 007-001)

This task depends on patterns established in 007-001:

1. **Crontab Entry Format**:
   - Standard comment marker to identify Sanj entries
   - Example: `# sanj: daily analysis`
   - Used for parsing and filtering

2. **Crontab Interaction Library**:
   - Helper functions for reading/writing crontab
   - Error handling for crontab operations
   - Should be reusable by 007-003

3. **User Confirmation Pattern**:
   - Standard interactive prompt used by `sanj init`
   - Consistent UX for all interactive commands

---

## Implementation Checklist

- [ ] Create or update crontab utility module with shared helpers
- [ ] Implement crontab reading function (handle missing crontab)
- [ ] Implement crontab parsing and Sanj entry identification
- [ ] Implement user confirmation prompt
- [ ] Implement crontab writing function
- [ ] Implement error handling for all edge cases
- [ ] Add logging for uninstall operations
- [ ] Add unit tests:
  - [ ] Test parsing valid crontab with Sanj entries
  - [ ] Test parsing crontab without Sanj entries
  - [ ] Test removal of mixed entries (Sanj and non-Sanj)
  - [ ] Test error handling (permission denied, missing crontab)
  - [ ] Test idempotency (running twice)
  - [ ] Test preserving non-Sanj entries exactly
- [ ] Integration test with actual crontab
- [ ] Add help text and command descriptions

---

## Related Code References

### From 007-001 (Cron Install)
- Crontab entry creation logic
- Comment marker format
- Error handling patterns
- Temporary file management

### Related Components
- `src/storage/paths.ts` - Storage paths for temp files
- `src/cli/commands/init.ts` - Interactive prompt patterns
- `src/core/types.ts` - Domain types

---

## Success Metrics

1. **Functionality**
   - `sanj cron uninstall` removes all Sanj crontab entries
   - Works after `sanj cron install` (removes what was installed)
   - Safe to run multiple times
   - Preserves other cron jobs

2. **User Experience**
   - Clear feedback about what will be removed
   - Confirmation required before action
   - Success/error messages are helpful

3. **Code Quality**
   - Shared utilities with 007-001
   - Proper error handling and edge cases
   - Comprehensive test coverage
   - Type-safe TypeScript

---

## Notes

- This task completes the core scheduling feature (install, status, uninstall)
- The uninstall operation is destructive but with user confirmation
- Focus on safety: verify entries before removal, provide clear feedback
- Consider race conditions if crontab is modified during operation (edge case for v1)
- Backup consideration: Not storing backups in v1, but `crontab -l` history available on Unix systems

---

## Revision History

| Date | Author | Changes |
|------|--------|---------|
| 2026-01-26 | Claude Code | Initial spec creation |
