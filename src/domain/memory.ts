/**
 * Memory Hierarchy Design
 *
 * Defines the scoping abstraction that layers on top of the flat
 * Observation → LongTermMemory → CoreMemory promotion chain.
 *
 * The hierarchy models how observations are scoped and promoted
 * across three levels:
 *   SessionMemory  — observations collected within a single session
 *   ProjectMemory  — aggregated observations across sessions for one project
 *   GlobalMemory   — observations promoted across all projects via count/time thresholds
 *
 * Inheritance chain:
 *   Memory (base)
 *     └── SessionMemory
 *     └── ProjectMemory  (aggregates multiple SessionMemory instances)
 *     └── GlobalMemory   (aggregates multiple ProjectMemory instances)
 *
 * Each concrete class wraps an underlying Observation, tracks its scope,
 * exposes promotion-eligibility checks against configurable thresholds,
 * and supports full serialization/deserialization for file-based persistence.
 *
 * @module domain/memory
 */

import type { Observation, LongTermMemory, Config } from '../core/types.ts';

// =============================================================================
// Scope Enumeration
// =============================================================================

/**
 * The three scoping levels in the memory hierarchy.
 * Determines how broadly an observation applies and where it is stored.
 */
export type MemoryScope = 'session' | 'project' | 'global';

// =============================================================================
// Serialized Formats (for persistence)
// =============================================================================

/**
 * Serialized representation of an Observation for JSON storage.
 * All Date fields are converted to ISO 8601 strings.
 */
export interface SerializedObservation {
  /** Unique identifier */
  id: string;
  /** Human-readable text */
  text: string;
  /** Observation category */
  category?: Observation['category'];
  /** Detection count */
  count: number;
  /** Lifecycle status */
  status: Observation['status'];
  /** Source session identifiers */
  sourceSessionIds: string[];
  /** ISO 8601 first-seen timestamp */
  firstSeen: string;
  /** ISO 8601 last-seen timestamp */
  lastSeen: string;
  /** Semantic tags */
  tags?: string[];
  /** Arbitrary metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Serialized representation of a Memory instance for JSON storage.
 * Captures all fields needed to reconstruct any Memory subclass.
 */
export interface SerializedMemory {
  /** Unique memory identifier */
  id: string;
  /** Scope level of this memory */
  scope: MemoryScope;
  /** The underlying observation in serialized form */
  observation: SerializedObservation;
  /** When this memory was created (ISO 8601) */
  createdAt: string;
  /** When this memory was last updated (ISO 8601) */
  updatedAt: string;
  /** Optional session identifier (present for SessionMemory) */
  sessionId?: string;
  /** Optional project identifier (present for ProjectMemory and GlobalMemory) */
  projectId?: string;
  /** Identifiers of child memories aggregated into this one */
  childMemoryIds?: string[];
}

// =============================================================================
// Promotion Eligibility
// =============================================================================

/**
 * Result of a promotion-eligibility check.
 */
export interface PromotionEligibilityResult {
  /** Whether the memory meets all promotion thresholds */
  eligible: boolean;
  /** Human-readable reason when not eligible */
  reason?: string;
  /** Current observation count */
  currentCount: number;
  /** Required observation count threshold */
  requiredCount: number;
  /** Days the memory has existed at its current scope */
  currentDays: number;
  /** Required days threshold for promotion */
  requiredDays: number;
}

// =============================================================================
// Serialization Helpers
// =============================================================================

/**
 * Convert a runtime Observation (with Date objects) to its serialized form.
 *
 * @param obs - Runtime observation
 * @returns Serialized observation with ISO 8601 date strings
 */
export function serializeObservation(obs: Observation): SerializedObservation {
  return {
    id: obs.id,
    text: obs.text,
    category: obs.category,
    count: obs.count,
    status: obs.status,
    sourceSessionIds: [...obs.sourceSessionIds],
    firstSeen: obs.firstSeen.toISOString(),
    lastSeen: obs.lastSeen.toISOString(),
    tags: obs.tags ? [...obs.tags] : undefined,
    metadata: obs.metadata ? { ...obs.metadata } : undefined,
  };
}

/**
 * Convert a serialized observation back to a runtime Observation with Date objects.
 *
 * @param serialized - Serialized observation from JSON storage
 * @returns Runtime observation with proper Date instances
 */
export function deserializeObservation(serialized: SerializedObservation): Observation {
  return {
    id: serialized.id,
    text: serialized.text,
    category: serialized.category,
    count: serialized.count,
    status: serialized.status,
    sourceSessionIds: [...serialized.sourceSessionIds],
    firstSeen: new Date(serialized.firstSeen),
    lastSeen: new Date(serialized.lastSeen),
    tags: serialized.tags ? [...serialized.tags] : undefined,
    metadata: serialized.metadata ? { ...serialized.metadata } : undefined,
  };
}

// =============================================================================
// Memory Base Class
// =============================================================================

/**
 * Base class for all memory hierarchy nodes.
 *
 * Holds a reference to the underlying Observation, tracks scope and
 * lifecycle timestamps, and provides shared methods for promotion
 * eligibility checking and serialization.
 *
 * Subclasses (SessionMemory, ProjectMemory, GlobalMemory) specialize
 * the scoping rules and aggregation semantics.
 */
export class Memory {
  /** Unique identifier for this memory node */
  readonly id: string;

