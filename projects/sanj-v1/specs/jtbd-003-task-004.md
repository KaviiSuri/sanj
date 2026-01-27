# Spec: Task 003-004 - Implement OpenCodeSessionAdapter

**Task ID**: 003-004
**JTBD**: 003 - Session Analysis & Pattern Capture
**Depends On**: 003-002 (Define SessionAdapter interface)
**Status**: Pending

---

## Overview

Implement `OpenCodeSessionAdapter` to read and parse coding sessions from OpenCode's local storage. This adapter will be one of two session ingestion mechanisms (the other being `ClaudeCodeSessionAdapter` in task 003-003) and will enable Sanj to capture patterns from OpenCode sessions during analysis.

---

## Context

### OpenCode Storage Location

OpenCode stores sessions at:
```
~/.local/share/opencode/storage/session/{projectHash}/{sessionID}.json
```

Sessions are stored as individual JSON files, where each file contains the full session data including:
- Metadata (timestamps, project info)
- Conversation messages (user and assistant)
- Tool calls and results
- Session metadata (duration, tokens used, etc.)

### SessionAdapter Interface

The `OpenCodeSessionAdapter` must implement the `SessionAdapter` interface defined in task 003-002:

```typescript
interface SessionAdapter {
  name: string;
  isAvailable(): Promise<boolean>;
  getSessions(since?: Date): Promise<Session[]>;
}
```

### Session Type

Sessions must conform to the `Session` type defined in `src/core/types.ts`:

```typescript
interface Session {
  id: string;
  toolName: string; // "opencode" or "claude-code"
  projectId?: string;
  timestamp: Date;
  messages: Message[]; // Full conversation history
  metadata?: Record<string, any>;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp?: Date;
  toolCalls?: ToolCall[];
}
```

---

## Requirements

### Functional Requirements

1. **Availability Check**
   - Implement `isAvailable()` to check if OpenCode is installed and accessible
   - Check for presence of `~/.local/share/opencode/` directory
   - Return `true` if OpenCode storage directory exists, `false` otherwise
   - Should not throw errors; return `false` gracefully if directory doesn't exist

2. **Session Discovery**
   - Implement `getSessions(since?: Date)` to discover and read OpenCode sessions
   - Scan the `~/.local/share/opencode/storage/session/` directory recursively
   - Find all `{sessionID}.json` files within project hash subdirectories
   - If `since` parameter provided: only return sessions modified after that timestamp
   - If `since` not provided: return all sessions
   - Return sorted by timestamp (newest first)

3. **JSON Parsing**
   - Read and parse each session JSON file
   - Extract session ID from filename
   - Extract project hash from directory structure
   - Handle malformed JSON gracefully (log warning, skip file)

4. **Message Extraction**
   - Convert OpenCode's native message format to `Message[]` type
   - Extract user and assistant messages from session data
   - Preserve message order and timestamps if available
   - Handle tool calls if present in OpenCode session format

5. **Session Mapping**
   - Map OpenCode session data to `Session` type:
     - `id`: sessionID from filename
     - `toolName`: "opencode"
     - `projectId`: projectHash from directory structure
     - `timestamp`: session creation or last modified timestamp
     - `messages`: extracted messages
     - `metadata`: store original session metadata (token count, duration, etc.)

### Non-Functional Requirements

1. **Performance**
   - Efficiently scan directory structure without loading all files into memory
   - Use streaming or lazy evaluation where possible
   - Cache directory listings for repeated calls within same execution

2. **Error Handling**
   - Gracefully handle missing directories
   - Skip corrupted JSON files with logged warning
   - Return empty array rather than throwing errors when no sessions found
   - Log errors for debugging but don't propagate to caller

3. **Testability**
   - All file I/O should be testable via mocking
   - Consider extracting path logic into injected dependency
   - Support providing custom base path for testing

---

## Implementation Details

### File Structure

Create new file: `/src/adapters/session/OpenCodeSession.ts`

