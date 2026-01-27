# Task Specification: 002-003

## Task Identity

- **Task ID**: 002-003
- **Task Name**: Implement init command skeleton in src/cli/commands/init.ts
- **JTBD Reference**: JTBD-002 - First-Time Setup
- **Priority**: P1 (Second wave of work)
- **Wave**: Wave 3

---

## Purpose

This task establishes the foundational command handler for the `sanj init` command. It creates the first user-facing entry point for the initialization workflow. The skeleton provides a basic command structure that will be extended by subsequent tasks (002-004 through 002-008) to add directory creation, config generation, prompts, validation, and confirmation output.

This is a foundational task that unblocks all remaining init-related work and allows the command to be called and routed properly through the CLERC CLI framework.

---

## Scope

### In Scope

1. **Command Registration**: Register the `init` command with CLERC CLI (in src/cli/index.ts)
2. **Handler Skeleton**: Create an InitHandler function that:
   - Accepts command context from CLERC
   - Has proper async/await structure
   - Includes placeholder for future logic
   - Returns appropriate exit codes
3. **Basic Typing**: Define InitHandler type/interface with proper TypeScript types
4. **Error Boundaries**: Add basic try-catch to handle unexpected errors gracefully
5. **Logging**: Add minimal logging for debugging (console.log/error)

### Out of Scope

1. **Directory Creation Logic**: Handled by task 002-004
2. **Config File Generation**: Handled by task 002-005
3. **Interactive Prompts**: Handled by task 002-006
4. **Tool Validation**: Handled by task 002-007
5. **Confirmation Output**: Handled by task 002-008
6. **Crontab Setup**: Can be added as optional enhancement but not required for v1
7. **Config Reading/Writing**: Use functions from 002-002 but don't implement them here

---

## Acceptance Criteria

### Structural Requirements

1. ✅ **File Created**: `src/cli/commands/init.ts` exists with proper TypeScript
2. ✅ **Command Registration**: `sanj init` command is registered in src/cli/index.ts and appears in help text
3. ✅ **Handler Function**: InitHandler is defined with signature:
   ```typescript
   async function initHandler(ctx: Clerc.Context): Promise<void>
   ```
4. ✅ **Error Handling**: Try-catch block catches and logs errors with exit code 1
5. ✅ **Exit Code 0**: Success path returns/exits with code 0

### Behavioral Requirements

1. ✅ **Command Invocation**: `sanj init` can be called without errors (even though it does nothing yet)
2. ✅ **Help Text**: `sanj init --help` displays basic description
3. ✅ **Logging**: Basic console output indicating the command was called (e.g., "Initializing sanj...")
4. ✅ **Type Safety**: No TypeScript errors when running `bun check`

### Testing Requirements

1. ✅ **Can be imported**: `import { initHandler } from './cli/commands/init'` works
2. ✅ **No runtime errors**: `bun run sanj init` exits cleanly (code 0)
3. ✅ **Help works**: `bun run sanj init --help` shows description

---

## Implementation Notes

### Architecture Decisions

1. **Single Responsibility**: This handler focuses only on command routing and error handling. Business logic (directory creation, config generation, etc.) belongs in separate functions that the handler will call.

2. **CLERC Integration**: Use CLERC's `Clerc.Context` type to access:
   - `ctx.args` - positional arguments (if any)
   - `ctx.flags` - parsed flags
   - `ctx.showHelp()` - display help
   - For exit codes: process.exit(code) or throw error

3. **Async Structure**: Even though the skeleton does minimal work, use async/await to make future addition of async operations (reading files, calling LLM, etc.) straightforward.

4. **Error Handling Pattern**:
   ```typescript
   try {
     // future logic here
     console.log("✓ Sanj initialized successfully");
   } catch (error) {
     console.error("✗ Initialization failed:", error.message);
     process.exit(1);
   }
   ```

5. **Placeholder Comment**: Add TODO comment indicating which tasks will add each piece of functionality:
   ```typescript
   // TODO (002-004): Directory creation logic
   // TODO (002-005): Config generation logic
   // TODO (002-006): Interactive prompts
   // TODO (002-007): Tool validation
   // TODO (002-008): Confirmation output
   ```

### File Organization