  /** The observation this memory wraps */
  readonly observation: Observation;

  /** Scope level of this memory */
  readonly scope: MemoryScope;

  /** When this memory was created */
  readonly createdAt: Date;

  /** When this memory was last updated */
  updatedAt: Date;

  /** Identifiers of child memories that were aggregated into this one */
  protected childMemoryIds: string[];

  /**
   * Create a new Memory.
   *
   * @param observation - The underlying observation to wrap
   * @param scope - The scope level for this memory
   * @param id - Optional explicit ID (generated if omitted)
   * @param createdAt - Optional creation timestamp (defaults to now)
   * @param childMemoryIds - Optional child memory references
   */
  constructor(
    observation: Observation,
    scope: MemoryScope,
    id?: string,
    createdAt?: Date,
    childMemoryIds?: string[]
  ) {
    this.id = id ?? crypto.randomUUID();
    this.observation = observation;
    this.scope = scope;
    this.createdAt = createdAt ?? new Date();
    this.updatedAt = new Date();
    this.childMemoryIds = childMemoryIds ?? [];
  }

  /**
   * Check whether this memory is eligible for promotion to the next scope level.
   *
   * Promotion requires:
   * - observation.count >= config.promotion.observationCountThreshold
   * - days since createdAt >= config.promotion.longTermDaysThreshold
   *
   * @param config - Application configuration containing promotion thresholds
   * @returns Eligibility result with current values and thresholds
   */
  checkPromotionEligibility(config: Config): PromotionEligibilityResult {
    const requiredCount = config.promotion.observationCountThreshold;
    const requiredDays = config.promotion.longTermDaysThreshold;
    const currentCount = this.observation.count;
    const currentDays = this.daysSinceCreation();

    const meetsCountThreshold = currentCount >= requiredCount;
    const meetsDaysThreshold = currentDays >= requiredDays;

    const eligible = meetsCountThreshold && meetsDaysThreshold;

    let reason: string | undefined;
    if (!eligible) {
      const shortages: string[] = [];
      if (!meetsCountThreshold) {
        shortages.push(`count ${currentCount}/${requiredCount}`);
      }
      if (!meetsDaysThreshold) {
        shortages.push(`days ${currentDays}/${requiredDays}`);
      }
      reason = `Not eligible for promotion: ${shortages.join(', ')}`;
    }

    return { eligible, reason, currentCount, requiredCount, currentDays, requiredDays };
  }

  /**
   * Calculate the number of whole days since this memory was created.
   *
   * @returns Days elapsed (floored to whole number)
   */
  daysSinceCreation(): number {
    const nowMs = Date.now();
    const diffMs = nowMs - this.createdAt.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }

