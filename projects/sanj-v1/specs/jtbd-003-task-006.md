# Spec: Task 003-006 - Implement OpenCodeLLMAdapter with extractPatterns Method

## Overview

Implement the `OpenCodeLLMAdapter` class with the `extractPatterns` method. This adapter executes the OpenCode LLM to analyze session content and extract recurring patterns, preferences, and workflow insights. This is a core component of the Session Analysis & Pattern Capture JTBD.

**Task ID**: 003-006
**JTBD**: 003 - Session Analysis & Pattern Capture
**Depends On**: 003-005 (LLMAdapter interface)
**Blocks**: 003-007 (checkSimilarity method)

---

## Business Context

The OpenCodeLLMAdapter is responsible for:
1. Taking session transcripts as input
2. Sending them to the OpenCode LLM (default: `zai-coding-plan/glm-4.7`)
3. Prompting it to identify patterns, preferences, and insights
4. Parsing the LLM response into structured Observation objects
5. Returning a list of discrete, actionable observations

This adapter is the bridge between raw session data and meaningful pattern extraction.

---

## Technical Specification

### Class Definition

**File**: `/src/adapters/llm/OpenCodeLLM.ts`

**Implements**: `LLMAdapter` interface (from 003-005)

```typescript
class OpenCodeLLMAdapter implements LLMAdapter {
  name: string;
  model: string;

  constructor(model?: string);
  isAvailable(): Promise<boolean>;
  extractPatterns(session: Session): Promise<Observation[]>;
  checkSimilarity(a: Observation, b: Observation): Promise<boolean>;
}
```

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `name` | `string` | Identifier: `"opencode-llm"` |
| `model` | `string` | LLM model identifier (default: `"zai-coding-plan/glm-4.7"`) |

### Methods

#### Constructor

```typescript
constructor(model?: string)
```

**Purpose**: Initialize the adapter with an optional model override.

**Parameters**:
- `model` (optional): Model identifier. If not provided, uses default `"zai-coding-plan/glm-4.7"`

**Behavior**:
- Set `this.name = "opencode-llm"`
- Set `this.model = model || "zai-coding-plan/glm-4.7"`

---

#### isAvailable

```typescript
async isAvailable(): Promise<boolean>
```

**Purpose**: Check if OpenCode CLI is available and executable on the system.

**Implementation**:
- Use `which opencode` or attempt to run `opencode --version`
- Return `true` if command succeeds
- Return `false` if command fails (OpenCode not installed)
- Handle errors gracefully without throwing

**Error Handling**:
- Catch any exceptions and return `false`
- Do not log errors (silent check)

---

#### extractPatterns

```typescript
async extractPatterns(session: Session): Promise<Observation[]>
```

**Purpose**: Analyze a single session and extract recurring patterns, preferences, and insights.

**Parameters**:
- `session: Session` - Session object containing:
  - `id: string` - Unique session identifier
  - `content: string` - Full conversation/transcript content
  - `tool: "claude-code" | "opencode"` - Which tool created the session
  - `timestamp: Date` - Session creation timestamp

**Return**: Array of Observation objects

**Types** (from 003-001):
```typescript
interface Session {
  id: string;
  content: string;
  tool: "claude-code" | "opencode";
  timestamp: Date;
}

interface Observation {
  id: string;
  text: string;
  type: "preference" | "pattern" | "workflow" | "tool-choice" | "style";
  confidence: number; // 0-1
  sessionIds: string[];
  firstSeen: Date;
  lastSeen: Date;
  count: number;
}
```

**Process**:

1. **Construct LLM Prompt**:
   - Build a prompt asking the LLM to analyze the session content
   - Request patterns in specific categories: preferences, recurring workflows, tool choices, coding style decisions
   - Ask LLM to output structured JSON with observation objects
   - Example prompt structure:

```
Analyze the following coding session to identify recurring patterns, preferences,
and insights about the user's workflow.

Session ID: {sessionId}
Content:
{sessionContent}

Extract observations about:
1. User preferences (e.g., "prefers TypeScript over JavaScript")
2. Recurring patterns (e.g., "always starts with git status")
3. Workflow habits (e.g., "runs tests before committing")
4. Tool choices (e.g., "uses vim keybindings")
5. Coding style decisions (e.g., "prefers functional programming")

Return a JSON array of observations. Each observation should have:
{
  "text": "concise description of the observation",
  "type": "preference|pattern|workflow|tool-choice|style",
  "confidence": 0.0-1.0
}

Only include observations with confidence >= 0.6.
Return empty array if no patterns found.
```

2. **Execute OpenCode Command**:
   - Build command: `opencode run --model {this.model} "{prompt}" -q`
   - The `-q` flag ensures quiet mode (minimal output)
   - Execute via child process (e.g., `Bun.spawn()` or similar)
   - Capture stdout

3. **Parse Response**:
   - Extract JSON from LLM response
   - Handle cases where LLM returns non-JSON (wrap in try-catch)
   - Validate that response is an array of objects
   - Return empty array if parsing fails

