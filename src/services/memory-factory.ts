/**
 * Memory Factory Service
 *
 * Converts extracted observations (patterns) into scoped Memory objects
 * at the appropriate hierarchy level. Applies significance thresholds
 * to filter noise before memory creation.
 *
 * The factory operates as a pipeline:
 * 1. Receive a batch of observations and session context
 * 2. Filter out observations that fall below the significance threshold
 * 3. Determine the correct memory scope for each surviving observation
 * 4. Construct typed Memory instances (SessionMemory, ProjectMemory, GlobalMemory)
 * 5. Return the created items alongside diagnostic metadata
 *
 * Scope assignment rules:
 * - Single sourceSessionId  → SessionMemory (scoped to one session)
 * - Multiple sourceSessionIds from the same project → ProjectMemory
 * - Meets both count and time promotion thresholds → GlobalMemory (eligible)
 *
 * @module services/memory-factory
 */

import type { Observation, Config } from '../core/types.ts';
import type { MemoryScope } from '../domain/memory.ts';
import {
  Memory,
  SessionMemory,
  ProjectMemory,
  GlobalMemory,
} from '../domain/memory.ts';

// =============================================================================
// Configuration Types
// =============================================================================

/**
 * Configuration for the MemoryFactory.
 */
export interface MemoryFactoryConfig {
  /** Minimum observation count to create a memory (default: 1) */
  minSignificanceCount: number;

  /** Application-level config used for promotion threshold checks */
  config: Config;
}

// =============================================================================
// Result Types
// =============================================================================

/**
 * Outcome of a factory run.
 */
export interface FactoryResult {
  /** Created memory items, one per observation that passed filtering */
  memories: Memory[];

  /** Observations that were dropped because they fell below the significance threshold */
  filtered: Observation[];

  /** Total number of observations submitted to the factory (before filtering) */
  totalProcessed: number;
}

/**
 * Breakdown of how many memories were created at each scope level.
 */
export interface ScopeDistribution {
  /** Number of SessionMemory items created */
  session: number;

  /** Number of ProjectMemory items created */
  project: number;

  /** Number of GlobalMemory items created (eligible for promotion) */
  global: number;
}

// =============================================================================
// MemoryFactory
// =============================================================================

/**
 * Factory that converts Observation objects into appropriately-scoped Memory items.
 *
 * The factory is the bridge between the pattern extraction pipeline (which produces
 * raw Observation arrays) and the memory hierarchy (SessionMemory, ProjectMemory,
 * GlobalMemory). It applies significance filtering and scope determination so that
 * downstream consumers can work with typed, context-rich memory objects.
 *
 * @example
 * ```typescript
 * const factory = new MemoryFactory({
 *   minSignificanceCount: 2,
 *   config: appConfig,
 * });
 *
 * const result = factory.createFromObservations(
 *   observations,
 *   'session-abc-123',
 *   'my-project'
 * );
 *
 * console.log(result.memories.length); // number of memories created
 * console.log(result.filtered.length); // observations that were too noisy
 * ```
 */
export class MemoryFactory {
  private readonly minSignificanceCount: number;
  private readonly config: Config;

  /**
   * Create a new MemoryFactory.
   *
   * @param factoryConfig - Factory configuration including significance threshold and app config
   */
  constructor(factoryConfig: MemoryFactoryConfig) {
    this.minSignificanceCount = factoryConfig.minSignificanceCount ?? 1;
    this.config = factoryConfig.config;
  }

  // ===========================================================================
  // Primary Entry Point
  // ===========================================================================

  /**
   * Convert a batch of observations into Memory items.
   *
   * Observations are first filtered by significance (count threshold).
   * Surviving observations are then assigned a scope and converted
   * into the corresponding Memory subclass.
   *
   * @param observations - Raw observations to process
   * @param sessionId - ID of the originating session (used for SessionMemory context)
   * @param projectSlug - Optional project identifier (used for ProjectMemory context)
   * @returns Factory result containing created memories, filtered-out observations, and totals
   */
  createFromObservations(
    observations: Observation[],
    sessionId: string,
    projectSlug?: string
  ): FactoryResult {
    const memories: Memory[] = [];
    const filtered: Observation[] = [];

    for (const observation of observations) {
      if (!this.meetsSignificanceThreshold(observation)) {
        filtered.push(observation);
        continue;
      }

      const scope = this.determineScope(observation);
      const memory = MemoryFactory.createMemoryItem(observation, scope, sessionId, projectSlug);
      memories.push(memory);
    }

    return {
      memories,
      filtered,
      totalProcessed: observations.length,
    };
  }

