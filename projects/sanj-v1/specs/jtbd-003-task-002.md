# Task Specification: 003-002 - Define SessionAdapter Interface

**JTBD**: 003 - Session Analysis & Pattern Capture
**Task ID**: 003-002
**Priority**: Core architecture
**Dependencies**: 003-001 (Define core types)
**Blocks**: 003-003, 003-004

---

## Overview

Define the `SessionAdapter` interface that will be used to abstract reading conversation history from different AI coding assistant tools (Claude Code and OpenCode). This is a foundational interface for the adapter pattern that enables cross-tool compatibility.

---

## Context

From the research and design docs:

- **Session Storage**: Different tools store sessions in different locations and formats
  - Claude Code: `~/.claude/projects/{project-slug}/{session-id}.jsonl` (JSONL format)
  - OpenCode: `~/.local/share/opencode/storage/session/{projectHash}/{sessionID}.json` (JSON/SQLite)

- **Core Responsibility**: The `SessionAdapter` interface abstracts away these implementation differences so the `AnalysisEngine` can work with sessions from any tool uniformly.

- **Architecture Pattern**: The adapter pattern allows adding new tools (e.g., future support for other AI assistants) without modifying core analysis logic.

---

## Requirements

### Functional Requirements

1. **Interface Definition**
   - Define `SessionAdapter` interface in `src/adapters/session/SessionAdapter.ts`
   - Each adapter instance represents a specific tool integration

2. **Core Methods**
   - `name: string` - Human-readable name (e.g., "Claude Code", "OpenCode")
   - `isAvailable(): Promise<boolean>` - Check if the tool is installed and accessible
   - `getSessions(since?: Date): Promise<Session[]>` - Retrieve sessions, optionally filtered by date

3. **Session Data Structure**
   - Adapters return `Session[]` objects
   - Session structure should be defined in `src/core/types.ts` (from 003-001)
   - A `Session` should include:
     - `id: string` - Unique session identifier
     - `toolName: string` - Name of the tool (Claude Code, OpenCode)
     - `projectPath: string` - Path to the project (if available)
     - `timestamp: Date` - When the session occurred
     - `content: string` - The conversation/session content as a single string
     - `filePath: string` - Where the session file is located (for reference/debugging)

4. **Date Filtering**
   - `getSessions(since?: Date)` parameter is optional
   - If `since` is provided, only return sessions after that timestamp
   - If `since` is omitted, return all sessions (or a reasonable default window like last 30 days)

### Non-Functional Requirements

1. **Type Safety**
   - Full TypeScript typing with no `any` types
   - Exported from `src/adapters/session/SessionAdapter.ts`

2. **Error Handling**
   - Methods should be async to support I/O operations
   - Methods should not throw; instead return empty arrays or `false` for availability checks
   - Callers (like `AnalysisEngine`) handle retry logic and error reporting

3. **Documentation**
   - Include JSDoc comments for the interface and all methods
   - Explain what each method does and what callers should expect

---

## Specification

### File: `src/adapters/session/SessionAdapter.ts`

```typescript
/**
 * Adapter interface for reading conversation history from different AI coding assistant tools.
 * Implementations abstract away tool-specific file locations, formats, and APIs.
 */
export interface SessionAdapter {
  /**
   * Human-readable name of the adapter (e.g., "Claude Code", "OpenCode").
   */
  name: string;

  /**
   * Check if this adapter's tool is available on the system.
   *
   * @returns true if the tool is installed and accessible, false otherwise
   */
  isAvailable(): Promise<boolean>;

  /**
   * Retrieve sessions from this tool.
   *
   * @param since - Optional date filter. If provided, only return sessions after this timestamp.
   * @returns Array of Session objects. Empty array if no sessions found or tool unavailable.
   */
  getSessions(since?: Date): Promise<Session[]>;
}

/**
 * Represents a single session/conversation with an AI assistant.
 */
export interface Session {
  /**
   * Unique identifier for this session.
   * Format depends on the tool (e.g., UUID for Claude Code, hash for OpenCode).
   */
  id: string;

  /**
   * Name of the tool that generated this session.
   * Should match the SessionAdapter's name property.
   */
  toolName: string;

  /**
   * Path to the project this session was created in, if applicable.
   * May be undefined for sessions not tied to a specific project.
   */
  projectPath?: string;

  /**
   * When this session occurred (usually when it was created or last modified).
   */
  timestamp: Date;

  /**
   * The complete conversation content as a single string.
   * For JSONL files, this should be the concatenated content of all messages.
   * For JSON files, extract and format the conversation appropriately.
   */
  content: string;

  /**
   * File path where this session is stored.
   * Useful for debugging and maintaining references back to the source.
   */
  filePath: string;
}
```

