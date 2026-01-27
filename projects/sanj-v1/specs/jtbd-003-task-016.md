# Specification: 003-016 - File System Watcher for New Sessions

## Overview

Implement a file system watcher that monitors `~/.claude` directory for new session directories and conversation file writes. This enables real-time detection of new coding sessions without requiring manual scanning.

**Task ID**: 003-016
**JTBD**: 003 - Session Analysis
**Depends On**: 003-015 (Session Metadata Extractor)
**Blocks**: 003-017 (Session Ingestion Service)

---

## Context

Sanj currently supports manual session discovery via `SessionDiscoveryService.discoverSessions()`, which scans the entire `~/.claude` directory tree. This approach works for periodic analysis but doesn't provide real-time detection of new sessions as they're created.

This task implements a file system watcher using **chokidar** to:
- Detect new session directories as they're created
- Monitor conversation.jsonl files for updates
- Emit events that trigger the session ingestion pipeline (TASK-018)
- Enable near real-time pattern capture without scheduled polling

**Why File Watching?**
- More efficient than periodic scanning for low-volume usage
- Enables immediate analysis of new sessions
- Supports future features like "analyze on session close"
- Reduces CPU usage compared to full directory scans

---

## Requirements

### Functional Requirements

1. **Watch Claude Directory**
   - Monitor `~/.claude` for new directory creation
   - Filter to only directories containing `.claudesettings.local.json`
   - Ignore temporary/editor files (e.g., `.DS_Store`, `.swp`)

2. **Watch Conversation Files**
   - Monitor `conversation.jsonl` files within session directories
   - Detect file writes (appends) for active sessions
   - Debounce rapid writes (minimize redundant events)

3. **Event Emission**
   - Emit `newSession` event when a valid session directory is detected
   - Emit `conversationUpdated` event when conversation.jsonl is modified
   - Include session path and metadata in event payload

4. **Graceful Error Handling**
   - Continue watching if individual directories are inaccessible
   - Log errors without crashing the watcher
   - Recover from temporary file system errors

5. **Lifecycle Management**
   - Support starting/stopping the watcher
   - Clean up resources on stop
   - Handle process termination (SIGINT, SIGTERM)

### Non-Functional Requirements

1. **Performance**
   - Watcher startup time: < 100ms
   - Event emission latency: < 500ms after file system change
   - Memory overhead: < 50MB
   - CPU usage during idle: < 1%

2. **Reliability**
   - Watcher stays running for extended periods (days)
   - Handles file system unmount/remount
   - Recovers from transient network errors (if watching network paths)

3. **Platform Compatibility**
   - Works on macOS (primary target)
   - Works on Linux
   - Graceful degradation on unsupported platforms

---

## Implementation Details

### FileWatcher Interface

```typescript
interface FileWatcherOptions {
  watchPath?: string;  // Default: ~/.claude
  debounceDelay?: number;  // Default: 1000ms
  ignoreInitial?: boolean;  // Default: false
}

interface SessionEvent {
  type: 'newSession' | 'conversationUpdated' | 'sessionClosed';
  sessionPath: string;
  sessionId: string;
  timestamp: Date;
}

interface FileWatcher {
  on(event: 'session', listener: (event: SessionEvent) => void): void;
  on(event: 'error', listener: (error: Error) => void): void;
  start(): Promise<void>;
  stop(): Promise<void>;
  isWatching(): boolean;
}
```

### Key Functions

**Constructor**: Initialize chokidar watcher with options
```typescript
constructor(options: FileWatcherOptions = {})
```

**start()**: Begin watching, optionally scan existing files
```typescript
async start(): Promise<void>
```

**stop()**: Stop watching, cleanup resources
```typescript
async stop(): Promise<void>
```

**on()**: Register event listeners
```typescript
on(event: 'session' | 'error', listener: Function): void
```

**isWatching()**: Check if watcher is active
```typescript
isWatching(): boolean
```

### Implementation Steps

1. **Initialize chokidar watcher**
   - Watch `~/.claude` recursively
   - Set up ignore patterns for temp files
   - Configure debounce delay for rapid writes

2. **Implement directory filtering**
   - Check for `.claudesettings.local.json` presence
   - Extract sessionId from directory path
   - Validate session structure

3. **Handle chokidar events**
   - `add` → New directory (check if valid session)
   - `change` → File modified (check if conversation.jsonl)
   - `error` → Log and emit error event

4. **Debounce conversation updates**
   - Multiple writes within debounceDelay → single event
   - Only emit after file stops changing

5. **Implement graceful shutdown**
   - Remove all event listeners
   - Close chokidar watcher
   - Cleanup any file handles

6. **Error handling**
   - Catch ENOENT (directory deleted mid-watch)
   - Catch EACCES (permission denied)
   - Catch ENOSPC (watch limit reached on Linux)

### Directory Structure

```
~/.claude/
├── projects/
│   ├── project-1/
│   │   ├── .claudesettings.local.json  ✓ Triggers newSession
│   │   ├── session-123/
│   │   │   └── conversation.jsonl      ✓ Emits conversationUpdated
│   │   └── session-456/
│   │       └── conversation.jsonl
│   └── project-2/
│       └── session-789/
│           └── conversation.jsonl
```

### Event Flow

