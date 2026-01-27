# Spec: Task 004-011 - Implement ClaudeMdAdapter for writing to CLAUDE.md

**JTBD**: 004 - Review & Approve Observations (TUI)
**Task ID**: 004-011
**Depends On**: 004-010 (Define CoreMemoryAdapter interface)
**Blocks**: 004-013 (Create PromotionList view)
**Priority**: P2 (Core Memory functionality)

---

## Overview

Implement the `ClaudeMdAdapter` class that writes approved observations to CLAUDE.md. This adapter is a concrete implementation of the `CoreMemoryAdapter` interface and handles formatting, path resolution, and safe appending of memory content to the user's CLAUDE.md file.

---

## Context

### Purpose

The ClaudeMdAdapter bridges the gap between Sanj's memory hierarchy and Claude Code's expected memory file format. It enables Sanj to promote long-term memories into the global CLAUDE.md file that Claude Code uses to understand user preferences and patterns.

### Design Pattern

This task is part of the **Adapter Pattern** architecture:

```
CoreMemoryAdapter (interface, from 004-010)
    ├── ClaudeMdAdapter (this task)
    └── AgentsMdAdapter (004-012)
```

The adapter abstraction allows:
- Multiple memory targets (CLAUDE.md, AGENTS.md)
- Easy testing via mock adapters
- Future extensibility (per-project CLAUDE.md files)

### Memory Promotion Flow

```
Observations (pending)
    ↓ [user approves]
Long-Term Memory (long-term-memory.md)
    ↓ [meets threshold + user approves]
Core Memory (CLAUDE.md) ← ClaudeMdAdapter writes here
```

---

## Requirements

### Functional Requirements

#### FR1: Implement CoreMemoryAdapter Interface

The adapter must fully implement the `CoreMemoryAdapter` interface defined in 004-010:

```typescript
interface CoreMemoryAdapter {
  name: string;
  getPath(): string;
  read(): Promise<string>;
  append(content: string): Promise<void>;
}
```

**Acceptance Criteria**:
- `name` property returns "claude-md"
- `getPath()` returns the correct CLAUDE.md path
- `read()` returns current file contents (or empty string if not exists)
- `append()` safely adds content to the file

#### FR2: Path Resolution

Determine the CLAUDE.md path with this priority:

1. **Project-level CLAUDE.md** (if available via config or environment)
   - Location: Project root or `.claude/` directory
   - Useful for project-specific memory
2. **Global CLAUDE.md** (fallback)
   - Location: User's home directory (`~/.claude/CLAUDE.md`)
   - Universal memory file

**Acceptance Criteria**:
- Path resolution respects config settings
- Handles both absolute and relative paths correctly
- Returns consistent path across multiple calls
- Falls back gracefully if project-level file doesn't exist

#### FR3: Safe File Operations

Handle file I/O safely and robustly:

**Read Operation**:
- Returns empty string if file doesn't exist (idempotent)
- Preserves file encoding and line endings
- Doesn't fail on permission errors (logs warning instead)

**Append Operation**:
- Only appends, never overwrites existing content
- Creates file if it doesn't exist
- Handles concurrent access (uses append mode)
- Validates content before writing
- Rolls back on error without corrupting file

**Acceptance Criteria**:
- Read returns empty string for non-existent files
- Append preserves all existing content
- File format remains valid after append
- Works with files created by Claude Code
- Handles edge cases (empty file, large file, special characters)

#### FR4: Content Formatting

Format memory entries consistently:

**Format Specification**:
```markdown
## [Section Header]
- [bullet-point format entry]
- [multiple entries separated by newlines]
```

**Example**:
```markdown
## Preferences
- Uses TypeScript strict mode for all projects
- Prefers functional components in React over class components
- Likes to document complex algorithms with ASCII diagrams

## Patterns
- Starts refactoring sessions by checking test coverage
- Always runs type checker before committing
```

**Acceptance Criteria**:
- Content is formatted as markdown
- Entries are bullet points or sections
- No duplicate content appended to existing sections
- Preserves markdown syntax (headers, emphasis, links)
- Respects existing CLAUDE.md structure

#### FR5: Error Handling

Handle errors gracefully with appropriate logging:

**Error Scenarios**:
- File doesn't exist → create it
- Permission denied → throw error with path and suggestion
- Disk full → throw error with recovery suggestion
- Content validation fails → throw error with details

**Acceptance Criteria**:
- All errors are descriptive with context
- Errors don't leave partial writes
- Logs include file path and timestamp
- User can understand what went wrong and how to fix it

### Non-Functional Requirements

#### NFR1: Testability

Design for easy unit testing:

