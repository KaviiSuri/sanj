# Spec: Task 005-001 - Implement Status Command Skeleton

## Task Overview

**Task ID**: 005-001
**JTBD**: 005 - Status Check
**Depends On**: 001-002 (CLI entry point with CLERC)
**Blocks**: 005-002, 005-003, 005-004, 005-005

## Objective

Create the skeleton of the `sanj status` command that displays a summary of Sanj's state. This is a non-interactive command suitable for scripting or quick checks. The skeleton will establish the command structure and output format, with individual status components added in subsequent tasks.

## Job Statement

"When I want a quick glance at Sanj's state, I want a summary, so that I know if action is needed."

## Context

The status command is a read-only operation that provides visibility into Sanj's internal state without triggering any analysis or reviews. It's designed to be fast and scriptable.

## What This Task Involves

### 1. Create Command File Structure
- Create `/src/cli/commands/status.ts` as the entry point for the status command
- Define a handler function that can be wired to the CLERC CLI

### 2. Register Command with CLI
- Wire the status command to the main CLI in `/src/cli/index.ts`
- Use CLERC's command routing to connect `sanj status` to the handler
- Ensure the command is discoverable via help text

### 3. Establish Output Format
- Define a consistent output structure for all status information
- Use clear, human-readable formatting
- Prepare placeholder output for components that will be added later

### 4. Error Handling
- Gracefully handle missing config or initialization state
- Provide helpful error message if `~/.sanj/` directory doesn't exist (suggesting `sanj init`)
- Return appropriate exit codes (0 for success, 1 for errors)

## Acceptance Criteria

1. **Command Registration**
   - `sanj status` command is recognized and callable
   - `sanj --help` lists the status command
   - `sanj status --help` shows usage documentation

2. **Skeleton Output**
   - Displays a basic status report (even if components show placeholder values)
   - Output includes section headers and clear formatting
   - Information is presented in a logical order

3. **Error Handling**
   - If `~/.sanj/` doesn't exist, shows helpful message prompting `sanj init`
   - Exit code is 0 on success, 1 on error
   - No unhandled exceptions or crashes

4. **Code Quality**
   - Command handler is properly typed with TypeScript
   - Code follows project conventions
   - Handler is easily extensible (future tasks will add data to each section)

## Detailed Requirements

### Command Handler Structure

```typescript
// src/cli/commands/status.ts

import { CliContext } from "clerc";
import { getSanjHomePath } from "../../storage/paths";

export async function statusCommand(ctx: CliContext): Promise<void> {
  // Implementation
}
```

### Output Format

The status command should output structured information in this order:

```
Sanj Status Report
==================

📊 Observations
  Pending: [count placeholder]

📚 Long-Term Memory
  Items: [count placeholder]

⏱️  Analysis
  Last Run: [timestamp placeholder]
  Next Run: [schedule placeholder]

⚠️  Issues
  [errors placeholder]

Status: READY
```

### Initialization Check

```typescript
// Pseudo-code showing the pattern
if (!fs.existsSync(getSanjHomePath())) {
  console.error("Sanj not initialized. Run: sanj init");
  process.exit(1);
}
```

### CLI Registration in `/src/cli/index.ts`

The command should be registered using CLERC's chainable API:

```typescript
Cli()
  // ... other commands
  .command("status", "Show Sanj status summary")
  .on("status", statusCommand)
  // ... other commands
```

## Implementation Notes

### Dependencies
- Uses `getSanjHomePath()` from `src/storage/paths.ts` (already implemented in 002-001)
- Uses CLERC context for proper CLI integration
- Standard Node.js `fs` module for checking directory existence

### Future Integration Points

Subsequent tasks will extend this skeleton to add:
- Pending observations count (005-002, needs ObservationStore)
- Long-term memory count (005-003, needs MemoryHierarchy)
- Last analysis timestamp (005-004, needs state.ts)
- Cron schedule info (005-005, needs cron infrastructure)

The skeleton should be designed so these additions are simple appends to the output, not major refactors.

### Code Style

- Use async/await for consistency with other commands
- Error messages should be clear and actionable
- Output should be aligned with existing CLI patterns (if any)

## Testing Strategy

### Manual Testing
- Run `sanj status` after `sanj init` completes
- Verify output displays all expected sections
- Test error case: run `sanj status` without running `sanj init` first

### Future Automated Testing
- Integration tests can be added once ObservationStore and MemoryHierarchy are available
- Mock file system tests for initialization checks

## Success Metrics

1. Command is discoverable and callable
2. Displays a status report with placeholder values
3. Gracefully handles missing initialization
4. Provides correct exit codes
5. Is easily extensible for future status components

## File Changes

### New Files
- `/src/cli/commands/status.ts` - Status command handler

### Modified Files
- `/src/cli/index.ts` - Register status command with CLERC

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Command doesn't integrate with CLERC | Follow CLERC documentation pattern from existing commands |
| Path resolution issues | Reuse `getSanjHomePath()` utility from 002-001 |
| Unclear error messages | Use specific, actionable messages that guide users |

## Related Tasks

- **Dependency**: 001-002 (CLERC CLI setup) - Must be completed first
- **Blocks**: 005-002, 005-003, 005-004, 005-005 (Status components)
- **Related in JTBD-005**: All status display tasks depend on this skeleton
