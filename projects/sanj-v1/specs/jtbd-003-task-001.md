# Spec: Task 003-001 - Define Core Types

**JTBD**: 003 - Session Analysis & Pattern Capture
**Task ID**: 003-001
**Title**: Define core types in src/core/types.ts
**Depends On**: 001-001 (Bun project initialization)
**Blocks**: 003-002, 003-005, 003-008, 004-009, 004-010

## Overview

This task defines the foundational TypeScript types used throughout the Sanj codebase. These types establish the domain model for sessions, observations, patterns, configuration, and the memory hierarchy.

## Objectives

- Define a shared type system that all adapters and core logic depend on
- Establish clear contracts for data structures
- Enable type-safe communication between CLI, TUI, and domain layers
- Create an extensible type system that supports multiple adapters

## Type Definitions to Implement

### 1. Session Types

```typescript
export interface Session {
  id: string;
  tool: 'claude-code' | 'opencode';
  projectSlug?: string;
  createdAt: Date;
  modifiedAt: Date;
  path: string;
  messageCount: number;
}
```

**Purpose**: Represents a single conversation/session from Claude Code or OpenCode.

**Fields**:
- `id`: Unique session identifier (varies by tool format)
- `tool`: Source tool (determines which adapter reads it)
- `projectSlug`: Project identifier (optional, tools may not always provide)
- `createdAt`: Session creation timestamp
- `modifiedAt`: Last message timestamp
- `path`: Filesystem path to session file
- `messageCount`: Approximate conversation length

---

### 2. Message Types

```typescript
export interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: Date;
}
```

**Purpose**: Represents a single turn in a conversation.

**Fields**:
- `role`: Message sender ('user' or 'assistant')
- `content`: Message text
- `timestamp`: When message was sent (optional, some tools may not provide)

---

### 3. Observation Types

```typescript
export interface Observation {
  id: string;
  text: string;
  category?: 'preference' | 'pattern' | 'workflow' | 'tool-choice' | 'style' | 'other';
  count: number;
  status: 'pending' | 'approved' | 'denied' | 'promoted-to-long-term' | 'promoted-to-core';
  sourceSessionIds: string[];
  firstSeen: Date;
  lastSeen: Date;
  tags?: string[];
  metadata?: Record<string, unknown>;
}
```

**Purpose**: Represents a single extracted pattern or insight.

**Fields**:
- `id`: Unique identifier for this observation
- `text`: Human-readable observation text
- `category`: Observation type (helps with organization and filtering)
- `count`: How many times this pattern has been detected
- `status`: Current lifecycle state
- `sourceSessionIds`: Which sessions this observation came from
- `firstSeen`: When first detected
- `lastSeen`: When last updated
- `tags`: Optional semantic tags for searching
- `metadata`: Arbitrary extensibility

---

### 4. Extraction Types

```typescript
export interface ExtractionResult {
  observations: Observation[];
  metadata?: {
    processingTime?: number;
    tokensUsed?: number;
    model?: string;
  };
}
```

**Purpose**: Result returned by LLMAdapter when extracting patterns from a session.

**Fields**:
- `observations`: List of extracted patterns
- `metadata`: Optional processing details

---

### 5. Similarity Check Types

```typescript
export interface SimilarityResult {
  isSimilar: boolean;
  confidence: number; // 0-1
  reason?: string;
}
```

**Purpose**: Result of LLM-based semantic similarity check.

**Fields**:
- `isSimilar`: Whether observations are semantically similar
- `confidence`: How confident the check is (0.0 to 1.0)
- `reason`: Optional explanation of the comparison

---

### 6. Memory Hierarchy Types

```typescript
export interface LongTermMemory {
  id: string;
  observation: Observation;
  promotedAt: Date;
  status: 'approved' | 'scheduled-for-core' | 'denied';
}

export interface CoreMemory {
  id: string;
  longTermMemory: LongTermMemory;
  writtenAt: Date;
  targetFile: 'CLAUDE.md' | 'AGENTS.md';
}
```

**Purpose**: Represent items at different levels of the memory hierarchy.

**Fields**:
- `id`: Unique identifier at this level
- `observation` / `longTermMemory`: Reference to the item being promoted
- `promotedAt` / `writtenAt`: When promotion occurred
- `status`: Current state in lifecycle
- `targetFile`: Where core memory was written (if applicable)

---

### 7. Configuration Types

```typescript
export interface Config {
  version: string;
  llmAdapter: {
    type: 'opencode' | 'claude-code';
    model?: string;
  };
  sessionAdapters: {
    claudeCode: boolean;
    opencode: boolean;
  };
  memoryTargets: {
    claudeMd: boolean;
    agentsMd: boolean;
  };
  analysis: {
    windowDays?: number;
    similarityThreshold?: number;
  };
  promotion: {
    observationCountThreshold: number;
    longTermDaysThreshold: number;
  };
  cron?: {
    analysisSchedule?: string;
    promotionSchedule?: string;
  };
  metadata?: Record<string, unknown>;
}
```

**Purpose**: User configuration stored in config.json.

