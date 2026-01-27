# Specification: Task 004-012 - Implement AgentsMdAdapter

## Overview

Implement the `AgentsMdAdapter` class, a concrete implementation of the `CoreMemoryAdapter` interface that writes observations and promoted memories to the OpenCode `AGENTS.md` file. This adapter enables Sanj to integrate with OpenCode's memory management system.

## Task Context

- **JTBD**: 004 - Review & Approve Observations (TUI)
- **Task ID**: 004-012
- **Depends On**: 004-010 (CoreMemoryAdapter interface definition)
- **Blocks**: 004-013 (PromotionList view for core memory promotions)

## Requirements

### 1. Class Definition

**File**: `src/adapters/memory/AgentsMd.ts`

The `AgentsMdAdapter` class must:
- Implement the `CoreMemoryAdapter` interface
- Manage read/write operations to the OpenCode global AGENTS.md file
- Handle file creation if the file does not exist
- Preserve existing content when appending new observations

### 2. Interface Implementation

Implement all methods from `CoreMemoryAdapter`:

```typescript
interface CoreMemoryAdapter {
  name: string;
  getPath(): string;
  read(): Promise<string>;
  append(content: string): Promise<void>;
}
```

#### 2.1 `name` Property
- **Type**: `string`
- **Value**: "AGENTS.md" or "AgentsMd"
- **Purpose**: Identifier for this adapter in logging and configuration

#### 2.2 `getPath()` Method
- **Returns**: `string` - Full path to the AGENTS.md file
- **Behavior**:
  - Should use the OpenCode global AGENTS.md location
  - Based on research, likely: `~/.local/share/opencode/AGENTS.md` or `~/AGENTS.md`
  - Should resolve tilde (`~`) to home directory using `os.homedir()`
  - Path must be consistent with OpenCode's expectations

#### 2.3 `read()` Method
- **Returns**: `Promise<string>` - File contents as a string
- **Behavior**:
  - Read the entire file from disk
  - If file does not exist, return empty string (don't throw)
  - Handle file encoding as UTF-8
  - Preserve line endings for round-trip consistency

#### 2.4 `append(content: string)` Method
- **Parameters**: `content` - Markdown-formatted text to append
- **Returns**: `Promise<void>`
- **Behavior**:
  - Append content to the end of the file
  - Ensure proper line separation (add newline before content if file is non-empty)
  - Create the file if it does not exist
  - Create parent directories if they don't exist
  - Preserve existing content
  - Use UTF-8 encoding for file operations

### 3. File Management

#### 3.1 Directory Creation
- Create parent directories for the AGENTS.md file if they don't exist
- Use `mkdir -p` equivalent or Node.js `fs.promises.mkdir()` with `{ recursive: true }`

#### 3.2 File Creation
- If AGENTS.md doesn't exist, create it with appropriate headers
- Consider starting with a header like "# AGENTS\n\n" or similar
- Follow OpenCode's conventions for AGENTS.md structure (if documented)

#### 3.3 Path Resolution
- Use `os.homedir()` or `Bun.env.HOME` to resolve home directory
- Support both `~/` and absolute paths
- Example: `~/.local/share/opencode/AGENTS.md`

### 4. Content Formatting

#### 4.1 Input Format
- Content passed to `append()` should be pre-formatted markdown
- The adapter is responsible for structural formatting (line breaks, sections)
- The adapter should not modify or validate the content structure

#### 4.2 Separator Between Entries
- Append a newline before new content if file already has content
- Maintain consistent spacing (typically one blank line between sections)

#### 4.3 Markdown Structure
- Preserve markdown formatting in the file
- Consider following a structure like:
  ```markdown
  # AGENTS

  ## [Date] Observations

  - [Observation 1]
  - [Observation 2]
  ```

### 5. Error Handling

#### 5.1 Read Errors
- If file doesn't exist, return empty string (graceful degradation)
- If file can't be read (permissions), throw `Error` with descriptive message
- Log errors appropriately for debugging

#### 5.2 Write Errors
- If parent directory can't be created, throw `Error` with descriptive message
- If file can't be written (permissions, disk full), throw `Error` with descriptive message
- Ensure partial writes don't corrupt the file

#### 5.3 Path Errors
- If home directory can't be determined, throw `Error`
- Validate that constructed path is valid before operations

### 6. Testing Considerations

#### 6.1 Mock File System
- Tests should use a temporary directory instead of actual home directory
- Provide constructor parameter or environment variable to override file path
- Default to real path in production, allow override in tests

#### 6.2 Test Cases (outline)
- Read from non-existent file returns empty string
- Read from existing file returns correct content
- Append to non-existent file creates file with content
- Append to existing file preserves and appends content
- Directory creation works recursively
- Path resolution handles tilde correctly
- Error cases are handled appropriately

### 7. Integration Points

#### 7.1 MemoryHierarchy
- Used by `MemoryHierarchy.promote()` to write approved observations to core memory
- Content format determined by MemoryHierarchy before passing to adapter

#### 7.2 PromotionList TUI
- Called from TUI when user approves an observation for core memory promotion
- Result should be immediately visible in AGENTS.md

#### 7.3 Configuration
- May be conditionally enabled/disabled via `config.json` (memory_targets.agents_md = true/false)
- Should respect user's preferences

### 8. Implementation Notes

#### 8.1 Similar Implementation
- `ClaudeMdAdapter` (task 004-011) is the parallel implementation for CLAUDE.md
- Both adapters follow the same `CoreMemoryAdapter` interface
- Consider reusable patterns or utility functions
- Key difference: file paths are different; functionality is largely the same

#### 8.2 Async Pattern
- Use `async/await` with Bun's built-in `fs.promises` API
- Or use `Bun.file()` for simpler file operations
- All methods must return Promises for consistency with the interface

#### 8.3 Dependency on os module
```typescript
import { homedir } from "os";
import { promises as fs } from "fs";
```
Or use Bun equivalents:
```typescript
const home = Bun.env.HOME;
```

### 9. Success Criteria

- [x] Class implements `CoreMemoryAdapter` interface completely
- [x] `getPath()` returns correct AGENTS.md location
- [x] `read()` works with existing and non-existent files
- [x] `append()` adds content without destroying existing data
- [x] File creation and directory creation work automatically
- [x] Path resolution handles home directory correctly
- [x] Error handling provides meaningful error messages
- [x] Code is TypeScript with proper types
- [x] Tests cover basic CRUD operations

## Acceptance Criteria

1. **Interface Compliance**: All methods from `CoreMemoryAdapter` are implemented with correct signatures
2. **File Operations**: Read and append operations work correctly on both new and existing files
3. **Path Handling**: Path resolution correctly interprets home directory and creates directories as needed
4. **Error Handling**: Errors are caught and reported meaningfully
5. **Integration**: MemoryHierarchy can successfully call this adapter to promote observations
6. **Testing**: Core functionality is tested with mock file system

## Related Tasks

- **004-010**: CoreMemoryAdapter interface (dependency)
- **004-011**: ClaudeMdAdapter (parallel implementation)
- **004-013**: PromotionList view (consumer)
- **004-009**: MemoryHierarchy (consumer)

## References

- **HLD Section**: "CoreMemoryAdapter (interface)" - lines 173-186
- **HLD Section**: "Storage" - lines 189-201
- **Folder Structure**: `src/adapters/memory/AgentsMd.ts`
- **Research**: OpenCode session storage - lines 37-40 (01-research.md)