1. **Location**: `src/cli/commands/init.ts` (new file)
2. **Exports**: Default export is `initHandler` function
3. **Imports**:
   - CLERC types from 'clerc'
   - Future imports for path/config utilities will be added by 002-004+
4. **No New Dependencies**: Use only already-installed packages

### Code Structure Example

```typescript
import { Clerc } from 'clerc';

export async function initHandler(ctx: Clerc.Context): Promise<void> {
  try {
    console.log('Initializing sanj...');

    // TODO (002-004): Create directories
    // TODO (002-005): Generate config
    // TODO (002-006): Prompt for LLM adapter
    // TODO (002-007): Validate tools
    // TODO (002-008): Show confirmation

    console.log('✓ Sanj initialized successfully');
  } catch (error) {
    console.error('✗ Initialization failed:', error.message);
    process.exit(1);
  }
}
```

### CLERC Registration Example

In `src/cli/index.ts`, the command should be registered like:

```typescript
import { initHandler } from './commands/init';

Cli()
  .scriptName('sanj')
  // ... other setup ...
  .command('init', 'Initialize sanj for first-time use')
  .on('init', initHandler)
  // ... other commands ...
  .parse();
```

### Logging Strategy

- Use `console.log` for informational messages (will be output even from cron)
- Use `console.error` for errors
- Prefix with emoji for visual scanning:
  - ✓ Success
  - ✗ Error
  - ⏳ In progress (for future use)
- Keep messages brief and actionable

---

## Dependencies

### Input Dependencies (Must exist first)

1. **001-002**: CLERC CLI entry point (src/cli/index.ts)
   - Provides Clerc framework and types
   - Provides command registration mechanism
   - Status: ✅ Must be completed

2. **001-001**: Bun project initialization
   - Provides package.json and TypeScript setup
   - Status: ✅ Must be completed

### Output Dependencies (Blocks these tasks)

1. **002-004**: Directory creation logic
   - Depends on: InitHandler existing and callable
   - Can begin once this task is complete

2. **002-005**: Config generation logic
   - Depends on: InitHandler existing to call from
   - Indirectly depends on this task

3. **All remaining 002-x tasks**
   - All depend on InitHandler skeleton existing
   - This is the critical path for JTBD-002

### Related Tasks (Same JTBD)

- 002-001: Storage paths (can proceed in parallel or before)
- 002-002: Config read/write (can proceed in parallel)
- 002-004 through 002-008: Sequential steps to complete init
- 002-006 through 002-008: User interaction steps

---

## Success Criteria Verification

To verify this task is complete, run:

```bash
# 1. TypeScript compilation
bun check

# 2. Command is callable
bun run sanj init

# 3. Help text works
bun run sanj init --help

# 4. Exit code is 0 on success
bun run sanj init; echo "Exit code: $?"

# 5. File exists and is importable
bun --eval "import { initHandler } from './src/cli/commands/init'; console.log('✓ Import successful')"

# 6. Error handling works (when next task adds directory logic, errors should propagate)
# (This will be tested more thoroughly in 002-004)
```

---

## Technical Debt & Future Considerations

1. **Crontab Integration**: The init command should eventually set up cron schedules (currently out of scope, but could be added as 002-008a)
2. **Idempotency**: Future tasks should make init idempotent (safe to run multiple times)
3. **Backup Existing Config**: If ~/.sanj exists, should prompt before overwriting
4. **Windows Support**: CLERC supports Windows, but OpenTUI has limitations. Future consideration.
5. **Progress Indicators**: For longer operations, could add progress bars (requires new dependency)

---

## Related Documentation

- **JTBD-002 Details**: See 03-jtbd.md for full job statement and context
- **Task Dependencies**: See 04-tasks.md for complete dependency graph
- **Architecture**: See 05-hld.md for CLI layer design
- **Research**: See 01-research.md for CLERC framework details (lines 53-79)

---

## Notes for Implementation

1. **Keep it simple**: The skeleton should do minimal work. Let later tasks add the complexity.
2. **Type safety first**: Use proper TypeScript types - no `any` types.
3. **Reusability**: The InitHandler function should be structured so it can be called from both CLI and potentially from other places (though unlikely in v1).
4. **Testing in mind**: Structure the code so that the handler can be unit tested with mock Clerc.Context objects in future.
5. **Logging consistency**: Use the same console.log/error patterns that will be used across all commands.

