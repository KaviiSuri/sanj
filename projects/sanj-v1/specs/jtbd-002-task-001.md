# Spec: Task 002-001 - Create storage/paths.ts with path constants for ~/.sanj/

## Task Identification

**Task ID**: 002-001
**JTBD Reference**: JTBD-002 - First-Time Setup
**Dependency**: 001-001 (Initialize Bun project with package.json and tsconfig.json)

---

## Purpose

This task establishes the foundation for all storage operations in Sanj by centralizing path definitions. Creating a dedicated `storage/paths.ts` module ensures:

- Single source of truth for all file/directory paths in the Sanj ecosystem
- Consistency across all components that read/write to `~/.sanj/`
- Easy maintenance and refactoring of paths if requirements change
- Type-safe path references with no magic strings scattered throughout codebase

This is a prerequisite for all subsequent storage operations (config management, state tracking, observation storage, logging).

---

## Scope

### In Scope

1. **Define path constants for core storage locations**:
   - Root directory: `~/.sanj/`
   - Configuration file: `~/.sanj/config.json`
   - Observations store: `~/.sanj/observations.json`
   - Long-term memory: `~/.sanj/long-term-memory.md`
   - State tracking: `~/.sanj/state.json`
   - Logs directory: `~/.sanj/logs/`

2. **Implement path resolution utilities**:
   - Function to expand `~` to user's home directory
   - Helper to construct full paths by combining constants
   - Support for both absolute paths and directory names

3. **Export a clean, usable API**:
   - Named exports for all path constants
   - Type-safe constants (not magic strings)
   - Exported object with all paths for easy reference

### Out of Scope

- Creating directories (happens in task 002-004)
- Validating path accessibility or permissions
- Reading/writing config or state files (handled by `storage/config.ts` and `storage/state.ts`)
- Path migration or legacy location handling
- Windows-specific path handling (v1 assumes macOS/Linux)

---

## Acceptance Criteria

### Definition of Done

- [ ] File created at `/src/storage/paths.ts`
- [ ] Module exports all required path constants:
  - `SANJ_HOME` (the `~/.sanj/` directory)
  - `CONFIG_PATH` (config.json location)
  - `OBSERVATIONS_PATH` (observations.json location)
  - `LONG_TERM_MEMORY_PATH` (long-term-memory.md location)
  - `STATE_PATH` (state.json location)
  - `LOGS_DIR` (logs directory)

- [ ] Paths are correctly expanded to absolute paths using home directory
- [ ] Constants are properly typed (string literal types or readonly strings)
- [ ] Module exports a single default object with all paths for convenience
- [ ] Code follows TypeScript best practices:
  - Uses `os.homedir()` or equivalent for cross-platform home directory
  - Uses `path.join()` for path concatenation
  - Includes JSDoc comments explaining each constant
  - No external dependencies beyond Node.js built-ins

### Verification Steps

1. **Manual import test**: Import the module in a test file and verify all exports exist
2. **Path format check**: Verify paths are absolute and start with `/Users/<username>/.sanj/`
3. **Path accuracy**: Cross-reference paths against research documentation:
   - Root matches `~/.sanj/` from research (line 143, 147)
   - Config location matches expected `~/.sanj/config.json`
   - Observations location matches expected `~/.sanj/observations.json`
   - Long-term memory matches expected `~/.sanj/long-term-memory.md`
4. **No trailing slashes**: Directory paths should not have trailing slashes (except root if necessary for specific use case)
5. **Consistency check**: All paths should use consistent casing and format

---

## Implementation Notes

### Technical Guidance

1. **Home Directory Expansion**:
   ```typescript
   import { homedir } from 'os';
   const SANJ_HOME = path.join(homedir(), '.sanj');
   ```

2. **Path Construction Pattern**:
   - Use `path.join()` from Node.js `path` module
   - Avoid string concatenation for cross-platform compatibility
   - Do not include trailing slashes on directory paths

3. **Export Strategy**:
   - Export individual named constants for specific imports: `import { CONFIG_PATH } from './paths'`
   - Also export a default object with all paths: `import paths from './paths'` or `import * as paths`
   - Example structure:
     ```typescript
     export const SANJ_HOME = /* ... */;
     export const CONFIG_PATH = /* ... */;
     // ... other constants

     export default {
       SANJ_HOME,
       CONFIG_PATH,
       // ... other paths
     };
     ```

4. **JSDoc Documentation**:
   - Document purpose of each constant
   - Include example values in comments
   - Note which components use each path

5. **No Runtime Logic**:
   - This module should be purely declarative
   - No file I/O or directory creation
   - No error handling needed (validation happens elsewhere)

### Integration Points

This module will be imported by:
- `src/storage/config.ts` (task 002-002) - for CONFIG_PATH
- `src/storage/state.ts` (task 003-010) - for STATE_PATH
- `src/cli/commands/init.ts` (task 002-003) - for SANJ_HOME
- `ObservationStore` implementation - for OBSERVATIONS_PATH
- `MemoryHierarchy` implementation - for LONG_TERM_MEMORY_PATH
- `CronHandler` (task 007-004) - for LOGS_DIR

### File Structure

```
src/
└── storage/
    └── paths.ts  ← Create this file
```

### Testing Approach

While this module doesn't require dedicated unit tests (it's purely constants), verify by:
1. Importing in dependent modules
2. Running a quick check that paths resolve correctly
3. Confirming path format matches expected `~/.sanj/*` pattern

---

## Dependencies

### Required Imports
- Node.js built-ins only:
  - `os` (for `homedir()`)
  - `path` (for `join()`)

### No External Dependencies
- Should not introduce any npm packages
- Purely standard library usage

### Blocking Dependencies
- **Depends on**: 001-001 (Bun project must exist with tsconfig.json)
- **Blocks**:
  - 002-002 (config.ts needs paths.ts)
  - 003-010 (state.ts needs paths.ts)
  - 007-004 (cron logging needs paths.ts)

---

## References

- **Research Document**: `/projects/sanj-v1/01-research.md`
  - Lines 143-147: Storage location specification
  - Storage location: `~/.sanj/`

- **PRD Document**: `/projects/sanj-v1/02-prd.md`
  - User Story 1 mentions creating `~/.sanj/` directory structure

- **JTBD Document**: `/projects/sanj-v1/03-jtbd.md`
  - JTBD-002: First-Time Setup context

- **HLD Document**: `/projects/sanj-v1/05-hld.md`
  - Storage section (lines 189-200) shows file structure
  - Folder structure (lines 244-310) shows `src/storage/paths.ts` location

---

## Success Metrics

- Code compiles without errors
- All path constants are correctly defined and exported
- Paths match expected locations from documentation
- Module is immediately usable as dependency for subsequent storage tasks
- Clear, well-documented code suitable for future maintenance