---

## Implementation Notes

### Design Decisions

1. **Async Methods**
   - All methods are async (`Promise<T>`) to support file I/O without blocking
   - Allows future enhancement with network-based adapters

2. **Graceful Degradation**
   - `isAvailable()` returns `false` rather than throwing
   - `getSessions()` returns empty array rather than throwing
   - `AnalysisEngine` responsibility is to handle absence/empty results

3. **Content Format**
   - The `content` field is a single string (not structured)
   - This is because the LLMAdapter will receive raw text and do pattern extraction
   - Individual adapters handle parsing their native formats

4. **Session Filtering**
   - Optional `since` parameter allows flexibility
   - Implementations can choose reasonable defaults (e.g., last 30 days if no filter)
   - Allows `AnalysisEngine` to optimize by requesting only recent sessions

5. **Metadata Retention**
   - `filePath` included for debugging and audit trail
   - `projectPath` optional because OpenCode might not have per-project sessions
   - `toolName` redundant with adapter context but useful for session records

### Future Extensibility

This interface is designed for easy extension:

- **New Tools**: Add new implementations (e.g., `CopilotSessionAdapter`)
- **New Metadata**: Add fields to `Session` without breaking existing adapters
- **Enhanced Filtering**: Future versions could add `getSessions(filter: SessionFilter)` for more complex queries

---

## Testing Considerations

1. **Mock Implementation**
   - Create a `MockSessionAdapter` for testing `AnalysisEngine`
   - Should be able to control `isAvailable()` return value
   - Should be able to return predefined test sessions

2. **Availability Checks**
   - `isAvailable()` tests verify tool detection logic
   - Should test both installed and not-installed scenarios

3. **Session Retrieval**
   - Test with empty session list
   - Test with multiple sessions
   - Test with and without date filtering

---

## Acceptance Criteria

- [ ] `SessionAdapter` interface is defined in `src/adapters/session/SessionAdapter.ts`
- [ ] `Session` interface is defined with all required fields
- [ ] All interfaces and methods have JSDoc comments
- [ ] File compiles without TypeScript errors
- [ ] Interface is exported and can be imported by 003-003 and 003-004
- [ ] No `any` types used anywhere in the interfaces
- [ ] `src/core/types.ts` is updated if `Session` type needs to be referenced elsewhere

---

## Related Files

- **Depends On**: `/Users/kaviisuri/code/KaviiSuri/sanj/projects/sanj-v1/specs/jtbd-003-task-001.md`
- **Blocks**:
  - `/Users/kaviisuri/code/KaviiSuri/sanj/projects/sanj-v1/specs/jtbd-003-task-003.md` (ClaudeCodeSessionAdapter)
  - `/Users/kaviisuri/code/KaviiSuri/sanj/projects/sanj-v1/specs/jtbd-003-task-004.md` (OpenCodeSessionAdapter)
- **HLD Reference**: `/Users/kaviisuri/code/KaviiSuri/sanj/projects/sanj-v1/05-hld.md` - Adapter Layer (lines 143-155)
- **Task Breakdown**: `/Users/kaviisuri/code/KaviiSuri/sanj/projects/sanj-v1/04-tasks.md` - JTBD-003 Task List

---

## Summary

This task establishes the `SessionAdapter` interface, a critical abstraction that will enable Sanj to work with multiple AI assistant tools. By defining a clear contract, implementations for Claude Code and OpenCode can develop independently while the core `AnalysisEngine` remains tool-agnostic. The interface is intentionally simple—just availability checking and session retrieval—leaving content parsing and pattern extraction to downstream components.
