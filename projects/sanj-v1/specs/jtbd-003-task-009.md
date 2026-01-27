# Spec: Task 003-009 - Add Deduplication Logic to ObservationStore using LLMAdapter

**Task ID**: 003-009
**JTBD**: 003 - Session Analysis & Pattern Capture
**Priority**: P1 (Dedupe & Count)
**Complexity**: Medium

---

## Overview

Task 003-009 implements semantic deduplication logic in the ObservationStore to detect and merge similar observations. This is a critical component of the observation lifecycle that prevents duplicate pattern captures while accurately tracking observation frequency through count increments.

The deduplication uses the LLMAdapter's `checkSimilarity` method to perform semantic similarity checks between new observations and existing ones, enabling intelligent pattern consolidation.

---

## Problem Statement

When the AnalysisEngine processes multiple sessions, it may extract observations that are semantically similar but not identical (e.g., "prefers using TypeScript" vs "tends to write in TypeScript"). Without deduplication:
- Observations list grows with duplicates
- Frequency counts don't accurately reflect true pattern strength
- User reviews get cluttered with near-duplicate entries
- Deduplication should be automatic, transparent, and driven by LLM judgment

---

## Dependencies

**Must complete before**: 003-011, 003-013
**Depends on**: 003-008, 003-007

- **003-008**: ObservationStore CRUD operations must be implemented (create, read, update, delete, query operations)
- **003-007**: LLMAdapter.checkSimilarity method must exist to perform semantic similarity checks

---

## Goals

1. Implement intelligent observation deduplication based on semantic similarity (not exact text match)
2. Preserve observation frequency accuracy through count tracking
3. Track multiple session references for deduplicated observations
4. Provide efficient lookups for new observations against existing ones
5. Enable testing of deduplication logic in isolation
6. Prepare foundation for future optimization (e.g., embeddings-based deduplication)

---

## Success Criteria

- [ ] New `deduplicateAndStore` method added to ObservationStore that:
  - Accepts a list of candidate Observation objects
  - For each candidate, checks similarity against existing observations
  - Increments count if similar observation exists
  - Creates new observation if no similar match found
  - Returns list of processed observations (updated + new)

- [ ] ObservationStore tracks which sessions each observation came from:
  - Each observation has `sessionReferences: string[]` field
  - Session IDs appended when observation is updated or created
  - Duplicates removed (each session ID appears once per observation)

