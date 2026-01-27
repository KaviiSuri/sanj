# Spec: 004-010 - Define CoreMemoryAdapter Interface

**Task ID**: 004-010
**JTBD**: 004 - Review & Approve Observations (TUI)
**Depends On**: 003-001 (Define core types)
**Blocks**: 004-011 (Implement ClaudeMdAdapter), 004-012 (Implement AgentsMdAdapter)
**Status**: Pending

---

## Overview

Define the `CoreMemoryAdapter` interface that abstracts writing to final memory destinations (CLAUDE.md and AGENTS.md). This interface enables multiple implementations to write memory content to different formats and locations while maintaining a consistent contract.

## Purpose

The `CoreMemoryAdapter` interface is the abstraction layer between the promotion logic and the actual memory files. It allows the TUI and MemoryHierarchy to promote observations to core memory without knowing the specifics of which file gets written or how.

## Requirements

### Interface Definition

The `CoreMemoryAdapter` interface must define the following contract:

```typescript
interface CoreMemoryAdapter {
  name: string;
  getPath(): string;
  read(): Promise<string>;
  append(content: string): Promise<void>;
}
```

### Property: `name`

- **Type**: `string`
- **Purpose**: Unique identifier for the adapter
- **Examples**: `"claude-md"`, `"agents-md"`
- **Usage**: For logging, debugging, and user-facing messages

### Method: `getPath()`

- **Signature**: `(): string`
- **Purpose**: Return the absolute file path this adapter writes to
- **Returns**: Full filesystem path (e.g., `/Users/username/.claude/CLAUDE.md`)
- **Behavior**: Synchronous operation; should not perform I/O
- **Use Cases**:
  - Display to user which file will be modified
  - Validate file permissions before attempting write
  - Construct backup paths for error recovery

### Method: `read()`

- **Signature**: `(): Promise<string>`
- **Purpose**: Read current content of the memory file
- **Returns**: File content as string; empty string if file doesn't exist yet
- **Throws**: May throw if read fails (caller responsible for error handling)
- **Behavior**:
  - Should create file with minimal content if it doesn't exist (optional)
  - Should handle symlinks transparently
  - Should preserve file encoding (UTF-8)

### Method: `append(content: string)`

- **Signature**: `(content: string): Promise<void>`
- **Purpose**: Append formatted memory content to the file
- **Parameters**:
  - `content`: Markdown-formatted content to append (should include newlines as needed)
- **Throws**: May throw if write fails
- **Behavior**:
  - Should append to end of file with appropriate spacing
  - Should not truncate or overwrite existing content
  - Should add newline between existing content and new content if needed
  - Should be atomic or handle partial writes gracefully
  - Should preserve file structure (e.g., headers, sections)

---

## Implementation Scope

### What This Task Covers

1. TypeScript interface definition in `src/adapters/memory/CoreMemoryAdapter.ts`
2. Clear documentation of expected behavior for each method
3. Type definitions for integration with MemoryHierarchy
4. Comments explaining the design rationale

### What This Task Does NOT Cover

- Implementation of `ClaudeMdAdapter` (task 004-011)
- Implementation of `AgentsMdAdapter` (task 004-012)
- Integration with the TUI (handled in 004-013)
- Actual file I/O logic (deferred to implementations)

---

## Design Decisions

### Why `read()` is included

Even though the primary responsibility is appending, `read()` allows implementations to:
- Validate file structure before appending
- Support future features like diff preview
- Enable safer append operations by checking current content

### Why `getPath()` returns a string, not a Path object

Simplicity and cross-platform compatibility. String paths can be easily displayed, validated, or transformed by callers.

### Promise-based async I/O

Both `read()` and `append()` are async to:
- Support non-blocking I/O even for local files
- Maintain compatibility with Deno/Bun APIs
- Allow future implementations to use network or remote storage

---

## Context From Architecture

From the HLD, CoreMemoryAdapters sit at the bottom of the adapter layer:

```
┌─────────────────────────────────────────────────────────────────┐
│                        Adapter Layer                            │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │ SessionAdapter  │  │   LLMAdapter    │  │CoreMemoryAdapter│  │
│  │ (interface)     │  │ (interface)     │  │ (interface)     │  │
│  ├─────────────────┤  ├─────────────────┤  ├─────────────────┤  │
│  │ ClaudeCode      │  │ OpenCodeLLM     │  │ ClaudeMd        │  │
│  │ OpenCode        │  │ (future:Claude) │  │ AgentsMd        │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

This adapter is consumed by:
- `MemoryHierarchy` (for promotion)
- `PromotionList` TUI component (for preview before write)

---

## File Location

**Path**: `/src/adapters/memory/CoreMemoryAdapter.ts`

**Related Files**:
- `src/core/types.ts` - Imports Observation type (from 003-001)
- `src/adapters/memory/ClaudeMd.ts` - First implementation (task 004-011)
- `src/adapters/memory/AgentsMd.ts` - Second implementation (task 004-012)

---

## Acceptance Criteria

- [ ] `CoreMemoryAdapter.ts` file exists at `/src/adapters/memory/CoreMemoryAdapter.ts`
- [ ] Interface includes `name`, `getPath()`, `read()`, and `append()` members
- [ ] All members are properly typed with clear return types
- [ ] Documentation comments explain each member's purpose and behavior
- [ ] Interface is exported for use by other modules
- [ ] TypeScript compilation succeeds with no errors
- [ ] Code follows existing sanj codebase conventions (imports, formatting, naming)

---

## Testing Notes

This is an interface definition, so no unit tests are required for this task. However:

- The `ClaudeMdAdapter` tests (004-011) will verify the interface contract
- The `AgentsMdAdapter` tests (004-012) will verify the interface contract
- The `MemoryHierarchy` tests (004-015) will mock this adapter

---

## Related Documentation

- **JTBD-004**: Review & Approve Observations (TUI) - `/projects/sanj-v1/03-jtbd.md`
- **HLD Section**: Adapter Layer - `/projects/sanj-v1/05-hld.md` (lines 139-186)
- **Task Dependencies**: `/projects/sanj-v1/04-tasks.md` (JTBD-004 task matrix)

---

## Implementation Hints

1. Start by reviewing the existing `SessionAdapter` and `LLMAdapter` interfaces (from task 003-002 and 003-005) for pattern consistency
2. Consider whether `append()` should accept format hints or just plain Markdown
3. Think about error cases: what if file doesn't exist? What if permissions are denied?
4. File paths might need expansion (e.g., `~` to home directory) - decide if adapter or caller handles this

---

## Notes for Implementer

- Keep the interface minimal and focused on the core responsibility (reading/appending to memory files)
- This is the top of the adapter hierarchy for memory, so it should be the simplest abstraction
- The interface should be implementation-agnostic (no Claude-specific or OpenCode-specific details)
- Consider future extensions (e.g., project-scoped memory files) but don't over-engineer for v1