```
User creates new session
    ↓
Directory created: ~/.claude/projects/foo/session-xyz/
    ↓
Watcher detects 'add' event for directory
    ↓
Check for .claudesettings.local.json
    ↓
[If valid session]
    ↓
Emit 'session' event: { type: 'newSession', sessionId: 'xyz', ... }
    ↓
SessionIngestionService (TASK-018) receives event
    ↓
Ingestion pipeline triggered
```

---

## Testing Strategy

### Unit Tests

1. **Watcher initialization**
   - Test default path resolution (~/.claude)
   - Test custom path support
   - Test debounce configuration

2. **New session detection**
   - Create session directory with .claudesettings.local.json
   - Verify 'session' event emitted with correct data
   - Verify sessionId extracted correctly

3. **Invalid directory filtering**
   - Create directory without .claudesettings.local.json
   - Verify NO event emitted
   - Verify directory ignored

4. **Conversation update detection**
   - Write to conversation.jsonl
   - Verify 'conversationUpdated' event emitted
   - Verify debouncing works (multiple writes → one event)

5. **Error handling**
   - Delete directory mid-watch
   - Verify watcher continues running
   - Verify error event emitted
   - Verify listener recovers

6. **Lifecycle management**
   - Test start() → isWatching() returns true
   - Test stop() → isWatching() returns false
   - Test cleanup on multiple start/stop cycles

7. **Platform edge cases**
   - Test on macOS and Linux (if possible)
   - Test with symlinks (if any)
   - Test with very large number of directories

### Integration Tests

1. **Session Discovery Integration**
   - Start watcher, create session
   - Verify SessionDiscoveryService can discover new session
   - Verify metadata extraction works

2. **Event Listener Integration**
   - Register multiple listeners
   - Verify all receive events
   - Verify no memory leaks

3. **Performance Tests**
   - Start watcher with 100 existing sessions
   - Measure startup time (< 100ms)
   - Measure memory overhead (< 50MB)

---

## Acceptance Criteria

- [ ] FileWatcher class implements interface with all methods
- [ ] Watches ~/.claude directory by default
- [ ] Detects new session directories (with .claudesettings.local.json)
- [ ] Ignores invalid directories (without .claudesettings.local.json)
- [ ] Detects conversation.jsonl updates with debouncing
- [ ] Emits 'session' events with correct payload (type, sessionId, path, timestamp)
- [ ] Emits 'error' events for file system errors
- [ ] Supports start() and stop() methods
- [ ] isWatching() returns correct state
- [ ] Gracefully handles permission errors
- [ ] Gracefully handles directory deletions
- [ ] Cleanup on stop() removes all listeners
- [ ] Works on macOS (primary target)
- [ ] Tests cover happy path and error cases (>80% coverage)
- [ ] Performance targets met (<100ms startup, <500ms event latency)

---

## Dependencies & Blockers

**Must be completed before**:
- 003-017: Session Ingestion Service (consumes events from watcher)

**Depends on**:
- 003-015: Session Metadata Extractor (uses for sessionId extraction)
- 003-014: Conversation Parser (validates conversation.jsonl structure)
- 003-016: Session Discovery Service (validates session directories)

**External Dependencies**:
- **chokidar**: File watching library (must be installed)
- **Bun**: Runtime for file system operations

---

## Related Files

**Files this task creates**:
- `src/services/file-watcher.ts` - Main FileWatcher implementation
- `tests/services/file-watcher.test.ts` - Comprehensive test suite

**Files this task uses**:
- `src/storage/paths.ts` - Path resolution constants
- `src/services/session-discovery.ts` - Session validation logic
- `src/core/types.ts` - Error types (SanjError)

**Files this task enables**:
- `src/services/session-ingestion.ts` - Consumes watcher events (003-017)

---

## Notes

### Debouncing Strategy
- Multiple writes to conversation.jsonl within `debounceDelay` (default 1000ms) → single event
- Uses chokidar's built-in `awaitWriteFinish` option for better performance
- Configurable via options parameter

### File System Error Handling
- **ENOENT**: Directory deleted mid-watch → log, emit error event, continue watching
- **EACCES**: Permission denied → log, emit error event, skip directory
- **ENOSPC**: Too many watchers on Linux → log critical error, suggest increasing limit

### Performance Considerations
- Avoid scanning all files on initial start (set `ignoreInitial: true`)
- Use minimal ignore patterns (only necessary exclusions)
- Batch event emissions when possible
- Don't parse conversation files in watcher (defer to ingestion pipeline)

### Future Enhancements
- Watch for `.claudesettings.local.json` changes (re-validate session)
- Support custom watch paths (e.g., OpenCode session directory)
- Add watch statistics (directories watched, events emitted)
- Support filtering by project path

---

## Deliverables

1. **FileWatcher implementation** (`src/services/file-watcher.ts`)
   - Full interface implementation
   - Event emission for new sessions and updates
   - Error handling and recovery
   - Lifecycle management

2. **Comprehensive test suite** (`tests/services/file-watcher.test.ts`)
   - Unit tests for all public methods
   - Integration tests with session discovery
   - Error handling tests
   - Performance tests

3. **Documentation**
   - JSDoc comments for all public methods
   - Usage examples in code
   - README notes on watch limits (Linux)

---

## Success Criteria

- All acceptance criteria met
- All tests pass (>80% code coverage)
- No memory leaks on extended runs
- Works on macOS (primary target)
- Integration with SessionIngestionService (003-017) possible
- Performance targets achieved