4. **Transform to Observation Objects**:
   - For each item in parsed response:
     - Generate unique `id` (use UUID or `crypto.randomUUID()`)
     - Copy `text`, `type`, `confidence` from LLM response
     - Set `sessionIds: [session.id]`
     - Set `firstSeen: session.timestamp`
     - Set `lastSeen: session.timestamp`
     - Set `count: 1` (first occurrence)
   - Return array of Observation objects

**Error Handling**:
- If LLM command fails (non-zero exit): return empty array with optional error logging
- If response is malformed JSON: return empty array
- If response is empty/null: return empty array
- Do not throw exceptions; fail gracefully

**Constraints**:
- Timeout: LLM calls should have a reasonable timeout (e.g., 30-60 seconds)
- Token limits: Keep session content reasonable in size to fit within model context
- Rate limiting: Consider adding delays if multiple sessions processed in sequence

---

### Method Signature (checkSimilarity)

This method is defined in the interface but implemented in task 003-007. Stub it here:

```typescript
async checkSimilarity(a: Observation, b: Observation): Promise<boolean> {
  // Implemented in task 003-007
  throw new Error("Not implemented");
}
```

---

## Data Dependencies

**Imports from 003-001**:
```typescript
import type { Session, Observation } from "../core/types";
import type { LLMAdapter } from "./llm/LLMAdapter";
```

**External dependencies**:
- Node.js/Bun built-in `child_process` or `Bun.spawn()`
- `crypto.randomUUID()` for generating observation IDs
- Standard JSON parsing

---

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| Graceful failure (return empty array) | Non-blocking: if LLM fails, analysis continues with other sessions |
| Confidence threshold (0.6) | Filter out low-confidence observations to reduce noise |
| One observation per session | Each analysis pass creates independent observation objects; deduplication handled by ObservationStore (003-009) |
| Default model: glm-4.7 | From research; appropriate for code analysis, good balance of cost/quality |
| Quiet mode (-q flag) | Reduces output verbosity for cron/automation contexts |

---

## Testing Considerations

**Unit Test Approach** (for 003-013):
- Mock `Bun.spawn()` to return canned LLM responses
- Test JSON parsing with various response formats
- Test error handling (command fails, timeout, malformed JSON)
- Test Observation object creation and field mapping
- Test empty session handling

**Mock Data**:
```typescript
const mockSessionContent = "User ran: git status\nThen: npm test\nThen: git add .";
const mockLLMResponse = JSON.stringify([
  {
    text: "User prefers to run tests before committing",
    type: "pattern",
    confidence: 0.95
  },
  {
    text: "Uses git workflow with staged commits",
    type: "workflow",
    confidence: 0.85
  }
]);
```

---

## Acceptance Criteria

- [ ] OpenCodeLLMAdapter class created and exported
- [ ] `isAvailable()` correctly detects OpenCode CLI
- [ ] `extractPatterns()` builds and executes LLM prompt
- [ ] LLM response is parsed into Observation array
- [ ] Each Observation has required fields (id, text, type, confidence, sessionIds, timestamps, count)
- [ ] Errors are handled gracefully (returns empty array, no throw)
- [ ] Code is TypeScript-strict and passes type checking
- [ ] Method is documented with JSDoc comments
- [ ] Ready for checkSimilarity() implementation in 003-007

---

## File Structure

```
src/
├── adapters/
│   ├── llm/
│   │   ├── LLMAdapter.ts       (from 003-005)
│   │   └── OpenCodeLLM.ts      (THIS FILE)
│   ├── session/
│   │   ├── SessionAdapter.ts   (from 003-002)
│   │   ├── ClaudeCodeSession.ts (from 003-003)
│   │   └── OpenCodeSession.ts   (from 003-004)
│   └── memory/
│       ├── CoreMemoryAdapter.ts (from 004-010)
│       └── ...
└── core/
    └── types.ts                 (from 003-001)
```

---

## Dependencies & Blockers

**Completed**:
- 003-001: Core types defined
- 003-005: LLMAdapter interface defined

**Blocked By**: None

**Blocks**:
- 003-007: checkSimilarity() method depends on this base implementation
- 003-009: ObservationStore deduplication uses extractPatterns output
- 003-011: AnalysisEngine orchestration depends on this adapter

---

## Next Steps After This Task

1. **003-007**: Implement `checkSimilarity()` method for semantic similarity checking
2. **003-008**: Implement ObservationStore CRUD operations
3. **003-009**: Add deduplication logic using both methods
4. **003-011**: Integrate into AnalysisEngine orchestration

---

## Notes

- This is the first concrete LLMAdapter implementation; patterns here should inform future adapters (e.g., ClaudeCodeLLMAdapter in future scope)
- The adapter is designed to be stateless; all state is managed by ObservationStore and MemoryHierarchy
- Consider caching the `isAvailable()` check to avoid repeated command execution during large batch analysis
