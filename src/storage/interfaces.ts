/**
 * Storage interface definitions for Sanj.
 *
 * This file defines the contracts for all storage operations without implementing them.
 * Actual implementations are provided by file-based stores (storage/file-store.ts).
 *
 * The storage layer manages three primary entities:
 * - Observations: Extracted patterns from sessions
 * - LongTermMemory: Promoted observations that have proven valuable
 * - Sessions: Metadata about AI assistant conversations (read-only from external tools)
 *
 * Design principles:
 * - Interfaces define contracts, not implementations
 * - All operations are asynchronous (Promise-based)
 * - Storage operations are atomic and safe for concurrent access
 * - Query operations support filtering and pagination
 * - Error handling follows the SanjError pattern
 */

import type {
  Observation,
  Session,
  LongTermMemory,
  CoreMemory,
} from '../core/types.ts';

// =============================================================================
// Common Storage Types
// =============================================================================

/**
 * Reference to a session that contributed to an observation.
 */
export interface SessionRef {
  /** Session identifier */
  sessionId: string;

  /** When this session contributed to the observation */
  timestamp: Date;
}

/**
 * Options for filtering observations.
 */
export interface ObservationQueryOptions {
  /** Filter by status */
  status?: Observation['status'] | Observation['status'][];

  /** Filter by date range (firstSeen or lastSeen) */
  dateRange?: {
    start?: Date;
    end?: Date;
    field?: 'firstSeen' | 'lastSeen';
  };

  /** Filter by minimum count */
  countThreshold?: number;

  /** Filter by category */
  category?: Observation['category'];

  /** Filter by tags (OR logic - matches if any tag matches) */
  tags?: string[];

  /** Filter by session source */
  sessionIds?: string[];
}

/**
 * Options for filtering sessions.
 */
export interface SessionQueryOptions {
  /** Filter by tool type */
  tool?: Session['tool'];

  /** Filter by project */
  projectSlug?: string;

  /** Filter by date range */
  dateRange?: {
    start?: Date;
    end?: Date;
    field?: 'createdAt' | 'modifiedAt';
  };

  /** Minimum message count */
  minMessages?: number;
}

/**
 * Options for filtering long-term memories.
 */
export interface MemoryQueryOptions {
  /** Filter by status */
  status?: LongTermMemory['status'] | LongTermMemory['status'][];

  /** Filter by promotion date range */
  dateRange?: {
    start?: Date;
    end?: Date;
  };

  /** Only return memories eligible for core promotion */
  eligibleForCore?: boolean;

  /** Minimum observation count */
  minCount?: number;

  /** Minimum days in long-term memory */
  minDays?: number;
}

/**
 * Pagination options for query operations.
 */
export interface PaginationOptions {
  /** Number of items to skip */
  offset: number;

  /** Maximum number of items to return */
  limit: number;
}

/**
 * Sort options for query operations.
 */
export interface SortOptions<T> {
  /** Field to sort by */
  field: keyof T;

  /** Sort direction */
  direction: 'asc' | 'desc';
}

/**
 * Result of a promotion operation.
 */
export interface PromotionResult {
  /** Whether promotion succeeded */
  success: boolean;

  /** ID of the promoted item (if successful) */
  id?: string;

  /** Reason for failure (if unsuccessful) */
  reason?: string;
}

// =============================================================================
// Base Storage Interface
// =============================================================================

/**
 * Base interface for all storage implementations.
 * Provides common lifecycle methods for loading and persisting data.
 */
export interface IStore {
  /**
   * Initialize the store by loading data from persistent storage.
   * Called once during application startup or before first use.
   *
   * @throws {SanjError} If storage file is corrupted or inaccessible
   */
  load(): Promise<void>;

  /**
   * Persist current state to storage.
   * Uses atomic write pattern (temp file + rename) for data integrity.
   *
   * @throws {SanjError} If write operation fails
   */
  save(): Promise<void>;

  /**
   * Get count of all items in the store.
   */
  count(): Promise<number>;

  /**
   * Clear all data from the store (use with caution).
   * Primarily for testing or reset operations.
   */
  clear(): Promise<void>;
}

// =============================================================================
// Observation Store Interface
// =============================================================================

