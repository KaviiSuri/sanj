# Spec: Task 003-005 - Define LLMAdapter Interface

**JTBD**: 003 - Session Analysis & Pattern Capture
**Task**: 003-005 - Define LLMAdapter interface
**Status**: Ready for Implementation
**Depends On**: 003-001 (Define core types)
**Blocks**: 003-006 (Implement OpenCodeLLMAdapter), 003-007 (Add checkSimilarity method)

---

## Overview

The LLMAdapter interface defines the contract for LLM integrations in Sanj. It abstracts away the specific LLM provider (OpenCode, Claude Code, future providers) and provides two core operations:

1. **Pattern Extraction**: Analyze a coding session to extract recurring patterns, preferences, and workflows
2. **Similarity Checking**: Determine if two observations are semantically similar (used for deduplication)

This interface enables pluggable LLM backends without changing the core analysis logic.

---

## Context

### Relationship to Other Components

- **AnalysisEngine**: Orchestrates analysis and calls `LLMAdapter.extractPatterns()`
- **ObservationStore**: Uses `LLMAdapter.checkSimilarity()` to deduplicate observations
- **SessionAdapter**: Reads session data; LLMAdapter processes that data
- **CoreMemoryAdapter**: Writes promoted observations; LLM doesn't interact with this

### Constraints & Assumptions

- **Non-interactive**: Adapters must work in cron jobs with no user input
- **Error handling**: Must fail gracefully when LLM is unavailable
- **Performance**: Should be reasonably fast for sessions with 10-100 messages
- **Extensibility**: Future implementations might support Claude Code CLI, other LLM providers

---

## Technical Specification

### Interface Definition

```typescript
interface LLMAdapter {
  /**
   * Human-readable name for this adapter
   * Examples: "OpenCode (GLM-4.7)", "Claude Code (Claude 3.5 Sonnet)"
   */
  name: string;

  /**
   * Check if the adapter's LLM tool is available in the environment
   *
   * Examples:
   * - OpenCodeLLMAdapter checks if `opencode` command exists in PATH
   * - ClaudeCodeLLMAdapter checks if `claude` command exists in PATH
   *
   * Returns: true if the tool is available and callable, false otherwise
   * Throws: Never (handles errors gracefully)
   */
  isAvailable(): Promise<boolean>;

  /**
   * Extract patterns from a single coding session
   *
   * Input:
   * - session: A Session object containing:
   *   - id: string
   *   - startTime: Date
   *   - endTime: Date
   *   - messages: Array of {role: 'user' | 'assistant', content: string}
   *   - metadata: {tool: 'claude-code' | 'opencode', projectName?: string}
   *
   * Output:
   * - Array of Observation objects:
   *   - text: string (the observation text, e.g. "User prefers async/await over promises")
   *   - category: 'preference' | 'pattern' | 'workflow' | 'style'
   *   - confidence: number (0-1, how confident this observation is valid)
   *   - reasoning: string (explanation of why this was extracted)
   *   - sourceSnippets: string[] (array of session excerpts supporting this observation)
   *
   * Behavior:
   * - Analyzes the session conversation to identify:
   *   - Coding style preferences (indentation, naming conventions, framework choices)
   *   - Recurring workflows (common commands, tool sequences)
   *   - Problem-solving patterns (debugging approach, code review habits)
   *   - Library/tool preferences (testing frameworks, linters, etc)
   * - Should extract 2-6 observations per session (configurable)
   * - Observation order should be by confidence (highest first)
   *
   * Error handling:
   * - Throws AnalysisError if extraction fails (LLM unavailable, timeout, etc)
   * - Never returns null or throws untyped errors
   *
   * Non-interactive:
   * - No prompts, no user input
   * - Suitable for cron jobs
   */
  extractPatterns(session: Session): Promise<Observation[]>;

  /**
   * Check if two observations are semantically similar
   *
   * Input:
   * - observationA: First Observation to compare
   * - observationB: Second Observation to compare
   *
   * Output:
   * - true if observations are semantically similar (should be deduplicated)
   * - false if they are distinct observations
   *
   * Behavior:
   * - Compares observation text, category, and reasoning
   * - Uses semantic understanding, not just string matching
   * - Examples:
   *   - "User prefers Prettier for formatting" and "Uses Prettier as default formatter" = similar
   *   - "Loves TypeScript" and "Prefers JavaScript" = distinct
   *   - "Uses async/await" and "Avoids callbacks" = distinct (different statements)
   * - Conservative: when in doubt, return false (prefer separate observations)
   *
   * Confidence:
   * - Similarity is binary (true/false), not a score
   * - If > 70% semantic match, return true
   * - If < 70%, return false
   *
   * Error handling:
   * - Throws AnalysisError if comparison fails
   * - Never returns null
   */
  checkSimilarity(
    observationA: Observation,
    observationB: Observation
  ): Promise<boolean>;
}
```

### Related Type Definitions

The LLMAdapter depends on types defined in 003-001 (Define core types). These should be in `src/core/types.ts`:

```typescript
interface Session {
  id: string;
  startTime: Date;
  endTime: Date;
  messages: Message[];
  metadata: SessionMetadata;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface SessionMetadata {
  tool: 'claude-code' | 'opencode';
  projectName?: string;
}

interface Observation {
  id?: string;
  text: string;
  category: 'preference' | 'pattern' | 'workflow' | 'style';
  confidence: number; // 0-1
  reasoning: string;
  sourceSnippets: string[];
  sessionId?: string;
  createdAt?: Date;
  count?: number; // For stored observations (defaults to 1)
}

class AnalysisError extends Error {
  code: string; // 'LLM_UNAVAILABLE', 'TIMEOUT', 'INVALID_RESPONSE', etc
  originalError?: Error;
}
```

