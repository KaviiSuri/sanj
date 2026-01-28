/**
 * Memory Query Service
 *
 * Provides a unified, inheritance-aware query interface over the memory
 * hierarchy.  Callers can ask for memories at a specific scope level
 * (session, project, global) and the service automatically walks the
 * inheritance chain to include parent-scope memories.
 *
 * Inheritance rules:
 *   - Session scope  → also includes project + global memories
 *   - Project scope  → also includes global memories
 *   - Global scope   → only global memories (top of chain)
 *
 * Every result item is annotated with a relevance score composed of three
 * weighted components:
 *   1. Frequency   — how often the underlying observation has been detected
 *   2. Recency     — how recently the observation was last seen
 *   3. Session spread — how many unique source sessions contributed
 *
 * Full-text keyword search is supported via simple token-overlap matching
 * against observation text and tags.
 *
 * @module services/memory-query
 */

import type { LongTermMemory, Config } from '../core/types.ts';
import type { IMemoryStore, MemoryQueryOptions, PaginationOptions } from '../storage/interfaces.ts';
import type { MemoryScope } from '../domain/memory.ts';

// =============================================================================
// Exported Types
// =============================================================================

/**
 * Extended filter that layers scope, relevance threshold, and keyword search
 * on top of the base MemoryQueryOptions understood by IMemoryStore.
 */
export interface QueryFilter extends MemoryQueryOptions {
  /** Restrict results to a specific scope level */
  scope?: MemoryScope;

  /** Only return items whose relevance score is at or above this value (0.0–1.0) */
  relevanceThreshold?: number;

  /** Keyword(s) to search for in observation text and tags */
  keyword?: string;

  /** Filter by observation category */
  category?: 'preference' | 'pattern' | 'workflow' | 'tool-choice' | 'style' | 'other';
}

/**
 * Breakdown of individual relevance score components for a single memory.
 * Each component is normalised to the 0.0–1.0 range before weighting.
 */
export interface RelevanceScore {
  /** Weighted contribution of observation frequency (count) */
  frequency: number;

  /** Weighted contribution of how recently the observation was last seen */
  recency: number;

  /** Weighted contribution of unique source session spread */
  sessionSpread: number;

  /** Combined relevance score (sum of weighted components, clamped 0.0–1.0) */
  total: number;
}

/**
 * A LongTermMemory item annotated with its computed relevance score.
 */
export interface ScoredMemory {
  /** The underlying long-term memory */
  memory: LongTermMemory;

  /** Computed relevance breakdown */
  relevance: RelevanceScore;
}

/**
 * Paginated query result returned by the main `query()` method.
 */
export interface QueryResult {
  /** Scored and sorted memory items for the current page */
  items: ScoredMemory[];

  /** Total number of items matching the filter (across all pages) */
  total: number;

  /** Current page offset */
  offset: number;

  /** Maximum items per page */
  limit: number;
}

/**
 * Controls which parent scopes are included when performing an
 * inheritance-aware query.
 *
 * Setting a flag to `false` excludes that scope from the inheritance walk.
 * Defaults are all `true`, preserving the standard inheritance chain.
 */
export interface InheritanceConfig {
  /** Include session-scope memories when walking from session level */
  includeSession?: boolean;

  /** Include project-scope memories when walking up from session or project level */
  includeProject?: boolean;

  /** Include global-scope memories when walking up from any level */
  includeGlobal?: boolean;
}

// =============================================================================
// Scoring Constants & Helpers
// =============================================================================

/**
 * Default weights for the three relevance components.
 * Must sum to 1.0 for the final score to remain in the 0.0–1.0 range.
 */
const DEFAULT_WEIGHTS = {
  frequency: 0.5,
  recency: 0.3,
  sessionSpread: 0.2,
} as const;

/**
 * Half-life in days for exponential recency decay.
 * Observations last seen more than RECENCY_HALF_LIFE_DAYS ago
 * lose half their recency contribution.
 */
