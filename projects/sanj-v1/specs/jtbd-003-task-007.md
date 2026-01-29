# Spec: Add checkSimilarity Method to OpenCodeLLMAdapter

**Task ID**: 003-007
**JTBD**: 003 - Session Analysis & Pattern Capture
**Dependency**: 003-006 (Implement OpenCodeLLMAdapter with extractPatterns method)
**Blocks**: 003-009 (Add deduplication logic to ObservationStore)

---

## Overview

Add a `checkSimilarity` method to the `OpenCodeLLMAdapter` class that performs semantic similarity comparison between two observations. This method is essential for deduplicating observations in the ObservationStore—when a new observation is extracted from a session, it will be compared against existing observations to determine whether to bump the count on an existing observation or create a new one.

---

## Context

The `OpenCodeLLMAdapter` was implemented in task 003-006 with the `extractPatterns(session)` method that sends session content to the OpenCode LLM to extract patterns. The `checkSimilarity` method extends this adapter with a second capability: comparing two observations semantically.

From the HLD, the LLMAdapter interface defines:
```typescript
interface LLMAdapter {
  name: string;
  isAvailable(): Promise<boolean>;
  extractPatterns(session: Session): Promise<Observation[]>;
  checkSimilarity(a: Observation, b: Observation): Promise<boolean>;
}
```

The deduplication strategy (documented in 01-research.md) relies on LLM-based semantic similarity checking: "If similar to existing, bump count instead of duplicating."

---

## Requirements

### Functional Requirements

1. **Semantic Similarity Detection**
   - Accept two `Observation` objects as parameters
   - Return a boolean indicating whether the observations are semantically similar
   - Similar observations capture the same underlying pattern, even if worded differently

2. **LLM-Based Comparison**
   - Use OpenCode CLI with the configured model (default: `zai-coding-plan/glm-4.7`)
   - Prompt the LLM to evaluate whether two observations represent the same or very similar patterns
   - The LLM should consider:
     - The observation text/content
     - The session references (may help contextualize)
     - The observation count (frequency may be considered)

3. **Robustness**
   - Handle OpenCode CLI failures gracefully (return false rather than throwing)
   - Log any LLM call failures for debugging
   - Should not block the analysis flow on comparison failure

4. **Performance Considerations**
   - This method may be called frequently during deduplication
   - Keep LLM prompts concise to minimize latency
   - Consider caching patterns or thresholds, if beneficial (not required for v1)

### Non-Functional Requirements

1. **Type Safety**
   - Maintain TypeScript strict mode
   - All parameters and return types properly typed
   - Use `Observation` type from `src/core/types.ts`

2. **Testability**
   - Method should be mockable for unit tests
   - Consider deterministic behavior for tests (handle randomness in LLM responses)

3. **Consistency with extractPatterns**
   - Follow the same error handling patterns as `extractPatterns`
   - Use the same LLM invocation mechanism (OpenCode CLI)
   - Maintain the same configuration/environment assumptions

---

## Design Details

### Method Signature

```typescript
async checkSimilarity(a: Observation, b: Observation): Promise<boolean>
```

### Input Parameters

- `a: Observation` - First observation to compare
- `b: Observation` - Second observation to compare

### Return Value

- `boolean` - `true` if the observations are semantically similar (same pattern), `false` otherwise

### LLM Prompt Design

The prompt sent to OpenCode should:

1. Present both observations clearly
2. Ask the LLM to determine if they represent the same or similar patterns
3. Request a binary response (yes/no or similar confidence threshold)
4. Be concise to minimize token usage

Example structure:
```
You are comparing two observations about coding patterns and preferences.

Observation A: [text of observation a]
Observation B: [text of observation b]

Are these observations describing the same or very similar patterns?
Respond with ONLY "YES" or "NO".
```

### Implementation Approach

1. **Prompt Construction**
   - Extract the key information from both observations
   - Format a clear, concise prompt for the LLM
   - Include session context if available

2. **CLI Invocation**
   - Use the same mechanism as `extractPatterns` to call OpenCode
   - Use configured model from config

3. **Response Parsing**
   - Parse the LLM's response to determine similarity
   - Look for affirmative indicators (YES, similar, same, etc.)
   - Default to `false` if response is unclear

4. **Error Handling**
   - Try-catch around OpenCode CLI invocation
   - Log errors to file/stdout for debugging
   - Return `false` on error (treat uncertain matches as non-duplicates)