/**
 * Storage interface for managing observations (extracted patterns).
 *
 * Observations represent patterns and insights extracted from AI assistant sessions.
 * The store manages the complete lifecycle:
 * - Creation from LLM extraction results
 * - Deduplication via semantic similarity checks
 * - Status transitions (pending → approved → promoted)
 * - Count tracking for promotion thresholds
 * - Query and filtering for TUI display
 *
 * Thread safety: All operations are atomic. The store uses in-memory state
 * with periodic saves to disk. Concurrent operations are safe within a single process.
 */
export interface IObservationStore extends IStore {
  // ---------------------------------------------------------------------------
  // Create Operations
  // ---------------------------------------------------------------------------

  /**
   * Create a new observation.
   * Auto-generates ID and sets firstSeen/lastSeen timestamps.
   *
   * @param observation - Observation data (omit id, firstSeen, lastSeen)
   * @returns Created observation with generated ID
   */
  create(observation: Omit<Observation, 'id' | 'firstSeen' | 'lastSeen'>): Promise<Observation>;

  /**
   * Create multiple observations in a single operation.
   * More efficient than individual creates for batch imports.
   *
   * @param observations - Array of observation data
   * @returns Array of created observations with generated IDs
   */
  bulkCreate(observations: Array<Omit<Observation, 'id' | 'firstSeen' | 'lastSeen'>>): Promise<Observation[]>;

  // ---------------------------------------------------------------------------
  // Read Operations
  // ---------------------------------------------------------------------------

  /**
   * Retrieve a single observation by ID.
   *
   * @param id - Observation identifier
   * @returns Observation if found, null otherwise
   */
  getById(id: string): Promise<Observation | null>;

  /**
   * Get all observations (use with caution on large datasets).
   * Consider using query() with pagination for better performance.
   *
   * @returns All observations
   */
  getAll(): Promise<Observation[]>;

  /**
   * Get all observations awaiting user review.
   * Shortcut for query({ status: 'pending' }).
   *
   * @returns Pending observations
   */
  getPending(): Promise<Observation[]>;

  /**
   * Get all approved observations.
   * Shortcut for query({ status: 'approved' }).
   *
   * @returns Approved observations
   */
  getApproved(): Promise<Observation[]>;

  /**
   * Get all denied observations.
   * Shortcut for query({ status: 'denied' }).
   *
   * @returns Denied observations
   */
  getDenied(): Promise<Observation[]>;

  /**
   * Get observations by status.
   *
   * @param status - Lifecycle status to filter by
   * @returns Observations matching status
   */
  getByStatus(status: Observation['status']): Promise<Observation[]>;

  /**
   * Query observations with flexible filtering.
   *
   * @param options - Query filters (all filters are ANDed together)
   * @param pagination - Optional pagination
   * @param sort - Optional sort order
   * @returns Matching observations
   */
  query(
    options: ObservationQueryOptions,
    pagination?: PaginationOptions,
    sort?: SortOptions<Observation>
  ): Promise<Observation[]>;

  /**
   * Execute custom filter predicate on all observations.
   * Use query() with options when possible for better performance.
   *
   * @param predicate - Filter function
   * @returns Observations matching predicate
   */
  filter(predicate: (obs: Observation) => boolean): Promise<Observation[]>;

  // ---------------------------------------------------------------------------
  // Update Operations
  // ---------------------------------------------------------------------------

  /**
   * Increment observation count (when pattern seen again).
   * Also updates lastSeen timestamp.
   *
   * @param id - Observation identifier
   * @param increment - Amount to increment (default: 1)
   * @returns Updated observation
   * @throws {SanjError} If observation not found
   */
  incrementCount(id: string, increment?: number): Promise<Observation>;

  /**
   * Update lastSeen timestamp to current time.
   *
   * @param id - Observation identifier
   * @returns Updated observation
   * @throws {SanjError} If observation not found
   */
  updateLastSeen(id: string): Promise<Observation>;

  /**
   * Change observation status (lifecycle transition).
   *
   * @param id - Observation identifier
   * @param status - New status
   * @returns Updated observation
   * @throws {SanjError} If observation not found
   */
  setStatus(id: string, status: Observation['status']): Promise<Observation>;

  /**
   * Add a session reference to an observation.
   * Records that this session contributed to the pattern.
   *
   * @param id - Observation identifier
   * @param sessionId - Session that contributed to this observation
   * @returns Updated observation
   * @throws {SanjError} If observation not found
   */
  addSessionRef(id: string, sessionId: string): Promise<Observation>;