- Constructor accepts optional path override for testing
- No direct environment variable access (inject via config)
- Pure functions for formatting/validation
- Mock-friendly error handling

**Acceptance Criteria**:
- Can test with temporary files
- Can test without Claude Code installation
- No side effects on test environment

#### NFR2: Performance

Efficient file operations:

- Minimize file I/O (batch operations when possible)
- Handle large CLAUDE.md files efficiently
- No unnecessary reads during append

**Acceptance Criteria**:
- Append operation completes in <100ms for typical files
- No memory issues with files >10MB
- Efficient enough for cron job execution

#### NFR3: Compatibility

Works with existing Claude Code memory files:

- Respects existing CLAUDE.md format
- Compatible with manually-edited files
- Doesn't break Claude Code's ability to read the file

**Acceptance Criteria**:
- Can append to CLAUDE.md created by Claude Code
- Claude Code still reads appended content correctly
- Works with various CLAUDE.md formats

---

## Technical Specification

### File Location

**Global CLAUDE.md** (default):
```
~/.claude/CLAUDE.md
```

**Project-level CLAUDE.md** (future, configurable):
```
<project-root>/.claude/CLAUDE.md
```

**Priority**:
1. Check if config specifies a path
2. Check if `.claude/CLAUDE.md` exists in current project
3. Fall back to `~/.claude/CLAUDE.md`

### Implementation Details

#### Class Structure

```typescript
export class ClaudeMdAdapter implements CoreMemoryAdapter {
  private path: string;

  constructor(path?: string) {
    this.path = path ?? this.resolvePath();
  }

  get name(): string {
    return "claude-md";
  }

  getPath(): string {
    return this.path;
  }

  async read(): Promise<string> {
    // Implementation
  }

  async append(content: string): Promise<void> {
    // Implementation
  }

  private resolvePath(): string {
    // Implementation
  }

  private formatEntry(observation: string): string {
    // Implementation
  }

  private validateContent(content: string): boolean {
    // Implementation
  }
}
```

#### Key Methods

**resolvePath()**
- Check environment/config for path override
- Look for project-level `.claude/CLAUDE.md`
- Fall back to `~/.claude/CLAUDE.md`
- Use `path.expandHome()` or equivalent for tilde expansion

**read()**
- Use `Bun.file()` for efficient reading
- Return empty string if file doesn't exist
- Handle encoding issues gracefully

**append(content: string)**
- Validate content before writing
- Create directory if needed
- Use append mode to prevent overwrites
- Add newline before new content if file is non-empty
- Add timestamp comment or metadata if appropriate

**formatEntry(observation: string)**
- Convert observation object to markdown bullet point
- Include optional metadata (date, source session)
- Ensure consistent formatting

**validateContent(content: string)**
- Check for minimum length
- Verify no duplicate entries
- Ensure valid markdown syntax
- Return boolean or throw validation error

### File Format

Expected CLAUDE.md structure:

```markdown
# Memory File for Claude Code Sessions

## User Preferences
- [preference entries]

## Coding Patterns
- [pattern entries]

## Tools & Commands
- [tool preferences]

## Project-Specific Notes
- [project notes]
```

### Error Handling Strategy

```typescript
class ClaudeMdError extends Error {
  constructor(
    message: string,
    public readonly path: string,
    public readonly context?: Record<string, any>
  ) {
    super(`ClaudeMdAdapter: ${message} (${path})`);
  }
}
```

Specific error cases:

```typescript
// Path resolution fails
throw new ClaudeMdError(
  "Could not resolve CLAUDE.md path",
  attemptedPaths[attemptedPaths.length - 1]
);

// Permission denied
throw new ClaudeMdError(
  "Permission denied reading/writing CLAUDE.md. Run 'chmod u+rw' to fix.",
  path,
  { errno: 13, syscall: "open" }
);

// Content validation fails
throw new ClaudeMdError(
  "Invalid content for CLAUDE.md",
  path,
  { reason: "Contains control characters" }
);
```

---

## Implementation Steps

### Step 1: Create Base Class

- Create `src/adapters/memory/ClaudeMd.ts`
- Implement interface skeleton
- Set up path resolution logic
- Add constructor and properties

### Step 2: Implement File Operations

- Implement `read()` using Bun.file()
- Handle non-existent files
- Add error handling for I/O operations
- Test with temporary files

### Step 3: Implement Append Logic

- Implement `append()` method
- Add content formatting
- Ensure proper line breaks and spacing
- Handle edge cases (empty file, existing content)

### Step 4: Add Validation

- Implement `validateContent()` method
- Check for duplicates
- Validate markdown syntax
- Add length/format constraints

### Step 5: Error Handling

