# Spec: 003-003 - Implement ClaudeCodeSessionAdapter

## Overview

Implement `ClaudeCodeSessionAdapter`, a concrete implementation of the `SessionAdapter` interface that reads session data from Claude Code's storage directory at `~/.claude/projects/`.

**Task ID**: 003-003
**JTBD**: 003 - Session Analysis & Pattern Capture
**Depends On**: 003-002 (SessionAdapter interface definition)
**Blocks**: 003-011 (AnalysisEngine)

---

## Context

### Claude Code Session Storage

Claude Code stores session history in:
```
~/.claude/projects/{project-slug}/{session-id}.jsonl
```

Where:
- `{project-slug}` is a URL-slug version of the project name (e.g., `my-project`)
- `{session-id}` is a unique identifier (format TBD during implementation)
- Each file contains JSONL (JSON Lines): one JSON object per line

### What We Need to Read

Each line in a JSONL file represents an event in the conversation. We need to:
1. Identify conversation/message boundaries
2. Extract the actual conversation content (user prompts and assistant responses)
3. Parse timestamps to filter sessions by recency
4. Group messages into a coherent "session" object

### Expected Session Object

```typescript
interface Session {
  id: string;
  tool: 'claude-code' | 'opencode';
  projectSlug: string;
  createdAt: Date;
  updatedAt: Date;
  messages: Message[];
  rawContent: string; // Full conversation for LLM analysis
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}
```

---

## Requirements

### Functional Requirements

1. **Implement SessionAdapter Interface**
   - Must implement the `SessionAdapter` interface defined in 003-002
   - Must have `name: string` property set to `"claude-code"`
   - Must implement `isAvailable(): Promise<boolean>`
   - Must implement `getSessions(since?: Date): Promise<Session[]>`

2. **Directory Traversal**
   - Traverse `~/.claude/projects/` recursively
   - Identify all `.jsonl` files
   - Handle case where directory doesn't exist (return empty array)
   - Handle permission errors gracefully

3. **Session Discovery**
   - Each `.jsonl` file represents one session
   - Extract `projectSlug` from parent directory name
   - Extract `session-id` from filename
   - Skip hidden directories (starting with `.`)

4. **JSONL Parsing**
   - Read and parse each JSONL file line-by-line
   - Each line must be valid JSON
   - Skip malformed lines with a warning
   - Handle empty files gracefully

5. **Timestamp Extraction**
   - Parse `createdAt` and `updatedAt` from JSONL events
   - Support `since?: Date` parameter to filter recent sessions
   - If `since` is provided, only return sessions where `updatedAt >= since`
   - If no timestamp found, use file modification time as fallback

6. **Message Extraction**
   - Reconstruct message history from JSONL events
   - Identify user messages and assistant responses
   - Extract message content and timestamps
   - Build `rawContent` as concatenated conversation for LLM processing

7. **Error Handling**
   - Invalid JSONL: log warning, skip line, continue processing
   - Permission denied on directory: log warning, skip directory
   - Corrupted session file: log warning, skip file
   - Never throw exceptions; always return partial results

### Non-Functional Requirements

1. **Performance**
   - Efficiently handle large session directories (100+ projects, 1000+ sessions)
   - Lazy-load content only when `getSessions()` is called
   - Use streaming/line-by-line reading for large JSONL files

2. **Robustness**
   - Handle missing/empty directories gracefully
   - Support filesystem edge cases (symlinks, permission denied)
   - Log all errors without throwing

3. **Testability**
   - Pure functions where possible
   - Dependency injection for file system operations (for mocking)
   - Clear separation of concerns

---

## Implementation Details

### File Structure

```typescript
src/adapters/session/ClaudeCodeSession.ts
```

### Class Definition