  /**
   * Partial update of observation fields.
   *
   * @param id - Observation identifier
   * @param partial - Fields to update
   * @returns Updated observation
   * @throws {SanjError} If observation not found
   */
  update(id: string, partial: Partial<Observation>): Promise<Observation>;

  /**
   * Batch update multiple observations.
   * More efficient than individual updates.
   *
   * @param updates - Array of update operations
   * @returns Updated observations
   * @throws {SanjError} If any observation not found
   */
  bulkUpdate(updates: Array<{ id: string; partial: Partial<Observation> }>): Promise<Observation[]>;

  // ---------------------------------------------------------------------------
  // Delete Operations
  // ---------------------------------------------------------------------------

  /**
   * Delete a single observation by ID.
   *
   * @param id - Observation identifier
   * @returns true if deleted, false if not found
   */
  delete(id: string): Promise<boolean>;

  /**
   * Delete all observations with a given status.
   * Use with caution - typically used for cleanup operations.
   *
   * @param status - Status to delete
   * @returns Number of observations deleted
   */
  deleteByStatus(status: Observation['status']): Promise<number>;

  // ---------------------------------------------------------------------------
  // Special Operations
  // ---------------------------------------------------------------------------

  /**
   * Find semantically similar observation.
   * Used for deduplication during pattern extraction.
   *
   * Delegates to LLMAdapter.checkSimilarity() for semantic comparison.
   * Returns first match above similarity threshold (configured in Config).
   *
   * @param observation - Observation to find similar match for
   * @returns Similar observation if found, null otherwise
   */
  findSimilar(observation: Observation): Promise<Observation | null>;

  /**
   * Get observations that meet promotion thresholds.
   * Filters by count threshold from config and approved status.
   *
   * @returns Observations ready for promotion to long-term memory
   */
  getPromotable(): Promise<Observation[]>;
}

// =============================================================================
// Memory Store Interface
// =============================================================================

/**
 * Storage interface for managing the memory hierarchy.
 *
 * Handles promotion of observations through memory levels:
 * 1. Observation (pending review)
 * 2. Long-Term Memory (approved, frequently seen)
 * 3. Core Memory (written to CLAUDE.md / AGENTS.md)
 *
 * Promotion logic:
 * - Observation → Long-Term: User approves + meets count threshold
 * - Long-Term → Core: User approves + meets count + time thresholds
 */
export interface IMemoryStore extends IStore {
  // ---------------------------------------------------------------------------
  // Create/Promotion Operations
  // ---------------------------------------------------------------------------

  /**
   * Promote an observation to long-term memory.
   * Creates a new LongTermMemory entry with reference to the observation.
   *
   * Prerequisites:
   * - Observation must exist in ObservationStore
   * - Observation must be approved
   * - Observation must meet count threshold
   *
   * @param observationId - ID of observation to promote
   * @returns Promotion result with new memory ID if successful
   */
  promoteToLongTerm(observationId: string): Promise<PromotionResult>;

  /**
   * Promote a long-term memory to core memory.
   * Writes to external files (CLAUDE.md, AGENTS.md) via CoreMemoryAdapter.
   *
   * Prerequisites:
   * - Memory must exist
   * - Memory must meet time threshold (days in long-term)
   * - Memory observation must meet count threshold
   * - User must approve
   *
   * @param memoryId - ID of long-term memory to promote
   * @param targets - Which core memory files to write to
   * @returns Promotion result with core memory ID if successful
   */
  promoteToCore(
    memoryId: string,
    targets: Array<'claude_md' | 'agents_md'>
  ): Promise<PromotionResult>;

  // ---------------------------------------------------------------------------
  // Read Operations
  // ---------------------------------------------------------------------------

  /**
   * Get all long-term memories.
   *
   * @returns All long-term memories
   */
  getAll(): Promise<LongTermMemory[]>;

  /**
   * Get a specific memory by ID.
   *
   * @param id - Memory identifier
   * @returns Memory if found, null otherwise
   */
  getById(id: string): Promise<LongTermMemory | null>;