- Create custom error class `ClaudeMdError`
- Implement comprehensive error handling
- Add helpful error messages
- Test error scenarios

### Step 6: Testing

- Write unit tests in `tests/adapters/memory/ClaudeMd.test.ts`
- Test path resolution logic
- Test read/append operations
- Test error handling
- Test with various CLAUDE.md formats
- Mock file system for safety

---

## Acceptance Criteria

### Functional
- [ ] Implements `CoreMemoryAdapter` interface completely
- [ ] Correctly resolves CLAUDE.md path (global and project-level)
- [ ] Reads existing CLAUDE.md without errors
- [ ] Safely appends content to CLAUDE.md
- [ ] Handles non-existent CLAUDE.md gracefully
- [ ] Validates content before writing
- [ ] Preserves existing content on append
- [ ] Formats entries consistently

### Error Handling
- [ ] Throws descriptive errors for I/O failures
- [ ] Handles permission denied gracefully
- [ ] Handles disk full gracefully
- [ ] Never corrupts existing file
- [ ] Logs operations appropriately

### Testing
- [ ] Unit tests for all public methods
- [ ] Tests for path resolution logic
- [ ] Tests for file operations with mock files
- [ ] Tests for error scenarios
- [ ] Tests for concurrent access safety

### Code Quality
- [ ] Follows TypeScript strict mode
- [ ] Uses Bun APIs appropriately
- [ ] Has inline documentation for complex logic
- [ ] No console.log() (use logger)
- [ ] Proper error types and messages

### Integration
- [ ] Works with 004-010 CoreMemoryAdapter interface
- [ ] Ready for 004-012 (AgentsMdAdapter) to follow same pattern
- [ ] Ready for 004-013 (PromotionList) to use via MemoryHierarchy
- [ ] Compatible with MemoryHierarchy promotion logic

---

## Examples

### Example 1: Simple Append

```typescript
const adapter = new ClaudeMdAdapter();

// Read current content
const existing = await adapter.read();
console.log("Existing content:", existing);

// Append new observation
await adapter.append("- Prefers using async/await over Promise chains");

// Verify
const updated = await adapter.read();
console.log("Updated content:", updated);
```

### Example 2: Path Override (Testing)

```typescript
import { existsSync, unlinkSync } from "fs";

const testPath = "/tmp/test-claude.md";
if (existsSync(testPath)) unlinkSync(testPath);

const adapter = new ClaudeMdAdapter(testPath);
await adapter.append("- Test entry");

const content = await adapter.read();
assert(content.includes("Test entry"));
```

### Example 3: Error Handling

```typescript
try {
  const adapter = new ClaudeMdAdapter("/root/CLAUDE.md"); // Permission denied
  await adapter.append("- New entry");
} catch (err) {
  if (err instanceof ClaudeMdError) {
    console.error(`Failed: ${err.message}`);
    console.error(`Path: ${err.path}`);
    console.error(`Details: ${JSON.stringify(err.context)}`);
  }
}
```

---

## Related Tasks

**Depends On**:
- 004-010: Define CoreMemoryAdapter interface (blocks this task)

**Blocked By**:
- 004-013: Create PromotionList view (needs this task)
- 004-014: Implement review command (transitively needs this)

**Related (Similar Pattern)**:
- 004-012: Implement AgentsMdAdapter (same pattern, different target)

---

## Open Questions

1. **Project-level CLAUDE.md**: Should the adapter support project-level files in v1, or only global?
   - Current Design: Falls back to project-level if found, otherwise global
   - Alternative: Always use global in v1, add per-project support in v2

2. **Content Deduplication**: Should the adapter check for duplicates before appending?
   - Current Design: Validation checks, but doesn't auto-deduplicate
   - Alternative: Read → parse → check → append logic

3. **Section Organization**: Should entries be grouped by section (Preferences, Patterns, etc.)?
   - Current Design: Append to end; section organization is user's responsibility
   - Alternative: Parse sections and insert into matching section

4. **Timestamp/Metadata**: Should each appended entry include a timestamp or source reference?
   - Current Design: Plain markdown, let MemoryHierarchy decide metadata
   - Alternative: Include "[sanj: 2026-01-26]" comment with each entry

---

## Resources

- **Interface Definition**: `src/adapters/memory/CoreMemoryAdapter.ts` (from 004-010)
- **Types**: `src/core/types.ts` (defines Observation, Memory types)
- **Storage Paths**: `src/storage/paths.ts` (may include Claude.md path constants)
- **Config**: `src/storage/config.ts` (may include memory path configuration)
- **Related Adapter**: `src/adapters/memory/AgentsMd.ts` (see 004-012 for parallel implementation)