  /**
   * Retrieve the list of child memory identifiers aggregated into this memory.
   *
   * @returns Array of child memory IDs (empty for leaf-level SessionMemory)
   */
  getChildMemoryIds(): string[] {
    return [...this.childMemoryIds];
  }

  /**
   * Add a child memory reference to this memory's aggregation set.
   *
   * @param childId - Identifier of the child memory to reference
   */
  addChildMemoryId(childId: string): void {
    if (!this.childMemoryIds.includes(childId)) {
      this.childMemoryIds.push(childId);
      this.updatedAt = new Date();
    }
  }

  /**
   * Serialize this memory to a plain object suitable for JSON persistence.
   *
   * @returns Serialized memory with all Date fields as ISO 8601 strings
   */
  serialize(): SerializedMemory {
    return {
      id: this.id,
      scope: this.scope,
      observation: serializeObservation(this.observation),
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
      childMemoryIds: this.childMemoryIds.length > 0 ? [...this.childMemoryIds] : undefined,
    };
  }
}

// =============================================================================
// SessionMemory
// =============================================================================

/**
 * Memory scoped to a single conversation session.
 *
 * SessionMemory is the leaf of the hierarchy. Each observation extracted
 * during one session is initially represented as a SessionMemory. These
 * are later aggregated into ProjectMemory when multiple sessions touch
 * the same project.
 *
 * @example
 * ```typescript
 * const sessionMem = new SessionMemory(observation, 'session-abc-123');
 * const eligibility = sessionMem.checkPromotionEligibility(config);
 * if (eligibility.eligible) {
 *   // promote to ProjectMemory
 * }
 * ```
 */
export class SessionMemory extends Memory {
  /** The session this observation was extracted from */
  readonly sessionId: string;

  /**
   * Create a new SessionMemory.
   *
   * @param observation - The underlying observation
   * @param sessionId - Session identifier this observation belongs to
   * @param id - Optional explicit memory ID
   * @param createdAt - Optional creation timestamp
   */
  constructor(observation: Observation, sessionId: string, id?: string, createdAt?: Date) {
    super(observation, 'session', id, createdAt);
    this.sessionId = sessionId;
  }

  /**
   * Serialize this SessionMemory including the sessionId field.
   *
   * @returns Serialized memory with sessionId populated
   */
  serialize(): SerializedMemory {
    const base = super.serialize();
    return {
      ...base,
      sessionId: this.sessionId,
    };
  }
}

// =============================================================================
// ProjectMemory
// =============================================================================

/**
 * Memory scoped to a single project, aggregated across sessions.
 *
 * ProjectMemory collects and merges observations that originated from
 * multiple SessionMemory instances within the same project. The observation
 * count reflects how many times the pattern was seen across all contributing
 * sessions.
 *
 * @example
 * ```typescript
 * const projectMem = ProjectMemory.fromSessionMemories(projectId, sessionMemories);
 * projectMem.addChildMemoryId(sessionMem.id);
 * ```
 */
export class ProjectMemory extends Memory {
  /** The project this memory is scoped to */
  readonly projectId: string;

  /**
   * Create a new ProjectMemory.
   *
   * @param observation - The aggregated observation for this project scope
   * @param projectId - Project identifier
   * @param id - Optional explicit memory ID
   * @param createdAt - Optional creation timestamp
   * @param childMemoryIds - Optional session memory IDs that were aggregated
   */
  constructor(
    observation: Observation,
    projectId: string,
    id?: string,
    createdAt?: Date,
    childMemoryIds?: string[]
  ) {
    super(observation, 'project', id, createdAt, childMemoryIds);
    this.projectId = projectId;
  }