  // ===========================================================================
  // Scope Determination
  // ===========================================================================

  /**
   * Determine the appropriate memory scope for an observation.
   *
   * Logic:
   * - If the observation was seen in exactly one session → SessionMemory scope
   * - If the observation meets both count + time thresholds for global promotion → GlobalMemory
   * - Otherwise (multi-session but not yet globally eligible) → ProjectMemory scope
   *
   * @param observation - The observation to classify
   * @returns The determined MemoryScope
   */
  determineScope(observation: Observation): MemoryScope {
    const uniqueSessions = new Set(observation.sourceSessionIds);

    // Single-session observation: scope to the session
    if (uniqueSessions.size <= 1) {
      return 'session';
    }

    // Multi-session observation: check if it qualifies for global scope
    if (this.isEligibleForGlobalScope(observation)) {
      return 'global';
    }

    // Multi-session but not yet globally eligible: project scope
    return 'project';
  }

  // ===========================================================================
  // Significance Filtering
  // ===========================================================================

  /**
   * Check whether an observation meets the minimum significance threshold.
   *
   * An observation is considered significant if its detection count
   * is at or above the configured minSignificanceCount. This filters
   * out one-off noise before memory objects are allocated.
   *
   * @param observation - The observation to evaluate
   * @returns true if the observation is significant enough to become a memory
   */
  meetsSignificanceThreshold(observation: Observation): boolean {
    return observation.count >= this.minSignificanceCount;
  }

  // ===========================================================================
  // Memory Item Construction
  // ===========================================================================

  /**
   * Construct a typed Memory from an observation and a determined scope.
   *
   * Delegates to the appropriate Memory subclass constructor based on scope:
   * - 'session'  → SessionMemory
   * - 'project'  → ProjectMemory
   * - 'global'   → GlobalMemory
   *
   * @param observation - The source observation
   * @param scope - The determined memory scope
   * @param sessionId - Optional session identifier (required for SessionMemory)
   * @param projectSlug - Optional project identifier (required for ProjectMemory)
   * @returns A Memory instance of the appropriate subclass
   */
  static createMemoryItem(
    observation: Observation,
    scope: MemoryScope,
    sessionId?: string,
    projectSlug?: string
  ): Memory {
    const id = crypto.randomUUID();
    const createdAt = new Date();

    switch (scope) {
      case 'session':
        return new SessionMemory(observation, sessionId ?? '', id, createdAt);

      case 'project':
        return new ProjectMemory(observation, projectSlug ?? '', id, createdAt);

      case 'global':
        return new GlobalMemory(observation, id, createdAt);
    }
  }

  // ===========================================================================
  // Promotion Eligibility (Private Helpers)
  // ===========================================================================

  /**
   * Determine whether an observation qualifies for GlobalMemory scope.
   *
   * An observation is globally eligible when both:
   * 1. Its count meets or exceeds config.promotion.observationCountThreshold
   * 2. It has existed long enough: the number of days between firstSeen and
   *    now is at least config.promotion.longTermDaysThreshold
   *
   * @param observation - The observation to evaluate
   * @returns true if the observation meets global promotion thresholds
   */
  private isEligibleForGlobalScope(observation: Observation): boolean {
    const countThreshold = this.config.promotion.observationCountThreshold;
    const daysThreshold = this.config.promotion.longTermDaysThreshold;

    if (observation.count < countThreshold) {
      return false;
    }

    const now = new Date();
    const daysSinceFirstSeen =
      (now.getTime() - observation.firstSeen.getTime()) / (1000 * 60 * 60 * 24);

    return daysSinceFirstSeen >= daysThreshold;
  }

  // ===========================================================================
  // Diagnostics
  // ===========================================================================

  /**
   * Compute a breakdown of how many memories were created at each scope level.
   *
   * Useful for monitoring and debugging the factory's classification logic.
   *
   * @param memories - Array of Memory objects (typically from a FactoryResult)
   * @returns Distribution counts by scope
   */
  static computeScopeDistribution(memories: Memory[]): ScopeDistribution {
    const distribution: ScopeDistribution = {
      session: 0,
      project: 0,
      global: 0,
    };

    for (const memory of memories) {
      switch (memory.scope) {
        case 'session':
          distribution.session++;
          break;
        case 'project':
          distribution.project++;
          break;
        case 'global':
          distribution.global++;
          break;
      }
    }

    return distribution;
  }
}