### File Location

- **File**: `/src/adapters/llm/LLMAdapter.ts`
- **Format**: TypeScript interface export

```typescript
// src/adapters/llm/LLMAdapter.ts

export interface LLMAdapter {
  // ... interface definition as above
}

// Type exports for convenience
export type { Session, Message, SessionMetadata, Observation };
export { AnalysisError };
```

---

## Implementation Notes

### For OpenCodeLLMAdapter (Task 003-006)

The OpenCode implementation will:

1. **extractPatterns**:
   - Serialize the session conversation into a prompt
   - Call: `opencode run --model zai-coding-plan/glm-4.7 "<prompt>"`
   - Parse JSON output (structured response from LLM)
   - Return array of Observation objects
   - Default: extract up to 5 observations per session

2. **checkSimilarity**:
   - Create a comparison prompt
   - Call: `opencode run --model zai-coding-plan/glm-4.7 "<prompt>"`
   - Parse boolean response
   - Return true/false

### For ClaudeCodeLLMAdapter (Future, Not in v1)

Similar pattern but using `claude -p "<prompt>"` command.

### Prompt Engineering Details (Not in This Spec)

The actual LLM prompts will be:
- Defined in the concrete adapter implementations
- Tested separately via unit tests (task 003-014)
- Optimized for accuracy and relevance
- Designed to be deterministic when possible

---

## Acceptance Criteria

- [ ] `LLMAdapter` interface is defined in `src/adapters/llm/LLMAdapter.ts`
- [ ] Interface includes `name`, `isAvailable()`, `extractPatterns()`, and `checkSimilarity()` methods
- [ ] All method signatures match specification exactly
- [ ] JSDoc comments explain purpose, inputs, outputs, error behavior
- [ ] Related types (`Observation`, `Session`, `AnalysisError`) are exported from same file
- [ ] Types are imported from `src/core/types.ts` (which implements 003-001)
- [ ] File follows TypeScript best practices and team conventions
- [ ] No implementation code in the interface file (only type definitions)
- [ ] Interface is exported for use by OpenCodeLLMAdapter (task 003-006)

---

## Testing

Unit tests will be written in task 003-014 (AnalysisEngine tests) with mock implementations:

```typescript
// Example mock for testing
class MockLLMAdapter implements LLMAdapter {
  name = "Mock LLM";

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async extractPatterns(session: Session): Promise<Observation[]> {
    // Return hardcoded observations for testing
  }

  async checkSimilarity(a: Observation, b: Observation): Promise<boolean> {
    // Simple string matching for testing
  }
}
```

---

## Error Handling Strategy

### isAvailable() - Silent Failure

```typescript
async isAvailable(): Promise<boolean> {
  try {
    // Check if opencode/claude exists
    return true;
  } catch {
    return false; // Never throws
  }
}
```

### extractPatterns() - Explicit Error

```typescript
async extractPatterns(session: Session): Promise<Observation[]> {
  if (!await this.isAvailable()) {
    throw new AnalysisError(
      "OpenCode is not available",
      { code: "LLM_UNAVAILABLE" }
    );
  }
  // ... call LLM, parse response
  // If parsing fails:
  throw new AnalysisError(
    "Failed to parse OpenCode response",
    { code: "INVALID_RESPONSE", originalError: parseError }
  );
}
```

### checkSimilarity() - Explicit Error

Same pattern as `extractPatterns()`.

---

## Integration Points

### AnalysisEngine (Task 003-011)

```typescript
// AnalysisEngine.ts will use it like:
const llm = this.config.llmAdapter; // e.g., OpenCodeLLMAdapter
for (const session of sessions) {
  const observations = await llm.extractPatterns(session);
  // ...
}
```

### ObservationStore (Task 003-009)

```typescript
// ObservationStore.ts will use it like:
if (await this.llm.checkSimilarity(newObs, existingObs)) {
  // They're similar, bump count
  existingObs.count++;
} else {
  // They're distinct, store separately
}
```

---

## Future Extensibility

This interface design supports:

1. **New LLM providers**: Claude API, Anthropic API, local models (Ollama, Llama.cpp)
2. **Custom prompt templates**: Adapters can use different prompts for different use cases
3. **Batch operations**: Future versions might add `extractPatterns(sessions: Session[])` for efficiency
4. **Configuration**: Adapters can accept config in constructor for model selection, temperature, etc

---

## Dependencies

- **Required by**: 003-006 (OpenCodeLLMAdapter), 003-009 (ObservationStore dedup), 003-011 (AnalysisEngine)
- **Requires**: 003-001 (core types)
- **External**: None (pure interface definition)

---

## Related Files

After implementation, the following files will reference LLMAdapter:

- `src/core/types.ts` - Type definitions
- `src/adapters/llm/OpenCodeLLM.ts` - OpenCode implementation
- `src/core/AnalysisEngine.ts` - Uses extractPatterns()
- `src/core/ObservationStore.ts` - Uses checkSimilarity()
- `tests/core/AnalysisEngine.test.ts` - Mock implementation for testing

---

## Summary

The LLMAdapter interface provides a clean abstraction for LLM integrations with two core responsibilities:

1. **Extracting patterns** from session conversations (the core value of Sanj)
2. **Checking semantic similarity** for deduplication (avoiding redundant observations)

By defining this interface first, concrete implementations (OpenCodeLLMAdapter, future ClaudeCodeLLMAdapter) can be built independently, and the core analysis logic can be tested with mocks without requiring actual LLM tools installed.