  /**
   * Factory method: create a ProjectMemory by aggregating an array of SessionMemory instances.
   *
   * Merges observation counts, unions sourceSessionIds, takes the earliest firstSeen
   * and the latest lastSeen, and unions all tags. The resulting observation text
   * is taken from the first SessionMemory in the array (representative text).
   *
   * @param projectId - Project identifier for the resulting memory
   * @param sessionMemories - Non-empty array of SessionMemory instances to aggregate
   * @returns A new ProjectMemory with merged observation data
   * @throws {Error} If sessionMemories is empty
   */
  static fromSessionMemories(projectId: string, sessionMemories: SessionMemory[]): ProjectMemory {
    const head = sessionMemories[0];
    if (!head) {
      throw new Error('Cannot create ProjectMemory from an empty array of SessionMemory instances');
    }

    const first = head.observation;
    let totalCount = 0;
    const sessionIdSet = new Set<string>();
    let earliestFirstSeen = first.firstSeen;
    let latestLastSeen = first.lastSeen;
    const tagSet = new Set<string>();
    const childIds: string[] = [];
    let mergedMetadata: Record<string, unknown> | undefined;

    for (const mem of sessionMemories) {
      const obs = mem.observation;
      totalCount += obs.count;

      for (const sid of obs.sourceSessionIds) {
        sessionIdSet.add(sid);
      }

      if (obs.firstSeen < earliestFirstSeen) {
        earliestFirstSeen = obs.firstSeen;
      }
      if (obs.lastSeen > latestLastSeen) {
        latestLastSeen = obs.lastSeen;
      }

      if (obs.tags) {
        for (const tag of obs.tags) {
          tagSet.add(tag);
        }
      }

      if (obs.metadata) {
        mergedMetadata = mergedMetadata ? { ...mergedMetadata, ...obs.metadata } : { ...obs.metadata };
      }

      childIds.push(mem.id);
    }

    const aggregatedObservation: Observation = {
      id: crypto.randomUUID(),
      text: first.text,
      category: first.category,
      count: totalCount,
      status: 'pending',
      sourceSessionIds: [...sessionIdSet],
      firstSeen: earliestFirstSeen,
      lastSeen: latestLastSeen,
      tags: tagSet.size > 0 ? [...tagSet] : undefined,
      metadata: mergedMetadata,
    };

    return new ProjectMemory(aggregatedObservation, projectId, undefined, undefined, childIds);
  }

  /**
   * Serialize this ProjectMemory including the projectId field.
   *
   * @returns Serialized memory with projectId populated
   */
  serialize(): SerializedMemory {
    const base = super.serialize();
    return {
      ...base,
      projectId: this.projectId,
    };
  }
}

// =============================================================================
// GlobalMemory
// =============================================================================

/**
 * Memory scoped globally across all projects.
 *
 * GlobalMemory is created when a pattern is observed repeatedly across
 * multiple projects, indicating that it is a universal preference or
 * workflow habit. GlobalMemory instances are candidates for promotion
 * to CoreMemory (written to CLAUDE.md or AGENTS.md).
 *
 * @example
 * ```typescript
 * const globalMem = GlobalMemory.fromProjectMemories(projectMemories);
 * const eligibility = globalMem.checkPromotionEligibility(config);
 * ```
 */
export class GlobalMemory extends Memory {
  /**
   * Create a new GlobalMemory.
   *
   * @param observation - The globally aggregated observation
   * @param id - Optional explicit memory ID
   * @param createdAt - Optional creation timestamp
   * @param childMemoryIds - Optional project memory IDs that were aggregated
   */
  constructor(
    observation: Observation,
    id?: string,
    createdAt?: Date,
    childMemoryIds?: string[]
  ) {
    super(observation, 'global', id, createdAt, childMemoryIds);
  }