### Class Definition

```typescript
export class OpenCodeSessionAdapter implements SessionAdapter {
  readonly name = "opencode";

  private basePath: string; // For testability

  constructor(basePath?: string) {
    this.basePath = basePath || expandHome("~/.local/share/opencode/storage/session");
  }

  async isAvailable(): Promise<boolean> {
    // Implementation
  }

  async getSessions(since?: Date): Promise<Session[]> {
    // Implementation
  }

  private async scanSessionDirectory(dir: string): Promise<string[]> {
    // Helper to recursively find all session JSON files
  }

  private async parseSessionFile(filePath: string): Promise<Session | null> {
    // Helper to parse single session file
  }

  private extractMessages(sessionData: any): Message[] {
    // Helper to convert OpenCode message format to Message[]
  }
}
```

### Helper Utilities

May need utility functions for:
- Path expansion (`~` to home directory)
- File system operations with error handling
- Timestamp comparison for filtering
- JSON parsing with error recovery

Consider adding to `src/storage/paths.ts` or creating `src/utils/fs.ts`:

```typescript
export function expandHome(path: string): string {
  // Expand ~ to user home directory
}

export async function fileExists(path: string): Promise<boolean> {
  // Check if file/directory exists without throwing
}

export async function listDirectoriesRecursive(
  basePath: string,
  maxDepth?: number
): Promise<string[]> {
  // Find all directories, respecting depth limit
}
```

---

## Dependencies

- `src/core/types.ts` - `Session` and `Message` types
- `src/adapters/session/SessionAdapter.ts` - Interface implementation
- File system APIs (Bun's native fs or Node.js compatibility)
- Path utilities (standard lib)

---

## Testing Strategy

### Unit Tests

Create: `tests/adapters/OpenCodeSession.test.ts`

Test cases:
1. `isAvailable()` returns true when directory exists
2. `isAvailable()` returns false when directory doesn't exist
3. `getSessions()` discovers all session files in nested directories
4. `getSessions()` filters by `since` timestamp correctly
5. `getSessions()` returns empty array when no sessions found
6. Session data is correctly mapped to `Session` type
7. Messages are extracted and ordered correctly
8. Handles malformed JSON without throwing
9. Handles missing or empty directories gracefully
10. Sessions are returned sorted by timestamp (newest first)

### Mock Structure

Create test fixtures in `tests/fixtures/opencode-sessions/`:
```
tests/fixtures/opencode-sessions/
├── project-hash-1/
│   ├── session-1.json
│   └── session-2.json
├── project-hash-2/
│   └── session-3.json
└── corrupt-project/
    └── malformed.json (invalid JSON)
```

---

## Acceptance Criteria

- [ ] `OpenCodeSessionAdapter` class is exported from `src/adapters/session/OpenCodeSession.ts`
- [ ] Implements complete `SessionAdapter` interface
- [ ] `isAvailable()` correctly detects OpenCode installation
- [ ] `getSessions()` discovers sessions in nested directory structure
- [ ] `getSessions(since)` filters by timestamp correctly
- [ ] Sessions are mapped to `Session` type with all fields populated
- [ ] Handles errors gracefully without throwing
- [ ] All unit tests pass
- [ ] Code follows project TypeScript style
- [ ] No console.log calls; use logger if available

---

## Related Tasks

- **003-002**: Define SessionAdapter interface (dependency)
- **003-003**: Implement ClaudeCodeSessionAdapter (parallel)
- **003-011**: Implement AnalysisEngine (consumer)
- **003-012**: Implement analyze command (consumer)

---

## Notes

- This adapter should mirror the structure of `ClaudeCodeSessionAdapter` for consistency
- Focus on robustness; sessions from user's real usage may have unexpected formats
- Consider edge cases: empty sessions, very large session files, nested directory structures
- The `since` parameter enables incremental analysis; optimize for this common case
- Future versions might support per-project configuration; design with this in mind
