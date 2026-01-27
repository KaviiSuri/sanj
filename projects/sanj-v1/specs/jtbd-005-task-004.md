# Spec: Add Last Analysis Timestamp to Status Output

**Task ID**: 005-004
**JTBD**: 005 - Status Check
**Title**: Add last analysis timestamp to status output

---

## Overview

This task adds the "last analysis timestamp" information to the `sanj status` command output. This is part of the larger Status Check feature that provides users with a quick summary of Sanj's state.

This task depends on:
- **005-001**: Status command skeleton must exist
- **003-010**: State tracking mechanism (storage/state.ts) must be implemented to read last run timestamp

---

## Requirements

### Functional Requirements

#### FR-1: Retrieve Last Analysis Timestamp
- Read the last analysis run timestamp from `storage/state.ts`
- If no analysis has ever run, display "Never" or "Not yet"
- Timestamp should be read from `state.json` file at `~/.sanj/state.json`

#### FR-2: Display Formatted Timestamp
- Format the timestamp in a human-readable format
- Suggested format: ISO 8601 (e.g., "2025-01-26T14:30:00Z") or relative (e.g., "2 hours ago")
- Should be clear and unambiguous

#### FR-3: Integrate into Status Output
- Add timestamp line to the status command output
- Output order: Display after command name/header, alongside or near other timestamps
- Suggested output structure:
  ```
  Status Report
  Pending observations: X
  Long-term memory items: Y
  Ready for core promotion: Z
  Last analysis run: [timestamp]
  Next scheduled analysis: [if available]
  ```

### Technical Requirements

#### TR-1: State Management Integration
- Use existing `storage/state.ts` module to read state
- Call function to retrieve `lastAnalysisRun` timestamp
- Handle case where state file doesn't exist (first run scenario)

#### TR-2: Timestamp Formatting
- Create helper function in `src/cli/utils/output.ts` if not already present
- Implement `formatTimestamp()` function that takes Date object
- Support both absolute ISO format and relative time format
- Be timezone-aware (use UTC or local timezone consistently)

#### TR-3: Error Handling
- If state file is corrupted or unreadable, display "Unable to read timestamp" with warning
- Never crash the status command if timestamp retrieval fails
- Log errors for debugging (use console.warn or similar)

#### TR-4: Code Organization
- Add timestamp retrieval logic to existing `StatusHandler` in `src/cli/commands/status.ts`
- Reuse formatter functions from `output.ts` utilities
- Keep status command handler logic clean and focused

---

## Implementation Details

### Files to Modify

#### 1. `src/cli/commands/status.ts`
- Import state management functions from `storage/state.ts`
- Add timestamp retrieval in status handler:
  ```typescript
  const state = await getState(); // or similar API
  const lastAnalysisRun = state?.lastAnalysisRun;
  ```
- Call formatter utility and add to output
- Handle error cases gracefully

#### 2. `src/cli/utils/output.ts` (if timestamp formatter doesn't exist)
- Add `formatTimestamp(date: Date | null): string` function
- Implementation options:
  - **Option A**: ISO format: `date.toISOString()` → "2025-01-26T14:30:00Z"
  - **Option B**: Relative format: "2 hours ago", "3 days ago" (requires date-fns or similar)
  - **Recommended**: Start with ISO format for simplicity, add relative format later if desired

#### 3. `src/storage/state.ts` (if not already complete)
- Ensure `getState()` or similar function exists
- Ensure it reads and parses `~/.sanj/state.json`
- Ensure it handles missing file gracefully (returns null or default object)

### Integration Points

#### AnalysisEngine Integration
- The `AnalysisEngine` (from 003-011) must update `lastAnalysisRun` in state.json after each analysis
- This is handled by 003-010 but verify it's being called correctly

#### Status Command Dependencies
- 005-001 provides the command skeleton
- 003-010 provides the state management mechanism
- This task (005-004) adds the timestamp retrieval and display

---

## Acceptance Criteria

### AC-1: Timestamp Display
- [ ] Running `sanj status` includes "Last analysis run: [timestamp]" in output
- [ ] Timestamp is human-readable and clear
- [ ] If no analysis has run, displays sensible default ("Never", "Not set", etc.)

### AC-2: Proper Formatting
- [ ] Timestamps are formatted consistently
- [ ] Timezone information is preserved or clearly stated
- [ ] Format matches existing output styling (if any)

### AC-3: Error Handling
- [ ] If state.json is missing, status command doesn't crash
- [ ] If state.json is corrupted, status command doesn't crash
- [ ] Error messages are logged for debugging

### AC-4: Code Quality
- [ ] No TypeScript errors or linting issues
- [ ] Proper error handling with try/catch if needed
- [ ] Clean, readable code following project conventions
- [ ] Proper imports and module dependencies

### AC-5: Integration
- [ ] Works correctly with existing 005-001 status skeleton
- [ ] Works correctly with state management from 003-010
- [ ] Timestamp is accurate and updates on each analysis run

---

## Related Output Example

Based on the PRD (US-4), the status output should include:
```
sanj status

Status Report
─────────────────────────────────
Pending observations:          12
Long-term memory items:         8
Ready for core promotion:       3
Last analysis run:              2025-01-26 14:30:00 UTC
Next scheduled analysis:        Daily at 8:00 PM
─────────────────────────────────
```

---

## Testing Strategy

### Unit Tests
- Test `formatTimestamp()` with various date inputs
- Test with `null` or missing timestamp
- Test state retrieval with missing/corrupted file

### Integration Tests
- Run `sanj status` after mock analysis
- Verify timestamp matches last analysis run time
- Verify graceful behavior when state doesn't exist

### Manual Testing
- Run `sanj status` and verify output format
- Run after `sanj analyze` and verify timestamp updates
- Test on fresh install (no analysis history)

---

## Notes

- This task is relatively straightforward and can be completed once 005-001 and 003-010 are done
- Focus on simple ISO 8601 timestamp format for v1 (no need for relative time calculations)
- Leverage existing utilities; don't reinvent timestamp formatting
- Consider future enhancement: add "time since last run" for user convenience

---

## Dependencies

**Blocks**: None (this is a leaf task for JTBD-005)

**Blocked by**:
- 005-001: Status command skeleton
- 003-010: State tracking mechanism (lastAnalysisRun field)

**Related tasks**:
- 003-012: Analyze command must call state.updateLastAnalysisRun()
- 005-001: Status command skeleton must exist
- 005-002: Pending observations count
- 005-003: Long-term memory count
- 005-005: Cron schedule info