```typescript
export class ClaudeCodeSessionAdapter implements SessionAdapter {
  name = 'claude-code';

  /**
   * Check if Claude Code is available on this system.
   * Returns true if ~/.claude/projects/ directory exists.
   */
  async isAvailable(): Promise<boolean> {
    // Implementation
  }

  /**
   * Get all sessions from Claude Code, optionally filtered by recency.
   * @param since - Only return sessions updated after this date
   * @returns Array of Session objects
   */
  async getSessions(since?: Date): Promise<Session[]> {
    // Implementation
  }

  // Private helper methods
  private async findProjectDirectories(): Promise<string[]> {
    // Recursively find all project directories
  }

  private async findSessionFiles(projectDir: string): Promise<string[]> {
    // Find all .jsonl files in a project directory
  }

  private async parseSessionFile(
    filePath: string,
    projectSlug: string,
    sessionId: string
  ): Promise<Session | null> {
    // Parse a single .jsonl file into a Session object
  }

  private parseJsonLine(line: string): Record<string, unknown> | null {
    // Parse a single JSONL line
  }

  private extractMessages(events: Record<string, unknown>[]): Message[] {
    // Convert raw events to Message array
  }
}
```

### JSONL Format Assumptions

During implementation, investigate and document:

1. **Event Structure**: What fields are present in each event?
   - Typical fields: `type`, `role`, `content`, `timestamp`, `id`, etc.

2. **Message Identification**: How are user vs assistant messages identified?
   - May use `role` field with values like `"user"` or `"assistant"`
   - May use `type` field with values like `"message"` or `"response"`

3. **Timestamps**: How are timestamps represented?
   - ISO 8601 format? Unix timestamps? Custom format?
   - What field names? (`timestamp`, `createdAt`, `date`, etc.)

4. **Session Boundaries**: How do we know when a new session starts?
   - Each file is one session?
   - Session marked by special event?
   - New session starts when timestamp gap exceeds threshold?

### Key Implementation Notes

1. **Path Resolution**
   - Use `path.join(os.homedir(), '.claude', 'projects')` for the base path
   - Use `path.relative()` to compute project slugs

2. **Filtering by `since`**
   - Implement efficient filtering to avoid loading all sessions into memory
   - Can use file modification times as a first-pass filter

3. **Logging**
   - Use consistent logging for debugging
   - Include context: filename, line number, error type
   - Should be suitable for cron job execution (no prompts)

4. **Message Concatenation**
   - Build `rawContent` by joining messages in order: `{role}: {content}`
   - Include message timestamps in comments for context
   - Aim for a format suitable for LLM analysis

---

## Testing Strategy

### Unit Tests (003-013, future)

1. **Happy Path**
   - Fixture: Valid JSONL file with 2-3 messages
   - Assert: Correct Session object with all messages parsed
   - Assert: Timestamps extracted correctly

2. **Filter by `since`**
   - Fixture: Multiple sessions with different timestamps
   - Call: `getSessions(since: Date)` where Date is in the middle
   - Assert: Only sessions after the date are returned

3. **Malformed JSONL**
   - Fixture: File with invalid JSON on line 3
   - Assert: Line 3 is skipped, other lines processed
   - Assert: Warning is logged

4. **Missing Directory**
   - Fixture: `~/.claude/projects/` doesn't exist
   - Call: `isAvailable()` should return false
   - Call: `getSessions()` should return empty array

5. **Permission Denied**
   - Fixture: Project directory with no read permission
   - Assert: Directory is skipped, other projects processed
   - Assert: Warning is logged

6. **Large Session**
   - Fixture: JSONL file with 1000+ lines
   - Assert: All lines are parsed
   - Assert: Memory usage is reasonable (no loading entire file at once)

### Integration Testing (future, manual for v1)

1. Run `sanj analyze` with real Claude Code sessions
2. Verify sessions are discovered correctly
3. Verify message parsing is accurate
4. Verify timestamps filter works

---

## Acceptance Criteria

