# Spec: Implement ObservationStore with CRUD Operations

**Task ID**: 003-008
**JTBD**: 003 - Session Analysis & Pattern Capture
**Depends On**: 003-001
**Blocks**: 003-009, 004-008, 005-002

---

## Overview

Implement the `ObservationStore` class that manages the lifecycle of observations. This is a foundational component for capturing and storing patterns extracted from coding sessions. The store provides CRUD (Create, Read, Update, Delete) operations for observations and serves as the persistent backing for the observation storage system.

---

## Context

### What are Observations?

An **observation** is a captured pattern or insight from coding sessions. It includes:
- The observation text (the pattern itself)
- A count (how many times we've seen this pattern)
- Source session references (which sessions this came from)
- Timestamps (first seen, last seen)
- Status (pending, approved, denied)

### Why This Matters

The ObservationStore is the central hub for observation data. Every pattern captured during analysis flows through this store. Without a solid CRUD implementation, subsequent tasks (deduplication, counting, promotion) will fail.

### Architecture Context

From the HLD, the ObservationStore sits in the core domain layer:
- **Upstream**: AnalysisEngine sends observations to the store
- **Downstream**: MemoryHierarchy reads from the store to promote observations

---

## Requirements

### 1. Data Structure

Define a `Observation` type with the following fields (should already exist in `src/core/types.ts` from task 003-001):

```typescript
interface Observation {
  id: string;                    // Unique identifier (UUID)
  text: string;                  // The observation text
  count: number;                 // Frequency count
  status: 'pending' | 'approved' | 'denied'; // Approval status
  sessionRefs: SessionRef[];     // Which sessions this came from
  firstSeen: Date;               // When first captured
  lastSeen: Date;                // When last updated
  metadata?: {
    tags?: string[];
    confidence?: number;         // 0-1 scale for pattern confidence
  };
}

interface SessionRef {
  sessionId: string;
  toolName: string;              // 'claude-code' or 'opencode'
  timestamp: Date;
}
```

### 2. Storage Format

Observations are persisted in `~/.sanj/observations.json` as a JSON file:

```json
{
  "observations": [
    {
      "id": "obs-123...",
      "text": "Prefers using TypeScript with strict mode",
      "count": 3,
      "status": "pending",
      "sessionRefs": [...],
      "firstSeen": "2025-01-20T10:30:00Z",
      "lastSeen": "2025-01-26T14:45:00Z",
      "metadata": {
        "tags": ["typescript", "config"],
        "confidence": 0.92
      }
    }
  ]
}
```

### 3. CRUD Operations

The `ObservationStore` class must implement these operations:

#### Create
```typescript
async create(observation: Omit<Observation, 'id' | 'firstSeen' | 'lastSeen'>): Promise<Observation>
```
- Generate a unique ID (UUID)
- Set `firstSeen` and `lastSeen` to current timestamp
- Persist to disk
- Return the created observation with ID

#### Read
```typescript
async getById(id: string): Promise<Observation | null>
async getAll(): Promise<Observation[]>
async getPending(): Promise<Observation[]>
async getApproved(): Promise<Observation[]>
async getDenied(): Promise<Observation[]>
async getByStatus(status: 'pending' | 'approved' | 'denied'): Promise<Observation[]>
```
- Load observations from disk
- Filter/search as needed
- Return results

#### Update
```typescript
async updateCount(id: string, increment: number): Promise<Observation>
async updateLastSeen(id: string): Promise<Observation>
async setStatus(id: string, status: 'pending' | 'approved' | 'denied'): Promise<Observation>
async addSessionRef(id: string, ref: SessionRef): Promise<Observation>
async update(id: string, partial: Partial<Observation>): Promise<Observation>
```
- Modify observation properties
- Persist changes to disk
- Return updated observation
- Throw error if observation not found

#### Delete
```typescript
async delete(id: string): Promise<boolean>
async deleteByStatus(status: 'pending' | 'approved' | 'denied'): Promise<number>
```
- Remove observation(s) from store
- Persist changes
- Return success/count

### 4. Query Operations

```typescript
async query(predicate: (obs: Observation) => boolean): Promise<Observation[]>
```
- Generic query function for complex filters
- Support use cases like "all pending observations from Claude Code sessions"

### 5. Batch Operations

```typescript
async bulkCreate(observations: Array<Omit<Observation, 'id' | 'firstSeen' | 'lastSeen'>>): Promise<Observation[]>
async bulkUpdate(updates: Array<{ id: string; partial: Partial<Observation> }>): Promise<Observation[]>
```
- Efficiently handle multiple operations
- Single disk write at the end
- All-or-nothing semantics (if one fails, none are applied)

### 6. File I/O

Implement the underlying file storage:

```typescript
private async loadFromDisk(): Promise<void>
private async saveToDisk(): Promise<void>
```
- Read from `~/.sanj/observations.json`
- Write with proper error handling
- Ensure directory exists before writing
- Use atomic writes (write to temp file, then rename) to prevent corruption

### 7. Error Handling

The store must handle:
- File not found (treat as empty store)
- Corrupted JSON (log error, start fresh)
- Invalid observation structure (validation)
- Disk I/O errors (throw with context)
- Concurrent access attempts (load all data before modifying)

### 8. Thread Safety

Since Node.js/Bun are single-threaded, ensure:
- All disk operations are awaited
- No race conditions between reads and writes
- Consider adding a simple lock if multiple operations happen in quick succession

---

## Implementation Details

### Class Structure

```typescript
// src/core/ObservationStore.ts

export class ObservationStore {
  private observations: Map<string, Observation> = new Map();
  private filePath: string;
  private isLoaded: boolean = false;

  constructor(filePath?: string) {
    this.filePath = filePath || paths.observationsFile;
  }

  // Lifecycle
  async ensureLoaded(): Promise<void>

  // CRUD
  async create(...): Promise<Observation>
  async getById(...): Promise<Observation | null>
  async getAll(...): Promise<Observation[]>
  // ... other read operations
  async updateCount(...): Promise<Observation>
  async setStatus(...): Promise<Observation>
  // ... other update operations
  async delete(...): Promise<boolean>

  // Query
  async query(...): Promise<Observation[]>

  // Batch
  async bulkCreate(...): Promise<Observation[]>
  async bulkUpdate(...): Promise<Observation[]>

  // Private
  private async loadFromDisk(): Promise<void>
  private async saveToDisk(): Promise<void>
  private validateObservation(...): boolean
}
```

### Path Constants

The file path should come from `src/storage/paths.ts` (created in task 002-001):

```typescript
// In paths.ts
export const observationsFile = path.join(sanjDir, 'observations.json');
```

### Validation

Each observation should be validated:
- `id`: non-empty string or auto-generated
- `text`: non-empty string
- `count`: positive integer
- `status`: one of allowed values
- `sessionRefs`: array of valid SessionRef objects
- `firstSeen` / `lastSeen`: valid ISO dates
- `metadata.tags`: optional array of strings
- `metadata.confidence`: optional 0-1 number

### Error Messages

When operations fail, throw descriptive errors:

```typescript
throw new Error(`Observation not found: ${id}`);
throw new Error(`Invalid observation status: ${status}`);
throw new Error(`Failed to write observations to disk: ${error.message}`);
```

---

## Success Criteria

- [ ] ObservationStore class is defined in `src/core/ObservationStore.ts`
- [ ] All CRUD operations are implemented and work correctly
- [ ] Read operations return correct filtered results
- [ ] Update operations modify data and persist to disk
- [ ] Delete operations remove observations and clean up
- [ ] File I/O uses atomic writes (write-then-rename pattern)
- [ ] Error handling covers all failure cases
- [ ] Validation prevents invalid observations from being stored
- [ ] Batch operations work with all-or-nothing semantics
- [ ] Store can be instantiated and operations can be chained
- [ ] Observations persist across store instances (survives process restart)

---

## Testing Considerations

While task 003-013 covers unit tests, keep these in mind during implementation:

- **Happy path**: Create, read, update, delete a single observation
- **Batch operations**: Create multiple observations, update multiple
- **Filtering**: Get by status, query with predicates
- **Persistence**: Verify data survives process restart
- **Error cases**: Missing file, corrupted JSON, invalid data
- **Concurrency**: Rapid successive operations don't corrupt data
- **Edge cases**: Empty store, very large count values, special characters in text

---

## Dependencies

- `src/core/types.ts` (Observation type definition)
- `src/storage/paths.ts` (file path constants)
- Built-in Node.js/Bun: `fs/promises`, `path`, `uuid`

---

## Blockers & Notes

- Task 003-001 must be completed first (core types)
- Task 003-007 (LLMAdapter.checkSimilarity) will be used in task 003-009 (deduplication)
- This task itself doesn't implement deduplication logic; that's 003-009
- Keep the store simple and focused on CRUD; let MemoryHierarchy handle promotion logic

---

## Acceptance Checklist

- [ ] Compiles without TypeScript errors
- [ ] All CRUD methods exist and are callable
- [ ] Observations persist to `~/.sanj/observations.json`
- [ ] File format is valid JSON (can be read manually)
- [ ] Handles edge cases (empty store, large datasets, special characters)
- [ ] Error messages are clear and actionable
- [ ] Code follows project style conventions
- [ ] Ready for integration with AnalysisEngine (task 003-011)