  /**
   * Query memories with filtering options.
   *
   * @param options - Query filters
   * @param pagination - Optional pagination
   * @param sort - Optional sort order
   * @returns Matching memories
   */
  query(
    options: MemoryQueryOptions,
    pagination?: PaginationOptions,
    sort?: SortOptions<LongTermMemory>
  ): Promise<LongTermMemory[]>;

  /**
   * Get memories ready for core promotion.
   * Filters by time threshold and count threshold from config.
   *
   * @returns Memories eligible for core promotion
   */
  getPromotableToCore(): Promise<LongTermMemory[]>;

  /**
   * Get count of memories at each level.
   *
   * @returns Counts for pending, long-term, and core memories
   */
  getCounts(): Promise<{
    pending: number;
    longTerm: number;
    core: number;
  }>;

  // ---------------------------------------------------------------------------
  // Validation Operations
  // ---------------------------------------------------------------------------

  /**
   * Check if a memory meets thresholds for core promotion.
   *
   * Checks:
   * - Observation count >= config.promotion.observationCountThreshold
   * - Days in long-term >= config.promotion.longTermDaysThreshold
   *
   * @param memory - Memory to check
   * @returns true if eligible, false otherwise
   */
  isEligibleForCorePromotion(memory: LongTermMemory): boolean;

  /**
   * Calculate days since promotion to long-term memory.
   *
   * @param memory - Memory to check
   * @returns Number of days in long-term memory
   */
  daysSinceLongTermPromotion(memory: LongTermMemory): number;

  // ---------------------------------------------------------------------------
  // Update Operations
  // ---------------------------------------------------------------------------

  /**
   * Update memory status.
   *
   * @param id - Memory identifier
   * @param status - New status
   * @returns Updated memory
   * @throws {SanjError} If memory not found
   */
  setStatus(id: string, status: LongTermMemory['status']): Promise<LongTermMemory>;

  /**
   * Delete a long-term memory.
   *
   * @param id - Memory identifier
   * @returns true if deleted, false if not found
   */
  delete(id: string): Promise<boolean>;
}

// =============================================================================
// Session Store Interface
// =============================================================================

/**
 * Storage interface for managing session metadata.
 *
 * Note: Sessions are read-only from external tools (Claude Code, OpenCode).
 * This store provides indexing and querying for performance optimization,
 * but does NOT manage the source session files themselves.
 *
 * Optional implementation: Can be omitted in v1 if performance is acceptable
 * without caching. Add later if needed for:
 * - Fast queries over large session histories
 * - Offline access to session metadata
 * - Cross-session pattern analysis
 */
export interface ISessionStore extends IStore {
  /**
   * Index a session for faster querying.
   * Stores metadata only, not full conversation content.
   *
   * @param session - Session to index
   * @returns Indexed session
   */
  index(session: Session): Promise<Session>;

  /**
   * Bulk index multiple sessions.
   * More efficient than individual index calls.
   *
   * @param sessions - Sessions to index
   * @returns Indexed sessions
   */
  bulkIndex(sessions: Session[]): Promise<Session[]>;

  /**
   * Get a session by ID.
   *
   * @param id - Session identifier
   * @returns Session if found, null otherwise
   */
  getById(id: string): Promise<Session | null>;

  /**
   * Get sessions modified since a timestamp.
   * Used for incremental analysis.
   *
   * @param since - Timestamp to filter by
   * @returns Sessions modified since timestamp
   */
  getSince(since: Date): Promise<Session[]>;

  /**
   * Query sessions with filtering.
   *
   * @param options - Query filters
   * @param pagination - Optional pagination
   * @param sort - Optional sort order
   * @returns Matching sessions
   */
  query(
    options: SessionQueryOptions,
    pagination?: PaginationOptions,
    sort?: SortOptions<Session>
  ): Promise<Session[]>;

  /**
   * Update session metadata.
   * Used when re-scanning sessions after modification.
   *
   * @param id - Session identifier
   * @param partial - Fields to update
   * @returns Updated session
   * @throws {SanjError} If session not found
   */
  update(id: string, partial: Partial<Session>): Promise<Session>;

  /**
   * Remove session from index.
   * Does NOT delete the source session file.
   *
   * @param id - Session identifier
   * @returns true if removed, false if not found
   */
  remove(id: string): Promise<boolean>;
}

// =============================================================================
// Re-exports
// =============================================================================

// Re-export types used in interfaces for convenience
export type { Observation, Session, LongTermMemory, CoreMemory };