  /**
   * Factory method: create a GlobalMemory by aggregating an array of ProjectMemory instances.
   *
   * Merges observation counts, unions sourceSessionIds, takes the earliest firstSeen
   * and latest lastSeen, unions tags, and merges metadata. The text is taken from
   * the first ProjectMemory (representative text).
   *
   * @param projectMemories - Non-empty array of ProjectMemory instances to aggregate
   * @returns A new GlobalMemory with merged observation data
   * @throws {Error} If projectMemories is empty
   */
  static fromProjectMemories(projectMemories: ProjectMemory[]): GlobalMemory {
    const head = projectMemories[0];
    if (!head) {
      throw new Error('Cannot create GlobalMemory from an empty array of ProjectMemory instances');
    }

    const first = head.observation;
    let totalCount = 0;
    const sessionIdSet = new Set<string>();
    let earliestFirstSeen = first.firstSeen;
    let latestLastSeen = first.lastSeen;
    const tagSet = new Set<string>();
    const childIds: string[] = [];
    let mergedMetadata: Record<string, unknown> | undefined;

    for (const mem of projectMemories) {
      const obs = mem.observation;
      totalCount += obs.count;

      for (const sid of obs.sourceSessionIds) {
        sessionIdSet.add(sid);
      }

      if (obs.firstSeen < earliestFirstSeen) {
        earliestFirstSeen = obs.firstSeen;
      }
      if (obs.lastSeen > latestLastSeen) {
        latestLastSeen = obs.lastSeen;
      }

      if (obs.tags) {
        for (const tag of obs.tags) {
          tagSet.add(tag);
        }
      }

      if (obs.metadata) {
        mergedMetadata = mergedMetadata ? { ...mergedMetadata, ...obs.metadata } : { ...obs.metadata };
      }

      childIds.push(mem.id);
    }

    const aggregatedObservation: Observation = {
      id: crypto.randomUUID(),
      text: first.text,
      category: first.category,
      count: totalCount,
      status: 'pending',
      sourceSessionIds: [...sessionIdSet],
      firstSeen: earliestFirstSeen,
      lastSeen: latestLastSeen,
      tags: tagSet.size > 0 ? [...tagSet] : undefined,
      metadata: mergedMetadata,
    };

    return new GlobalMemory(aggregatedObservation, undefined, undefined, childIds);
  }

  /**
   * Check whether this global memory is ready for core memory promotion.
   *
   * Core promotion requires:
   * - observation.count >= config.promotion.observationCountThreshold
   * - observation spans multiple projects (sourceSessionIds from >= 2 projects)
   * - days since createdAt >= config.promotion.longTermDaysThreshold
   *
   * @param config - Application configuration containing promotion thresholds
   * @returns Eligibility result with detailed threshold comparison
   */
  checkPromotionEligibility(config: Config): PromotionEligibilityResult {
    // Delegate count and days checks to the base class
    const baseResult = super.checkPromotionEligibility(config);

    // If base thresholds not met, return immediately
    if (!baseResult.eligible) {
      return baseResult;
    }

    // Additional global-scope check: must span at least 2 source sessions
    // (a proxy for multi-project presence since each project contributes sessions)
    if (this.observation.sourceSessionIds.length < 2) {
      return {
        ...baseResult,
        eligible: false,
        reason: 'Not eligible for core promotion: global memory must span at least 2 source sessions',
      };
    }

    return baseResult;
  }

  /**
   * Convert this GlobalMemory to the domain LongTermMemory type for integration
   * with the existing memory store promotion pipeline.
   *
   * @param promotedAt - Optional promotion timestamp (defaults to now)
   * @returns LongTermMemory compatible with MemoryStore.promoteToLongTerm()
   */
  toLongTermMemory(promotedAt?: Date): LongTermMemory {
    return {
      id: this.id,
      observation: this.observation,
      promotedAt: promotedAt ?? new Date(),
      status: 'approved',
    };
  }

  /**
   * Serialize this GlobalMemory.
   * GlobalMemory does not carry a projectId since it spans all projects.
   *
   * @returns Serialized memory
   */
  serialize(): SerializedMemory {
    return super.serialize();
  }
}

// =============================================================================
// MemoryFactory
// =============================================================================

/**
 * Factory for constructing Memory instances from serialized data or raw observations.
 *
 * Centralizes the creation logic so that downstream services
 * (MemoryPromotionService, storage layer) do not depend on constructor details.
 */
export class MemoryFactory {
  /**
   * Create a SessionMemory from an observation and session context.
   *
   * @param observation - The observation to wrap
   * @param sessionId - The session this observation originated from
   * @returns A new SessionMemory
   */
  static createSessionMemory(observation: Observation, sessionId: string): SessionMemory {
    return new SessionMemory(observation, sessionId);
  }