- [ ] Similarity checking uses LLMAdapter:
  - Calls `llmAdapter.checkSimilarity(candidate, existing)` for each comparison
  - Short-circuits on first match (doesn't check remaining if match found)
  - Handles LLM errors gracefully (falls back to creating new observation)

- [ ] Observation counts accurately reflect frequency:
  - New observation has count = 1
  - Each duplicate detected increments count by 1
  - Count persists across store saves/loads

- [ ] Updated/new observations have timestamps:
  - `firstSeen: Date` - when observation was first created
  - `lastSeen: Date` - when observation was most recently matched/updated
  - Used later for promotion thresholds

- [ ] Core Observation interface updated to support deduplication:
  - Add `sessionReferences: string[]` field
  - Add `count: number` field (default 1)
  - Add `firstSeen: Date` field
  - Add `lastSeen: Date` field
  - Add `status: 'pending' | 'approved' | 'denied'` field

- [ ] Error handling:
  - If LLMAdapter.checkSimilarity throws, log error and treat as new observation
  - Store operations don't fail due to dedup errors
  - Errors are captured for debugging but don't block analysis

- [ ] Performance:
  - Deduplication completes in reasonable time (< 5 seconds for 100 observations)
  - No unnecessary LLM calls
  - Efficient observation lookups (indexed by ID)

---

## Acceptance Criteria

**Functional**:
1. ObservationStore.deduplicateAndStore(candidates, llmAdapter, sessionId) method exists and works
2. Semantically similar observations are merged (count incremented)
3. New observations are created when no similar match found
4. Session references tracked correctly
5. Timestamps updated on each observation match/create

**Integration**:
1. AnalysisEngine can call ObservationStore.deduplicateAndStore during analysis flow
2. Works with OpenCodeLLMAdapter.checkSimilarity
3. Observation data persists to observations.json correctly

**Testing**:
1. Unit tests for deduplication logic with mock LLMAdapter
2. Tests cover: exact duplicates, semantic similarity, new observations, error cases
3. Tests verify count increment behavior
4. Tests verify session reference tracking

**Code Quality**:
1. TypeScript with full type safety
2. Clear error messages for debugging
3. Code follows project patterns (same style as ObservationStore CRUD)

---

## Design

### Observation Interface Extension

The Observation type (defined in 003-001) should include dedup-related fields:

```typescript
interface Observation {
  id: string;                      // Unique identifier (UUID or hash)
  text: string;                    // The observation text
  count: number;                   // Frequency (how many times detected)
  sessionReferences: string[];     // Session IDs this was found in
  firstSeen: Date;                 // When first created
  lastSeen: Date;                  // When last updated
  status: 'pending' | 'approved' | 'denied';  // Lifecycle status
  tags?: string[];                 // Optional: categories like 'preference', 'pattern', 'workflow'
}
```

### ObservationStore.deduplicateAndStore Method Signature

```typescript
class ObservationStore {
  // ... existing CRUD methods ...

  /**
   * Process a batch of candidate observations:
   * 1. For each candidate, check similarity against existing observations
   * 2. If similar found, increment count and add session reference
   * 3. If new, create observation with count=1
   * 4. Return processed observations (updated + newly created)
   *
   * @param candidates - New observations extracted from a session
   * @param llmAdapter - LLMAdapter instance for similarity checking
   * @param sessionId - ID of session these observations came from
   * @returns Processed observations (same objects as input, possibly updated)
   */
  async deduplicateAndStore(
    candidates: Observation[],
    llmAdapter: LLMAdapter,
    sessionId: string
  ): Promise<Observation[]>
}
```

### Deduplication Algorithm

```
for each candidate in candidates:
  processedObservation = candidate
  similar = null

  for each existing in this.observations:
    if existing.status === 'denied':
      continue  // skip denied observations

    try:
      isSimilar = await llmAdapter.checkSimilarity(candidate, existing)
      if isSimilar:
        similar = existing
        break
    catch error:
      log error
      // treat as new

  if similar:
    // Update existing observation
    similar.count += 1
    similar.lastSeen = new Date()
    if !similar.sessionReferences.includes(sessionId):
      similar.sessionReferences.push(sessionId)
    processedObservation = similar
  else:
    // Create new observation
    candidate.id = generateId()
    candidate.count = 1
    candidate.firstSeen = new Date()
    candidate.lastSeen = new Date()
    candidate.status = 'pending'
    candidate.sessionReferences = [sessionId]
    this.observations.push(candidate)
    processedObservation = candidate

  yield processedObservation

// Persist to storage
await this.save()
```

### Error Handling Strategy

**LLM Call Failures**:
- If `checkSimilarity` throws an exception, log the error and treat candidate as new
- This ensures analysis continues even if LLM temporarily fails
- Failed candidates are safely stored as new observations

**Storage Failures**:
- If `this.save()` fails at the end, throw error to caller
- AnalysisEngine should handle and log
- Don't corrupt in-memory state

**Data Validation**:
- Ensure all candidates have required fields before processing
- Generate IDs for candidates that don't have them
- Validate session ID is non-empty string

---

## Implementation Checklist

### Phase 1: Core Logic
- [ ] Update Observation interface in types.ts with new fields
- [ ] Implement deduplicateAndStore method skeleton
- [ ] Implement main deduplication loop
- [ ] Add similarity checking with LLMAdapter
- [ ] Handle exact duplicates (count increment)
- [ ] Handle new observations (creation logic)

### Phase 2: Data Management
- [ ] Initialize Observation fields (id, timestamps, status)
- [ ] Track session references correctly
- [ ] Deduplicate session references (no duplicates in array)
- [ ] Persist changes to observations.json

### Phase 3: Error Handling
- [ ] Add try-catch for LLM similarity checks
- [ ] Log errors without breaking flow
- [ ] Validate input data
- [ ] Handle edge cases (empty candidates, null values)

### Phase 4: Testing
- [ ] Write unit tests for deduplication logic
- [ ] Test with mock LLMAdapter
- [ ] Test semantic similarity matching
- [ ] Test count increment behavior
- [ ] Test session reference tracking
- [ ] Test error cases
- [ ] Test persistence

---

## Testing Strategy

### Unit Tests (in tests/core/ObservationStore.test.ts)

**Scenario 1: Exact Semantic Duplicate**
```
Given: existing observation "I prefer TypeScript for type safety"
When: candidate "I like using TypeScript for type safety" processed
Then: observation.count incremented to 2
      observation.lastSeen updated
      sessionId added to sessionReferences
      no new observation created
```

**Scenario 2: New Observation**
```
Given: empty observation store
When: candidate "I prefer Bun over Node.js" processed
Then: new observation created with count=1
      firstSeen and lastSeen set to now
      sessionReferences = [sessionId]
      status = 'pending'
```

**Scenario 3: Multiple Candidates**
```
Given: store has 1 observation
When: 3 candidates processed (1 similar to existing, 2 new)
Then: existing observation count incremented
      2 new observations created
      total observations in store = 3
```

**Scenario 4: Denied Observation**
```
Given: existing observation with status='denied'
When: candidate similar to denied observation processed
Then: new observation created (denied ones skipped)
      count = 1
```

**Scenario 5: LLM Error Handling**
```
Given: LLMAdapter.checkSimilarity throws error
When: candidate processed
Then: error logged
      candidate treated as new observation
      analysis continues without failure
```

**Scenario 6: Session Reference Deduplication**
```
Given: observation has sessionReferences = ["session-1"]
When: same session processes similar observation again
Then: sessionReferences remains ["session-1"] (no duplicate)
      count still incremented
```

### Integration Tests

**Full Analysis Flow**:
- Process mock session with 5 observations
- 2 are duplicates of existing observations
- 3 are new
- Verify counts and session references in stored observations.json

---

## File Structure

**Modified Files**:
- `src/core/types.ts` - Add dedup-related fields to Observation interface
- `src/core/ObservationStore.ts` - Add deduplicateAndStore method

**Test Files**:
- `tests/core/ObservationStore.test.ts` - Add deduplication tests

---

## Related Tasks

- **003-008** (dependency): ObservationStore CRUD must exist first
- **003-007** (dependency): LLMAdapter.checkSimilarity must exist
- **003-011** (blocks): AnalysisEngine needs deduplication to orchestrate analysis
- **003-013** (uses): Unit tests for ObservationStore cover this logic
- **004-008** (uses): TUI action wiring uses updated observation structure

---

## Rollback Plan

If deduplication becomes problematic:
1. Revert deduplicateAndStore implementation
2. AnalysisEngine reverts to direct store.add() calls
3. Observations will contain duplicates until next review (user can manually clean up)
4. No data loss (observations.json still valid with duplicates)

---

## Future Enhancements

1. **Embeddings-based deduplication**: Replace LLM calls with precomputed embeddings for speed
2. **Batch similarity checking**: Check multiple candidates against existing in single LLM call
3. **Machine learning**: Track which similarity checks are accurate to improve thresholds
4. **Deduplication threshold**: Configurable similarity threshold (currently binary yes/no)
5. **Observation merging history**: Track which observations were merged for audit trail

---

## References

- **Research** (`01-research.md`): Section "Deduplication Strategy" describes LLM-based semantic similarity approach
- **PRD** (`02-prd.md`): Goal "Deduplicate and track frequency" explains requirements
- **JTBD** (`03-jtbd.md`): JTBD-003 includes observation storage and deduplication
- **HLD** (`05-hld.md`): ObservationStore component describes deduplication operations

---

## Owner Notes

- This is a critical path task for the core value proposition (deduplication)
- LLM similarity checking is a potential bottleneck; monitor performance during analysis
- Session reference tracking enables "show me where this observation came from" in future TUI features
- Count accuracy is essential for promotion thresholds in later tasks (MemoryHierarchy)
- Test coverage is essential here; deduplication bugs lead to incorrect pattern frequency
