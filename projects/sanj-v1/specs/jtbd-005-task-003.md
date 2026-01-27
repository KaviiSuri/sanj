# Spec: 005-003 - Add long-term memory count to status output

## Overview

Add a count of items in long-term memory to the `sanj status` command output. This provides visibility into validated patterns that have been promoted from observations and are candidates for further promotion to core memory files.

## Task ID

- **ID**: 005-003
- **JTBD**: 005 - Status Check
- **Depends On**: 005-001 (status command skeleton), 004-009 (MemoryHierarchy)
- **Blocked By**: None (after dependencies complete)

## Background

The status command was created in task 005-001 with a basic skeleton. Task 005-003 extends this to display the count of items in long-term memory, which indicates how many observations have already been approved and promoted from the initial observations level.

The memory hierarchy has three levels:
1. **Observations** (pending) - awaiting user review and approval
2. **Long-Term Memory** - approved observations that have been promoted
3. **Core Memory** - promoted long-term memories written to CLAUDE.md/AGENTS.md

## Acceptance Criteria

1. **Read long-term memory**: Access the long-term-memory.md file stored at `~/.sanj/long-term-memory.md`
2. **Count items**: Parse the markdown file to count distinct long-term memory entries
3. **Display in status**: Include the count in the status output with a clear label
4. **Handle missing file**: If long-term-memory.md doesn't exist, show count as 0
5. **Format clearly**: Display alongside other status metrics (observations count, timestamps, etc.)

## Requirements

### Functional Requirements

- Parse long-term-memory.md to count entries
- Return an accurate count of long-term memory items
- Display in human-readable format on status command output
- Gracefully handle missing or empty file (count = 0)

### Non-Functional Requirements

- Query execution should be fast (file read + parse)
- No external dependencies beyond what's already in the stack
- Consistent formatting with other status output elements
- Suitable for scripting and parsing (consider structured output)

## Implementation Details

### File Format

Long-term-memory.md structure (from HLD):
- Markdown format stored at `~/.sanj/long-term-memory.md`
- Each item should be parseable as a distinct entry
- Likely structure: headers with observation content below

### Code Changes

**File**: `src/cli/commands/status.ts`

1. Create or extend a method to read and count long-term memory items:
   ```typescript
   async function getLongTermMemoryCount(): Promise<number>
   ```
   - Use MemoryHierarchy or direct file read
   - Return count of distinct items
   - Return 0 if file missing or empty

2. Extend the status output display:
   - Add line like: "Long-term memory items: X"
   - Position: after pending observations count, before timestamps
   - Use consistent formatting with other output lines

3. Consider using MemoryHierarchy (from 004-009) for consistency:
   - MemoryHierarchy should provide a method to query long-term memory count
   - Fall back to direct file parsing if not available from MemoryHierarchy

### Integration Points

- **MemoryHierarchy** (004-009): Query for count of long-term memory items
- **Storage paths** (002-001): Use const for long-term-memory.md path from paths.ts
- **StatusHandler** (005-001): Integrate count into existing output

## Output Format

Example status output with this addition:

```
Sanj Status Report
==================

Pending observations: 5
Long-term memory items: 12
Ready for core promotion: 3

Last analysis run: 2026-01-26 14:32:00
Next scheduled run: 2026-01-27 20:00:00
```

## Testing

### Unit Tests

File: `tests/core/MemoryHierarchy.test.ts` (if not already present)

Test cases:
1. Count items from valid long-term-memory.md
2. Return 0 for missing file
3. Return 0 for empty file
4. Accurately count multiple entries

### Integration Tests

File: `tests/cli/commands/status.test.ts`

Test cases:
1. Status command displays long-term memory count
2. Count updates after promoting observations to long-term memory
3. Graceful handling when MemoryHierarchy not yet initialized

## Dependencies

- Task 005-001 must be completed (status command skeleton exists)
- Task 004-009 must be completed (MemoryHierarchy implementation)
- Assumes long-term-memory.md file location is documented in HLD

## Assumptions

1. Long-term-memory.md uses markdown headers or clear delimiters for entries
2. MemoryHierarchy provides query methods for memory statistics
3. File paths are consistent with storage layer (002-001)
4. Status command already has basic structure from 005-001

## Open Questions

1. What is the exact structure/format of long-term-memory.md for entry parsing?
2. Does MemoryHierarchy expose a method to query memory statistics, or should we read file directly?
3. Should count include metadata like timestamps, or just content entries?

## Future Considerations

- Could expose long-term memory as a list via `sanj status --json` for scripting
- Could add promotion readiness indicators (e.g., "3 ready for core promotion")
- Could track age of items in long-term memory for promotion eligibility