  /**
   * Create a ProjectMemory from an observation and project context.
   *
   * @param observation - The (possibly aggregated) observation
   * @param projectId - The project this observation is scoped to
   * @param childMemoryIds - Optional session memory IDs that contributed
   * @returns A new ProjectMemory
   */
  static createProjectMemory(
    observation: Observation,
    projectId: string,
    childMemoryIds?: string[]
  ): ProjectMemory {
    return new ProjectMemory(observation, projectId, undefined, undefined, childMemoryIds);
  }

  /**
   * Create a GlobalMemory from an observation spanning multiple projects.
   *
   * @param observation - The globally aggregated observation
   * @param childMemoryIds - Optional project memory IDs that contributed
   * @returns A new GlobalMemory
   */
  static createGlobalMemory(observation: Observation, childMemoryIds?: string[]): GlobalMemory {
    return new GlobalMemory(observation, undefined, undefined, childMemoryIds);
  }

  /**
   * Deserialize a SerializedMemory back into the appropriate Memory subclass.
   *
   * Dispatches on the scope field to reconstruct the correct concrete type.
   *
   * @param serialized - Serialized memory from JSON storage
   * @returns The reconstructed Memory subclass instance
   * @throws {Error} If the scope value is not recognized
   */
  static fromSerialized(serialized: SerializedMemory): Memory {
    const observation = deserializeObservation(serialized.observation);
    const createdAt = new Date(serialized.createdAt);
    const childMemoryIds = serialized.childMemoryIds;

    switch (serialized.scope) {
      case 'session': {
        if (!serialized.sessionId) {
          throw new Error('Serialized SessionMemory is missing sessionId');
        }
        return new SessionMemory(observation, serialized.sessionId, serialized.id, createdAt);
      }
      case 'project': {
        if (!serialized.projectId) {
          throw new Error('Serialized ProjectMemory is missing projectId');
        }
        return new ProjectMemory(
          observation,
          serialized.projectId,
          serialized.id,
          createdAt,
          childMemoryIds
        );
      }
      case 'global': {
        return new GlobalMemory(observation, serialized.id, createdAt, childMemoryIds);
      }
      default: {
        throw new Error(`Unknown memory scope: ${(serialized as SerializedMemory).scope}`);
      }
    }
  }
}

// =============================================================================
// Query Helpers
// =============================================================================

/**
 * Options for querying a collection of Memory instances by scope and other criteria.
 */
export interface MemoryQueryOptions {
  /** Filter by scope level */
  scope?: MemoryScope;
  /** Filter by minimum observation count */
  minCount?: number;
  /** Filter by observation category */
  category?: Observation['category'];
  /** Filter by tags (OR logic — matches if any tag matches) */
  tags?: string[];
  /** Only include memories eligible for promotion (requires config) */
  eligibleForPromotion?: boolean;
  /** Configuration required when eligibleForPromotion is true */
  config?: Config;
}

/**
 * Filter an array of Memory instances according to the provided query options.
 *
 * All options are ANDed together. When eligibleForPromotion is requested,
 * config must be supplied; memories failing the promotion check are excluded.
 *
 * @param memories - Array of Memory instances to filter
 * @param options - Query filter criteria
 * @returns Filtered array of matching memories
 */
export function queryMemories(memories: Memory[], options: MemoryQueryOptions): Memory[] {
  let results = memories;

  if (options.scope) {
    results = results.filter((m) => m.scope === options.scope);
  }

  if (options.minCount !== undefined) {
    results = results.filter((m) => m.observation.count >= options.minCount!);
  }

  if (options.category) {
    results = results.filter((m) => m.observation.category === options.category);
  }

  if (options.tags && options.tags.length > 0) {
    results = results.filter(
      (m) => m.observation.tags && m.observation.tags.some((t) => options.tags!.includes(t))
    );
  }

  if (options.eligibleForPromotion && options.config) {
    results = results.filter((m) => m.checkPromotionEligibility(options.config!).eligible);
  }

  return results;
}