const RECENCY_HALF_LIFE_DAYS = 7;

/**
 * Compute a recency score in [0.0, 1.0] using exponential decay.
 * score = exp(-lambda * daysSinceLastSeen), where lambda = ln(2) / halfLife.
 *
 * @param lastSeen   - When the observation was last seen
 * @param now        - Reference timestamp (typically Date.now())
 * @returns Recency score; 1.0 means "just seen", approaching 0.0 for old items
 */
function computeRecencyScore(lastSeen: Date, now: Date): number {
  const daysSince = Math.max(
    0,
    (now.getTime() - lastSeen.getTime()) / (1000 * 60 * 60 * 24)
  );
  const lambda = Math.LN2 / RECENCY_HALF_LIFE_DAYS;
  return Math.exp(-lambda * daysSince);
}

/**
 * Compute a session-spread score in [0.0, 1.0].
 * Uses square-root scaling so that very large session counts do not
 * dominate the score.
 *
 * @param uniqueSessions - Number of distinct source sessions
 * @param maxSessions    - Largest session count in the result set (for normalisation)
 * @returns Spread score
 */
function computeSessionSpreadScore(uniqueSessions: number, maxSessions: number): number {
  if (maxSessions === 0) return 0.0;
  return Math.sqrt(uniqueSessions) / Math.sqrt(maxSessions);
}

/**
 * Tokenise a string into a set of lowercase tokens (length > 2) for
 * keyword matching.  Splits on whitespace and common punctuation.
 *
 * @param text - Input string
 * @returns Set of normalised tokens
 */
