# Spec: Task 002-004 - Add directory creation logic to init command

## Task Identification

**Task ID**: 002-004
**JTBD Reference**: 002 - First-Time Setup
**Parent Command**: `sanj init`

---

## Purpose

This task adds the file system initialization logic to the `sanj init` command. It creates the complete `~/.sanj/` directory structure that serves as the storage foundation for all Sanj functionality. Without this, the init command cannot proceed to generate configuration or set up other resources.

**What this accomplishes**:
- Creates the primary storage directory (`~/.sanj/`)
- Creates subdirectories for observations, logs, and future state files
- Ensures idempotent behavior (safe to run multiple times)
- Validates directory creation success before proceeding

---

## Scope

### In Scope

- Create `~/.sanj/` root directory
- Create `~/.sanj/logs/` subdirectory for cron job logs
- Use Node.js/Bun file system APIs (likely `fs.mkdir()` with recursive flag)
- Handle the case where directories already exist (idempotent)
- Validate that directories were created successfully
- Return status/error codes to be used by subsequent init steps

### Out of Scope

- Generating configuration files (that's task 002-005)
- Setting up crontab entries (that's task 007-001)
- Interactive prompts or user input (that's task 002-006)
- Writing to CLAUDE.md or AGENTS.md (that's task 002-008 and later)
- Creating any content files (only directory structure)

---

## Acceptance Criteria

1. **Directory Creation**
   - [ ] Running `sanj init` creates `~/.sanj/` directory if it doesn't exist
   - [ ] Running `sanj init` creates `~/.sanj/logs/` subdirectory
   - [ ] Both directories have appropriate read/write permissions for the current user

2. **Idempotency**
   - [ ] Running `sanj init` twice in succession does not throw errors
   - [ ] Existing directories are not deleted or reset
   - [ ] The function handles EEXIST errors gracefully

3. **Error Handling**
   - [ ] If directory creation fails (e.g., permission denied), init command stops with clear error message
   - [ ] Error message indicates which directory failed to create and why (e.g., "Failed to create ~/.sanj/: Permission denied")
   - [ ] Exit code is non-zero on failure

4. **Integration with Task 002-003**
   - [ ] Directory creation happens after the init command skeleton is in place (building on task 002-003)
   - [ ] Exported function/method can be called from init.ts handler
   - [ ] Returns result object that subsequent tasks (002-005, etc.) can check for success/failure

---

## Implementation Notes

### Technical Approach

**File Location**: `src/cli/commands/init.ts`

**Function Signature** (suggested):
```typescript
async function ensureDirectories(): Promise<{
  success: boolean;
  created: string[]; // paths that were created
  error?: string;    // error message if failure
}>
```

**Steps**:
1. Use path helper from task 002-001 (`paths.ts`) to get `~/.sanj/` path
2. Call `Bun.file()` or `fs.mkdir()` with `{ recursive: true }` to create root
3. Create `logs/` subdirectory in same manner
4. Catch and handle errors:
   - `EEXIST`: Acceptable, continue
   - `EACCES`: Permission denied, return error
   - Other: Return error with details
5. Return result object indicating success/failure

**Dependencies**:
- Task 002-003: Init command skeleton must exist
- Task 002-001: `paths.ts` should export `SANJ_HOME` constant

**Integration Points**:
- Called from `InitCommand` handler in task 002-003
- Result used by task 002-005 (default config generation)
- Result could inform error handling in task 002-007

### Code Pattern

Use Bun's native APIs when possible. Example pattern:
```typescript
// Using Bun.file() and Bun's fs module
const bun = await import('bun');
try {
  await bun.file(path).mkdir({ recursive: true });
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
}
```

Or use Node.js compatibility:
```typescript
import { mkdir } from 'fs/promises';

async function ensureDirectories() {
  try {
    await mkdir(paths.SANJ_HOME, { recursive: true });
    await mkdir(paths.SANJ_LOGS_HOME, { recursive: true });
  } catch (error) {
    if (error.code === 'EACCES') {
      throw new Error(`Permission denied: cannot create ${error.path}`);
    }
    throw error;
  }
}
```

### Path Constants

Should use constants from `src/storage/paths.ts` (task 002-001):
```typescript
export const SANJ_HOME = path.join(os.homedir(), '.sanj');
export const SANJ_LOGS_HOME = path.join(SANJ_HOME, 'logs');
```

### Error Messages

When directory creation fails, provide user-friendly output:
```
Error: Failed to initialize Sanj

Could not create ~/.sanj/ directory:
  Permission denied (EACCES)

Please check that you have write access to your home directory
and try again. If the problem persists, run with elevated
permissions or check your file system.
```

---

## Dependencies

### Must Complete First

- **Task 002-003**: Init command skeleton - provides the CLERC command handler structure
- **Task 002-001**: `paths.ts` module - provides path constants like `SANJ_HOME`

### Blocks

- **Task 002-005**: Default config generation - needs directories to exist before writing config.json
- **Task 002-007**: Tool availability validation - expects directories to be ready

### Related Tasks

- Task 007-004 (logs setup) - uses the `logs/` directory created here

---

## Testing Approach

**Unit Testing** (recommended):
- Mock file system using fixture or in-memory FS
- Test successful creation of both directories
- Test idempotent behavior (run twice, check no errors)
- Test permission denied scenarios
- Test result object structure

**Manual Testing**:
```bash
rm -rf ~/.sanj  # Start fresh
sanj init       # Should create directories
ls -la ~/.sanj/ # Verify directories exist
sanj init       # Run again, should not error
```

---

## Completion Checklist

- [ ] Directory creation function implemented in init.ts or separate module
- [ ] Uses path constants from paths.ts
- [ ] Handles EEXIST gracefully (idempotent)
- [ ] Handles permission errors with clear messages
- [ ] Returns result object with success/failure status
- [ ] Integrated into InitCommand handler
- [ ] Manual test: `sanj init` creates ~/.sanj/ and ~/.sanj/logs/
- [ ] Manual test: Running `sanj init` twice produces no errors
- [ ] Documentation updated if needed
- [ ] Ready for task 002-005 (config generation)