- [ ] `ClaudeCodeSessionAdapter` class exists and implements `SessionAdapter`
- [ ] `name` property returns `"claude-code"`
- [ ] `isAvailable()` returns true only when `~/.claude/projects/` exists
- [ ] `getSessions()` discovers and reads all `.jsonl` files recursively
- [ ] JSONL files are parsed line-by-line without throwing on malformed JSON
- [ ] `Session` objects are constructed with correct structure:
  - `id` from filename
  - `projectSlug` from parent directory
  - `createdAt` and `updatedAt` from JSONL timestamps
  - `messages` array with role, content, timestamp
  - `rawContent` concatenation of all messages
- [ ] `since?: Date` filter works correctly (only returns sessions updated >= since)
- [ ] Errors are logged, not thrown (graceful degradation)
- [ ] Code is testable (dependency injection for file I/O)
- [ ] No external APIs called; purely local file system operations

---

## Dependencies

### Internal
- `SessionAdapter` interface (003-002)
- `Session` and `Message` types (003-001)

### External
- Node.js built-ins: `fs`, `path`, `os`
- TypeScript for type safety

### Assumptions
- JSONL format details (to be confirmed during implementation)
- File permissions are as expected in normal setup

---

## Out of Scope

- Automatic cron scheduling (handled by JTBD-007)
- LLM-based pattern extraction (handled by LLMAdapter)
- Observation deduplication (handled by ObservationStore)
- TUI display (handled by JTBD-004)
- Writing to memory files (handled by CoreMemoryAdapters)

---

## Implementation Checklist

### Code Structure
- [ ] Create `/Users/kaviisuri/code/KaviiSuri/sanj/src/adapters/session/ClaudeCodeSession.ts`
- [ ] Implement all interface methods
- [ ] Add comprehensive JSDoc comments
- [ ] Use TypeScript strict mode

### Error Handling
- [ ] Handle missing `.claude/projects/` directory
- [ ] Handle permission denied on directories/files
- [ ] Handle malformed JSONL gracefully
- [ ] Log all errors with context

### Testing
- [ ] Create test fixtures (sample JSONL files)
- [ ] Test happy path (valid session)
- [ ] Test edge cases (empty files, malformed JSON, missing timestamps)
- [ ] Test filtering by `since`

### Documentation
- [ ] JSDoc comments on class and public methods
- [ ] Explain JSONL format assumptions in code comments
- [ ] Document any deviations from SessionAdapter interface

### Integration
- [ ] Verify it integrates with 003-011 (AnalysisEngine)
- [ ] Ensure compatible with 003-004 (OpenCodeSessionAdapter)
- [ ] Verify config system can enable/disable it (JTBD-006)

---

## Related Tasks

| Task ID | Description | Relationship |
|---------|-------------|--------------|
| 003-001 | Define core types | Provides `Session`, `Message` types |
| 003-002 | Define SessionAdapter interface | Interface this class implements |
| 003-004 | Implement OpenCodeSessionAdapter | Parallel implementation for OpenCode |
| 003-005 | Define LLMAdapter interface | Consumes Sessions from this adapter |
| 003-011 | Implement AnalysisEngine | Orchestrates calls to this adapter |
| 003-012 | Implement analyze command | CLI entry point using AnalysisEngine |

---

## Notes

1. **JSONL Format Investigation**: The exact structure of Claude Code's JSONL format needs to be confirmed during implementation. Refer to research findings in 01-research.md or inspect a real session file.

2. **Session ID Strategy**: Confirm whether to use filename (without .jsonl) or extract from JSONL content.

3. **Timestamp Strategy**: If JSONL doesn't have explicit timestamps, fall back to file system metadata (mtime).

4. **Performance Consideration**: For the "analyze recent sessions" use case, consider caching the list of session files to avoid re-traversing the directory on every call.

5. **Future Enhancement**: Once session parsing is stable, consider adding a method to stream messages without loading the entire session into memory.