**Fields**:
- `version`: Config schema version
- `llmAdapter`: Which LLM to use for pattern extraction
- `sessionAdapters`: Which tools to monitor
- `memoryTargets`: Where to write approved memories
- `analysis`: Analysis parameters (look-back window, similarity threshold)
- `promotion`: Thresholds for automatic promotion suggestions
- `cron`: Optional scheduling configuration
- `metadata`: Extensibility

---

### 8. State/Tracking Types

```typescript
export interface AnalysisState {
  lastAnalysisRun?: Date;
  lastAnalysisError?: string;
  sessionCursors?: Record<string, string>; // tool -> cursor position
  observationCount: number;
  longTermMemoryCount: number;
  coreMemoryCount: number;
}
```

**Purpose**: Track system state across runs (stored in state.json).

**Fields**:
- `lastAnalysisRun`: When analysis last completed successfully
- `lastAnalysisError`: Error message from last failed run
- `sessionCursors`: Position tracking for incremental reads (optional optimization)
- `observationCount`: Total observations currently stored
- `longTermMemoryCount`: Total long-term memories
- `coreMemoryCount`: Total items promoted to core memory

---

### 9. Error Types

```typescript
export class SanjError extends Error {
  code: string;
  context?: Record<string, unknown>;

  constructor(message: string, code: string, context?: Record<string, unknown>) {
    super(message);
    this.name = 'SanjError';
    this.code = code;
    this.context = context;
  }
}

export enum ErrorCode {
  CONFIG_MISSING = 'CONFIG_MISSING',
  CONFIG_INVALID = 'CONFIG_INVALID',
  SESSION_READ_FAILED = 'SESSION_READ_FAILED',
  LLM_CALL_FAILED = 'LLM_CALL_FAILED',
  OBSERVATION_STORE_FAILED = 'OBSERVATION_STORE_FAILED',
  ADAPTER_UNAVAILABLE = 'ADAPTER_UNAVAILABLE',
  FILE_WRITE_FAILED = 'FILE_WRITE_FAILED',
  INVALID_STATE = 'INVALID_STATE',
}
```

**Purpose**: Standardized error handling across adapters and core logic.

**Fields/Values**:
- `message`: Human-readable error description
- `code`: Machine-readable error code for programmatic handling
- `context`: Optional additional context (e.g., which file failed, which adapter)

---

### 10. Adapter Result Types

```typescript
export interface AdapterAvailabilityCheck {
  available: boolean;
  reason?: string;
}

export interface AdapterOperation<T> {
  success: boolean;
  data?: T;
  error?: SanjError;
}
```

**Purpose**: Standardized return types for adapter operations.

**Fields**:
- `available`: Whether adapter can be used
- `reason`: Why not available (if applicable)
- `success`: Did the operation succeed
- `data`: Result data
- `error`: Error details

---

## Implementation Checklist

- [ ] Create `/src/core/types.ts` file
- [ ] Define Session interface
- [ ] Define Message interface
- [ ] Define Observation interface with status union type
- [ ] Define ExtractionResult interface
- [ ] Define SimilarityResult interface
- [ ] Define LongTermMemory interface
- [ ] Define CoreMemory interface
- [ ] Define Config interface with all nested types
- [ ] Define AnalysisState interface
- [ ] Define SanjError class
- [ ] Define ErrorCode enum
- [ ] Define AdapterAvailabilityCheck interface
- [ ] Define AdapterOperation generic interface
- [ ] Export all types for use by other modules
- [ ] Add JSDoc comments for clarity
- [ ] No implementation code, only type definitions

## Acceptance Criteria

1. File exists at `/src/core/types.ts`
2. All types are exported and usable by other modules
3. Types are well-documented with JSDoc comments
4. No circular dependencies
5. Types are TypeScript-only (no runtime logic)
6. Enums for status fields use string literals
7. Interfaces use proper optional (?) fields
8. Generic types where appropriate (e.g., AdapterOperation<T>)

## Files Modified

- **Create**: `/src/core/types.ts` - Core type definitions

## Files Dependent on This Task

- `/src/adapters/session/SessionAdapter.ts` - Uses Session, Message types
- `/src/adapters/llm/LLMAdapter.ts` - Uses Observation, ExtractionResult
- `/src/core/ObservationStore.ts` - Uses Observation type
- `/src/core/MemoryHierarchy.ts` - Uses memory hierarchy types
- `/src/storage/config.ts` - Uses Config type
- `/src/storage/state.ts` - Uses AnalysisState type
- `/src/cli/commands/init.ts` - Uses Config type
- All adapter implementations

## Related Documentation

- `/05-hld.md` - Architecture overview and data structures section
- `/04-tasks.md` - Full task breakdown with dependencies
- `/02-prd.md` - User stories and feature descriptions

## Notes

- This is a pure type definition task with no runtime logic
- Focus on clarity and completeness to guide downstream implementation
- Types should be extensible (use `metadata?: Record<string, unknown>` patterns)
- Status fields should use union types for type safety
- Error handling should be explicit via ErrorCode enum