function tokenize(text: string): Set<string> {
  const tokens = text
    .toLowerCase()
    .split(/[\s,.:;!?()[\]{}"']+/)
    .filter((t) => t.length > 2);
  return new Set(tokens);
}

/**
 * Determine whether a keyword matches a LongTermMemory's observation text
 * or tags using token-overlap.  Returns true if any token from the keyword
 * appears in the observation text or tag set.
 *
 * @param memory  - The memory to test
 * @param keyword - Search term
 * @returns true if there is at least one token overlap
 */
function matchesKeyword(memory: LongTermMemory, keyword: string): boolean {
  const queryTokens = tokenize(keyword);
  if (queryTokens.size === 0) return true; // empty keyword matches everything

  const textTokens = tokenize(memory.observation.text);
  for (const qt of queryTokens) {
    if (textTokens.has(qt)) return true;
  }

  // Also check tags
  if (memory.observation.tags) {
    const tagTokens = new Set<string>();
    for (const tag of memory.observation.tags) {
      for (const t of tokenize(tag)) {
        tagTokens.add(t);
      }
    }
    for (const qt of queryTokens) {
      if (tagTokens.has(qt)) return true;
    }
  }

  return false;
}

// =============================================================================
// Scope Inheritance Logic
// =============================================================================

/**
 * Given a target scope and an InheritanceConfig, return the ordered list of
 * scopes that should be queried.  The list always starts with the requested
 * scope and walks up toward 'global'.
 *
 * @param scope       - The scope the caller is interested in
 * @param inheritance - Which parent levels to include
 * @returns Ordered array of scopes to query (leaf → root)
 */
function resolveInheritanceChain(
  scope: MemoryScope,
  inheritance: InheritanceConfig = {}
): MemoryScope[] {
  const {
    includeSession = true,
    includeProject = true,
    includeGlobal = true,
  } = inheritance;

  const chain: MemoryScope[] = [];

  switch (scope) {
    case 'session':
      if (includeSession) chain.push('session');
      if (includeProject) chain.push('project');
      if (includeGlobal) chain.push('global');
      break;
    case 'project':
      if (includeProject) chain.push('project');
      if (includeGlobal) chain.push('global');
      break;
    case 'global':
      if (includeGlobal) chain.push('global');
      break;
  }

  return chain;
}

// =============================================================================
// MemoryQueryService
// =============================================================================

/**
 * Unified query service for the memory hierarchy.
 *
 * Responsibilities:
 * 1. Query IMemoryStore for LongTermMemory items using standard filters
 * 2. Optionally walk the scope inheritance chain to include parent-level memories
 * 3. Compute per-item relevance scores (frequency, recency, session spread)
 * 4. Support keyword full-text search across observation text and tags
 * 5. Return paginated, scored result sets
 *
 * Dependencies are injected through the constructor for testability.
 *
 * @example
 * ```typescript
 * const service = new MemoryQueryService(memoryStore, config);
 *
 * // Simple query for approved memories
 * const result = await service.query({ status: 'approved' });
 *
 * // Inheritance-aware query at session scope
 * const inherited = await service.getInheritedMemories('session', 'my-project', 'sess-123');
 *
 * // Full-text search
 * const found = await service.searchByKeyword('typescript', 10);
 * ```
 */
export class MemoryQueryService {
  private readonly memoryStore: IMemoryStore;
  private readonly config: Config;

  /**
   * Create a MemoryQueryService.
   *
   * @param memoryStore - Storage backend for LongTermMemory items
   * @param config      - Application configuration (used for promotion thresholds)
   */
  constructor(memoryStore: IMemoryStore, config: Config) {
    this.memoryStore = memoryStore;
    this.config = config;
  }

  // ---------------------------------------------------------------------------
  // Primary Query Interface
  // ---------------------------------------------------------------------------

  /**
   * Execute a filtered, scored, and paginated query against the memory store.
   *
   * Processing pipeline:
   * 1. Fetch raw LongTermMemory items from the store using base MemoryQueryOptions
   * 2. If a scope filter is specified and inheritance is enabled, augment the
   *    result set with memories from parent scopes
   * 3. Apply keyword filter (if provided)
   * 4. Compute relevance scores for every surviving item
   * 5. Filter by relevanceThreshold (if provided)
   * 6. Sort descending by relevance score
   * 7. Apply pagination (offset + limit)
   *
   * @param filter      - Extended filter criteria
   * @param pagination  - Optional page bounds (offset + limit)
   * @param inheritance - Optional inheritance configuration
   * @returns Paginated, scored query result
   */
  async query(
    filter: QueryFilter,
    pagination?: PaginationOptions,
    inheritance?: InheritanceConfig
  ): Promise<QueryResult> {
    // Build the base store query options (everything IMemoryStore understands)
    const storeOptions: MemoryQueryOptions = {};
    if (filter.status) storeOptions.status = filter.status;
    if (filter.dateRange) storeOptions.dateRange = filter.dateRange;
    if (filter.eligibleForCore !== undefined) storeOptions.eligibleForCore = filter.eligibleForCore;
    if (filter.minCount !== undefined) storeOptions.minCount = filter.minCount;
    if (filter.minDays !== undefined) storeOptions.minDays = filter.minDays;

    // Fetch primary result set
    let memories = await this.memoryStore.query(storeOptions);

    // If scope is specified, gather inherited memories from parent scopes
    if (filter.scope) {
      const inheritedSet = await this.fetchByInheritanceChain(
        filter.scope,
        inheritance ?? {}
      );
      // Merge: deduplicate by memory ID
      const idSet = new Set(memories.map((m) => m.id));
      for (const inherited of inheritedSet) {
        if (!idSet.has(inherited.id)) {
          memories.push(inherited);
          idSet.add(inherited.id);
        }
      }

      // Now narrow down to only the scopes in the inheritance chain
      const allowedScopes = resolveInheritanceChain(filter.scope, inheritance);
      memories = this.filterByScopes(memories, allowedScopes);
    }

    // Apply category filter
    if (filter.category) {
      memories = memories.filter(
        (m) => m.observation.category === filter.category
      );
    }

    // Apply keyword filter
    if (filter.keyword && filter.keyword.trim().length > 0) {
      memories = memories.filter((m) => matchesKeyword(m, filter.keyword!));
    }

    // Compute relevance scores
    const scored = this.scoreMemories(memories);

    // Apply relevance threshold
    const filtered = filter.relevanceThreshold !== undefined
      ? scored.filter((sm) => sm.relevance.total >= filter.relevanceThreshold!)
      : scored;

    // Sort by total relevance descending
    filtered.sort((a, b) => b.relevance.total - a.relevance.total);

    // Record total before pagination
    const total = filtered.length;

    // Apply pagination
    const offset = pagination?.offset ?? 0;
    const limit = pagination?.limit ?? 50;
    const page = filtered.slice(offset, offset + limit);

    return {
      items: page,
      total,
      offset,
      limit,
    };
  }

  // ---------------------------------------------------------------------------
  // Relevance Scoring
  // ---------------------------------------------------------------------------

  /**
   * Compute the relevance score for a single LongTermMemory item.
   *
   * Score components:
   * - **Frequency**: observation.count normalised against a reference maximum.
   *   When no context (sibling memories) is available, the count is normalised
   *   against itself (yielding 1.0) so the score reflects relative standing
   *   within whatever set the caller is working with.
   * - **Recency**: exponential decay from observation.lastSeen with a 7-day half-life.
   * - **Session spread**: square-root-scaled ratio of unique source sessions to a
   *   reference maximum.
   *
   * @param memory  - The memory to score
   * @param context - Optional object with `maxCount` and `maxSessions` for
   *                  normalisation.  If omitted, the memory's own values are used
   *                  as the denominator (self-normalised).
   * @returns A RelevanceScore with per-component breakdown and total
   */
  computeRelevance(
    memory: LongTermMemory,
    context?: { maxCount: number; maxSessions: number }
  ): RelevanceScore {
    const now = new Date();
    const obs = memory.observation;

    const maxCount = context?.maxCount ?? Math.max(obs.count, 1);
    const maxSessions = context?.maxSessions ?? Math.max(obs.sourceSessionIds.length, 1);

    const freqRaw = obs.count / maxCount;
    const recencyRaw = computeRecencyScore(obs.lastSeen, now);
    const spreadRaw = computeSessionSpreadScore(obs.sourceSessionIds.length, maxSessions);

    const frequency = DEFAULT_WEIGHTS.frequency * freqRaw;
    const recency = DEFAULT_WEIGHTS.recency * recencyRaw;
    const sessionSpread = DEFAULT_WEIGHTS.sessionSpread * spreadRaw;

    const total = Math.min(1.0, Math.max(0.0, frequency + recency + sessionSpread));

    return { frequency, recency, sessionSpread, total };
  }

  // ---------------------------------------------------------------------------
  // Scope-Filtered Queries
  // ---------------------------------------------------------------------------

  /**
   * Query memories filtered to exactly one scope level.
   *
   * This is a convenience wrapper around the store's query method that adds
   * post-fetch scope filtering based on the observation's source metadata.
   * Since IMemoryStore does not natively track domain-level scope, this method
   * uses heuristics on the LongTermMemory to approximate scope:
   *   - Single sourceSessionId → session scope
   *   - Multiple sourceSessionIds → project scope (default for multi-session)
   *   - Meets global promotion eligibility → global scope
   *
   * @param scope   - The scope level to filter for
   * @param options - Additional store query options
   * @returns Memories matching the requested scope
   */
  async getByScope(
    scope: MemoryScope,
    options: MemoryQueryOptions = {}
  ): Promise<LongTermMemory[]> {
    const all = await this.memoryStore.query(options);
    return all.filter((m) => this.classifyScope(m) === scope);
  }

  // ---------------------------------------------------------------------------
  // Inheritance-Aware Retrieval
  // ---------------------------------------------------------------------------

  /**
   * Retrieve memories from the given scope and all ancestor scopes in the
   * inheritance chain.
   *
   * For example, querying at 'session' scope with default inheritance will
   * return session-level memories (matching the given sessionId), project-level
   * memories (matching the given projectSlug), and global-level memories.
   *
   * Results are deduplicated by memory ID and sorted by relevance (descending).
   *
   * @param scope       - The leaf scope to start from
   * @param projectSlug - Project identifier (used when scope includes 'project')
   * @param sessionId   - Session identifier (used when scope is 'session')
   * @returns Array of ScoredMemory items across the inheritance chain
   */
  async getInheritedMemories(
    scope: MemoryScope,
    projectSlug?: string,
    sessionId?: string
  ): Promise<ScoredMemory[]> {
    const chain = resolveInheritanceChain(scope);
    const allMemories: LongTermMemory[] = [];
    const seenIds = new Set<string>();

    for (const level of chain) {
      const levelMemories = await this.getMemoriesAtLevel(level, projectSlug, sessionId);
      for (const mem of levelMemories) {
        if (!seenIds.has(mem.id)) {
          allMemories.push(mem);
          seenIds.add(mem.id);
        }
      }
    }

    // Score and sort
    const scored = this.scoreMemories(allMemories);
    scored.sort((a, b) => b.relevance.total - a.relevance.total);

    return scored;
  }

  // ---------------------------------------------------------------------------
  // Keyword Search
  // ---------------------------------------------------------------------------

  /**
   * Full-text search through observation texts and tags using token-overlap matching.
   *
   * Tokenises the keyword and each observation's text (and tags) on whitespace
   * and punctuation.  A memory matches when at least one keyword token appears
   * in the observation's token set.
   *
   * Results are scored and returned sorted by relevance descending.
   *
   * @param keyword - Search term (single word or phrase)
   * @param limit   - Maximum number of results to return (default: 20)
   * @returns Scored memories matching the keyword, sorted by relevance
   */
  async searchByKeyword(keyword: string, limit: number = 20): Promise<ScoredMemory[]> {
    if (!keyword || keyword.trim().length === 0) {
      return [];
    }

    const all = await this.memoryStore.getAll();
    const matched = all.filter((m) => matchesKeyword(m, keyword));

    const scored = this.scoreMemories(matched);
    scored.sort((a, b) => b.relevance.total - a.relevance.total);

    return scored.slice(0, limit);
  }

  // ---------------------------------------------------------------------------
  // Private: Batch Scoring
  // ---------------------------------------------------------------------------

  /**
   * Score an array of memories with normalisation context derived from
   * the full result set (so that frequency and spread are relative).
   *
   * @param memories - Memories to score
   * @returns Array of ScoredMemory items
   */
  private scoreMemories(memories: LongTermMemory[]): ScoredMemory[] {
    if (memories.length === 0) return [];

    // Compute normalisation denominators from the full set
    const maxCount = Math.max(...memories.map((m) => m.observation.count), 1);
    const maxSessions = Math.max(
      ...memories.map((m) => m.observation.sourceSessionIds.length),
      1
    );
    const context = { maxCount, maxSessions };

    return memories.map((memory) => ({
      memory,
      relevance: this.computeRelevance(memory, context),
    }));
  }

  // ---------------------------------------------------------------------------
  // Private: Scope Classification Heuristic
  // ---------------------------------------------------------------------------

  /**
   * Classify a LongTermMemory into a MemoryScope based on its observation data.
   *
   * Heuristic rules (applied in order):
   * 1. If the observation meets both the count threshold (from config) and the
   *    days-since-promotion threshold for core eligibility → 'global'
   * 2. If the observation spans multiple source sessions → 'project'
   * 3. Otherwise → 'session'
   *
   * The config thresholds are checked locally so that scope classification
   * remains deterministic even if the store's eligibility method changes.
   *
   * @param memory - The memory to classify
   * @returns Inferred scope
   */
  private classifyScope(memory: LongTermMemory): MemoryScope {
    const obs = memory.observation;

    // Global: meets count threshold AND has been resident long enough
    const countThreshold = this.config.promotion.observationCountThreshold;
    const daysThreshold = this.config.promotion.longTermDaysThreshold;
    const daysSincePromotion = this.memoryStore.daysSinceLongTermPromotion(memory);

    if (obs.count >= countThreshold && daysSincePromotion >= daysThreshold) {
      return 'global';
    }

    // Project: seen across multiple sessions
    if (obs.sourceSessionIds.length > 1) {
      return 'project';
    }

    // Session: single-session origin
    return 'session';
  }

  // ---------------------------------------------------------------------------
  // Private: Scope Filtering
  // ---------------------------------------------------------------------------

  /**
   * Filter a result set to only include memories whose classified scope
   * is in the allowed set.
   *
   * @param memories     - Full set of memories
   * @param allowedScopes - Scopes to retain
   * @returns Filtered array
   */
  private filterByScopes(
    memories: LongTermMemory[],
    allowedScopes: MemoryScope[]
  ): LongTermMemory[] {
    const scopeSet = new Set(allowedScopes);
    return memories.filter((m) => scopeSet.has(this.classifyScope(m)));
  }

  // ---------------------------------------------------------------------------
  // Private: Inheritance Chain Fetching
  // ---------------------------------------------------------------------------

  /**
   * Fetch memories for each scope in the inheritance chain, applying
   * scope-specific filters (sessionId for session, projectSlug for project).
   *
   * @param scope       - Target scope level
   * @param inheritance - Inheritance configuration
   * @returns Merged array of memories across the chain
   */
  private async fetchByInheritanceChain(
    scope: MemoryScope,
    inheritance: InheritanceConfig
  ): Promise<LongTermMemory[]> {
    const chain = resolveInheritanceChain(scope, inheritance);
    const result: LongTermMemory[] = [];
    const seenIds = new Set<string>();

    for (const level of chain) {
      const levelMemories = await this.getMemoriesAtLevel(level);
      for (const mem of levelMemories) {
        if (!seenIds.has(mem.id)) {
          result.push(mem);
          seenIds.add(mem.id);
        }
      }
    }

    return result;
  }

  // ---------------------------------------------------------------------------
  // Private: Per-Level Memory Retrieval
  // ---------------------------------------------------------------------------

  /**
   * Retrieve memories that belong to a specific scope level, optionally
   * narrowing by project or session context.
   *
   * Uses classifyScope() to determine each memory's scope, then applies
   * additional context filters:
   * - session scope + sessionId: only memories whose single sourceSessionId matches
   * - project scope + projectSlug: only memories whose sourceSessionIds are
   *   associated with the given project (approximated by checking metadata or
   *   falling back to all project-scope memories when no metadata is available)
   *
   * @param level       - The scope level to retrieve
   * @param projectSlug - Optional project filter
   * @param sessionId   - Optional session filter
   * @returns Memories at the requested level
   */
  private async getMemoriesAtLevel(
    level: MemoryScope,
    projectSlug?: string,
    sessionId?: string
  ): Promise<LongTermMemory[]> {
    const all = await this.memoryStore.getAll();
    let result = all.filter((m) => this.classifyScope(m) === level);

    if (level === 'session' && sessionId) {
      result = result.filter(
        (m) => m.observation.sourceSessionIds.includes(sessionId)
      );
    }

    if (level === 'project' && projectSlug) {
      result = result.filter((m) => {
        // Check metadata for project association if available
        const meta = m.observation.metadata;
        if (meta && typeof meta.projectSlug === 'string') {
          return meta.projectSlug === projectSlug;
        }
        // Fall back: include all project-scope memories when no metadata is present
        return true;
      });
    }

    return result;
  }
}