### Data Structures

The method operates on `Observation` objects. From task 003-001, the Observation type includes:
- `id`: unique identifier
- `text`: the observation content
- `count`: frequency
- `createdAt`: timestamp
- `lastSeenAt`: timestamp
- `sessionReferences`: list of session IDs
- `status`: 'pending', 'approved', 'denied'

The method should primarily compare `text` fields but may reference `sessionReferences` for context.

---

## Acceptance Criteria

1. **Method exists and is callable**
   - `checkSimilarity` is defined in `OpenCodeLLMAdapter`
   - Accepts two `Observation` parameters
   - Returns `Promise<boolean>`

2. **Semantic comparison works**
   - Can correctly identify similar observations
   - Can distinguish different observations
   - Handles observations with different wording but same meaning

3. **LLM integration**
   - Calls OpenCode CLI with appropriate prompt
   - Uses configured model (from config)

4. **Error handling**
   - Gracefully handles OpenCode CLI failures
   - Logs failures appropriately
   - Returns `false` on error (fail-safe)

5. **Type safety**
   - TypeScript compilation succeeds with no errors
   - All return types are properly typed

6. **Code quality**
   - Follows the same style as `extractPatterns` method
   - Includes JSDoc comments explaining the method
   - No console.log statements (use logging utility if available)

---

## Files to Create/Modify

### Modify
- `/Users/kaviisuri/code/KaviiSuri/sanj/src/adapters/llm/OpenCodeLLM.ts`
  - Add `checkSimilarity` method to OpenCodeLLMAdapter class
  - Implement prompt engineering and response parsing
  - Add error handling and logging

### Reference (no changes)
- `/Users/kaviisuri/code/KaviiSuri/sanj/src/core/types.ts` - For Observation type
- `/Users/kaviisuri/code/KaviiSuri/sanj/src/adapters/llm/LLMAdapter.ts` - Interface definition

---

## Dependencies

- **003-006**: `extractPatterns` method already implemented (pattern for LLM invocation)
- **003-001**: Core types including `Observation`
- OpenCode CLI installed and available in PATH
- Configuration available with LLM model selection

---

## Testing Strategy

### Unit Tests (task 003-013)

Create test cases for:

1. **Identical observations**
   - Should return `true` for exact matches

2. **Similar observations with different wording**
   - Same underlying pattern expressed differently
   - Should return `true`

3. **Different observations**
   - Different patterns, different contexts
   - Should return `false`

4. **Error handling**
   - Mock OpenCode CLI failure
   - Should return `false` (fail-safe)

5. **Edge cases**
   - Empty or very short observation text
   - Special characters in observation text
   - Very long observation text

### Mock Strategy

- Mock the OpenCode CLI invocation
- Provide controlled responses for different test cases
- Can use a simple mock that returns deterministic results based on input

---

## Implementation Notes

1. **Prompt Engineering**
   - Start with a simple, straightforward prompt
   - Can iterate on prompt quality based on deduplication accuracy
   - Keep prompts concise to minimize latency

2. **Configuration**
   - Should use the same model configuration as `extractPatterns`
   - Should respect the configured LLM adapter settings

3. **Logging**
   - Log when comparison is performed (debug level)
   - Log any LLM errors (error level)
   - Can be used for debugging deduplication issues

4. **Performance**
   - This method may be called O(n) times during deduplication (once per new observation)
   - Consider optimization later if performance becomes an issue
   - For v1, correctness is more important than speed

5. **Consistency**
   - Should follow the same patterns as `extractPatterns`
   - Use the same CLI invocation mechanism
   - Maintain the same error handling philosophy

---

## Iteration & Refinement

This method may need refinement based on:
- Deduplication accuracy in practice (does it correctly identify duplicates?)
- Performance characteristics (is LLM latency acceptable?)
- Edge cases discovered during integration testing

However, the basic implementation should work for the core deduplication flow.

---

## Related Tasks

- **003-006**: Implement OpenCodeLLMAdapter with extractPatterns (predecessor)
- **003-009**: Add deduplication logic to ObservationStore (dependent, will call this method)
- **003-013**: Write unit tests for ObservationStore (will test similarity checking indirectly)

---

## Success Metrics

- Observations are correctly deduplicated during analysis
- Similar patterns are merged (count incremented)
- Dissimilar patterns are stored separately
- No failed LLM calls crash the analysis flow
- Tests pass with >95% coverage for this method
