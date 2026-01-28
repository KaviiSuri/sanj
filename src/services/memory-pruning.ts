/**
 * Memory Pruning Service
 *
 * Removes stale and low-significance memories from both the long-term memory
 * store and the observation store, keeping the memory hierarchy manageable
 * over time.
 *
 * Pruning rules for long-term memories:
 * - Stale: the underlying observation has not been seen for more than
 *   `PruningConfig.staleDays` (default 90).
 * - Low-significance: the underlying observation `count` is below
 *   `PruningConfig.minRetainCount` (default 1, i.e. keep everything with
 *   at least one occurrence).
 * - Denied: long-term memories whose status is `'denied'` are removed when
 *   `PruningConfig.pruneDenied` is enabled (default true).
 *
 * Pruning rules for observations:
 * - Denied observations are removed when `pruneDenied` is enabled.
 * - Pending observations that have been stale (not seen within `staleDays`)
 *   are removed.
 *
 * Every public method honours the `dryRun` flag: when enabled, the service
 * computes what *would* be pruned and returns the report without performing
 * any deletions.
 *
 * @module services/memory-pruning
 */

import type { LongTermMemory, Observation } from '../core/types.ts';
import type { IMemoryStore, IObservationStore } from '../storage/interfaces.ts';

// =============================================================================
// Configuration
// =============================================================================

/**
 * Tuning knobs for the pruning service.
 */
export interface PruningConfig {
  /** Max days since lastSeen before a memory is considered stale (default: 90) */
  staleDays: number;

  /** Minimum observation count required to retain a memory (default: 1,
   *  meaning everything with at least one occurrence is kept) */
  minRetainCount: number;

  /** Whether denied observations and memories should be pruned (default: true) */
  pruneDenied: boolean;

  /** When true, no deletions are performed — results describe what *would*
   *  be pruned (default: false) */
  dryRun: boolean;
}

/**
 * Sensible defaults that preserve data aggressively while still removing
 * truly abandoned entries.
 */
const DEFAULT_PRUNING_CONFIG: PruningConfig = {
  staleDays: 90,
  minRetainCount: 1,
  pruneDenied: true,
  dryRun: false,
};

// =============================================================================
// Result Types
// =============================================================================

/**
 * Represents a single item that was (or would be) pruned.
 */
export interface PrunedItem {
  /** ID of the pruned entity (long-term memory ID or observation ID) */
  id: string;

  /** Why this item was targeted for pruning */
  reason: 'stale' | 'low-significance' | 'denied' | 'manual';

  /** Days elapsed since the observation was last seen (present for stale items) */
  daysSinceLastSeen?: number;

  /** The observation count at evaluation time (present for low-significance items) */
  count?: number;

  /** Human-readable text of the underlying observation */
  text: string;
}

/**
 * Summary of a pruning operation (or dry-run preview).
 */
export interface PruneResult {
  /** Items that were (or would be) pruned */
  pruned: PrunedItem[];

  /** Total number of entities evaluated during the run */
  totalEvaluated: number;

  /** Whether this result came from a dry-run (no deletions performed) */
  isDryRun: boolean;

  /** Wall-clock timestamp when the pruning operation completed */
  timestamp: Date;
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Compute the number of whole days between a reference date and a past date.
 * Clamps to zero so the result is never negative.
 *
 * @param since - The earlier date (e.g. lastSeen)
 * @param now   - The later reference date (defaults to current time)
 * @returns Non-negative number of days elapsed
 */
function daysSince(since: Date, now: Date = new Date()): number {
  const ms = now.getTime() - since.getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

// =============================================================================
// MemoryPruningService
// =============================================================================

/**
 * Orchestrates the removal of stale, low-significance, and denied entries
 * from both the long-term memory and observation stores.
 *
 * Dependencies are injected via the constructor for testability:
 * - `memoryStore`      : reads and deletes long-term memories
 * - `observationStore` : reads and deletes observations
 * - `pruningConfig`    : threshold values and dry-run toggle
 *
 * All public methods respect the `dryRun` flag.  When dry-run is active the
 * service performs all evaluations and builds the full result set but skips
 * every store deletion call.
 *
 * @example
 * ```typescript
 * const service = new MemoryPruningService(
 *   memoryStore,
 *   observationStore,
 *   { staleDays: 60, minRetainCount: 2, pruneDenied: true, dryRun: false }
 * );
 *
 * // Preview what would be pruned without deleting anything
 * const report = await service.getDryRunReport();
 *
 * // Execute the prune
 * const result = await service.pruneMemories();
 * ```
 */
export class MemoryPruningService {
  private readonly memoryStore: IMemoryStore;
  private readonly observationStore: IObservationStore;
  private readonly config: PruningConfig;

  /**
   * Create a MemoryPruningService.
   *
   * @param memoryStore      - Store for reading and deleting long-term memories
   * @param observationStore - Store for reading and deleting observations
   * @param pruningConfig    - Pruning thresholds and flags (defaults applied for
   *                            any omitted fields)
   */
  constructor(
    memoryStore: IMemoryStore,
    observationStore: IObservationStore,
    pruningConfig: Partial<PruningConfig> = {}
  ) {
    this.memoryStore = memoryStore;
    this.observationStore = observationStore;
    this.config = { ...DEFAULT_PRUNING_CONFIG, ...pruningConfig };
  }

  // ---------------------------------------------------------------------------
  // Public API: Bulk Pruning
  // ---------------------------------------------------------------------------

  /**
   * Evaluate all long-term memories against the configured pruning rules and
   * remove those that qualify.
   *
   * A memory is pruned when ANY of these conditions holds:
   * 1. **Stale** — `observation.lastSeen` is older than `staleDays`
   * 2. **Low-significance** — `observation.count` < `minRetainCount`
   * 3. **Denied** — memory `status === 'denied'` and `pruneDenied` is enabled
   *
   * When `dryRun` is true, deletions are skipped but the full result set is
   * still returned so callers can preview the outcome.
   *
   * @returns A PruneResult describing every item that was (or would be) pruned
   */
  async pruneMemories(): Promise<PruneResult> {
    const now = new Date();
    const memories = await this.memoryStore.getAll();
    const prunedItems: PrunedItem[] = [];

    for (const memory of memories) {
      const item = this.evaluateMemoryForPruning(memory, now);
      if (item) {
        if (!this.config.dryRun) {
          await this.memoryStore.delete(memory.id);
        }
        prunedItems.push(item);
      }
    }

    return {
      pruned: prunedItems,
      totalEvaluated: memories.length,
      isDryRun: this.config.dryRun,
      timestamp: new Date(),
    };
  }

  /**
   * Evaluate all observations against pruning rules and remove those that
   * qualify.
   *
   * An observation is pruned when ANY of these conditions holds:
   * 1. **Denied** — `status === 'denied'` and `pruneDenied` is enabled
   * 2. **Stale pending** — `status === 'pending'` and `lastSeen` is older
   *    than `staleDays`
   *
   * When `dryRun` is true, deletions are skipped but the full result set is
   * still returned.
   *
   * @returns A PruneResult describing every observation that was (or would be)
   *          pruned
   */
  async pruneObservations(): Promise<PruneResult> {
    const now = new Date();
    const observations = await this.observationStore.getAll();
    const prunedItems: PrunedItem[] = [];

    for (const obs of observations) {
      const item = this.evaluateObservationForPruning(obs, now);
      if (item) {
        if (!this.config.dryRun) {
          await this.observationStore.delete(obs.id);
        }
        prunedItems.push(item);
      }
    }

    return {
      pruned: prunedItems,
      totalEvaluated: observations.length,
      isDryRun: this.config.dryRun,
      timestamp: new Date(),
    };
  }

  // ---------------------------------------------------------------------------
  // Public API: Manual Pruning
  // ---------------------------------------------------------------------------

  /**
   * Delete a specific long-term memory by ID regardless of whether it meets
   * any automatic pruning criteria.
   *
   * This is an escape hatch for operators who want to remove a particular
   * entry without waiting for threshold-based pruning.  When `dryRun` is
   * true, the deletion is skipped and the result still reports the item as
   * pruned for preview purposes.
   *
   * @param id - The long-term memory identifier to remove
   * @returns A PruneResult with a single entry if the memory existed, or
   *          an empty result if no memory matched the given ID
   */
  async pruneById(id: string): Promise<PruneResult> {
    const memory = await this.memoryStore.getById(id);

    if (!memory) {
      return {
        pruned: [],
        totalEvaluated: 1,
        isDryRun: this.config.dryRun,
        timestamp: new Date(),
      };
    }

    const item: PrunedItem = {
      id: memory.id,
      reason: 'manual',
      text: memory.observation.text,
      count: memory.observation.count,
      daysSinceLastSeen: daysSince(memory.observation.lastSeen),
    };

    if (!this.config.dryRun) {
      await this.memoryStore.delete(id);
    }

    return {
      pruned: [item],
      totalEvaluated: 1,
      isDryRun: this.config.dryRun,
      timestamp: new Date(),
    };
  }

  // ---------------------------------------------------------------------------
  // Public API: Preview / Query Methods
  // ---------------------------------------------------------------------------

  /**
   * Return all long-term memories whose underlying observation has not been
   * seen within `staleDays`.  No deletions are performed regardless of the
   * `dryRun` setting — this method is purely informational.
   *
   * @returns Array of PrunedItems describing each stale memory
   */
  async getStaleMemories(): Promise<PrunedItem[]> {
    const now = new Date();
    const memories = await this.memoryStore.getAll();

    return memories
      .filter((mem) => {
        const days = daysSince(mem.observation.lastSeen, now);
        return days > this.config.staleDays;
      })
      .map((mem) => ({
        id: mem.id,
        reason: 'stale' as const,
        daysSinceLastSeen: daysSince(mem.observation.lastSeen, now),
        count: mem.observation.count,
        text: mem.observation.text,
      }));
  }

  /**
   * Return all long-term memories whose underlying observation count is
   * below `minRetainCount`.  No deletions are performed regardless of the
   * `dryRun` setting — this method is purely informational.
   *
   * @returns Array of PrunedItems describing each low-significance memory
   */
  async getLowSignificanceMemories(): Promise<PrunedItem[]> {
    const now = new Date();
    const memories = await this.memoryStore.getAll();

    return memories
      .filter((mem) => mem.observation.count < this.config.minRetainCount)
      .map((mem) => ({
        id: mem.id,
        reason: 'low-significance' as const,
        daysSinceLastSeen: daysSince(mem.observation.lastSeen, now),
        count: mem.observation.count,
        text: mem.observation.text,
      }));
  }

  /**
   * Generate a full dry-run report combining stale, low-significance, and
   * denied memories that would be pruned by `pruneMemories()`.
   *
   * This is equivalent to calling `pruneMemories()` with `dryRun: true` but
   * is provided as a dedicated entry point for clarity.  The returned result
   * always has `isDryRun: true` regardless of the instance's own `dryRun`
   * setting — this method never deletes.
   *
   * @returns A PruneResult previewing what would be removed
   */
  async getDryRunReport(): Promise<PruneResult> {
    const now = new Date();
    const memories = await this.memoryStore.getAll();
    const prunedItems: PrunedItem[] = [];

    for (const memory of memories) {
      const item = this.evaluateMemoryForPruning(memory, now);
      if (item) {
        prunedItems.push(item);
      }
    }

    return {
      pruned: prunedItems,
      totalEvaluated: memories.length,
      isDryRun: true,
      timestamp: new Date(),
    };
  }

  // ---------------------------------------------------------------------------
  // Private: Evaluation Logic
  // ---------------------------------------------------------------------------

  /**
   * Evaluate a single long-term memory against all pruning rules.
   *
   * Returns the first matching PrunedItem if any rule fires, or null if the
   * memory should be retained.  Priority order:
   * 1. Denied status (fast check, no date arithmetic)
   * 2. Stale (lastSeen older than staleDays)
   * 3. Low-significance (count below minRetainCount)
   *
   * @param memory - The long-term memory to evaluate
   * @param now    - Reference timestamp for staleness computation
   * @returns A PrunedItem if the memory should be pruned, otherwise null
   */
  private evaluateMemoryForPruning(memory: LongTermMemory, now: Date): PrunedItem | null {
    // Rule 1: Denied status
    if (this.config.pruneDenied && memory.status === 'denied') {
      return {
        id: memory.id,
        reason: 'denied',
        daysSinceLastSeen: daysSince(memory.observation.lastSeen, now),
        count: memory.observation.count,
        text: memory.observation.text,
      };
    }

    const days = daysSince(memory.observation.lastSeen, now);

    // Rule 2: Stale
    if (days > this.config.staleDays) {
      return {
        id: memory.id,
        reason: 'stale',
        daysSinceLastSeen: days,
        count: memory.observation.count,
        text: memory.observation.text,
      };
    }

    // Rule 3: Low-significance
    if (memory.observation.count < this.config.minRetainCount) {
      return {
        id: memory.id,
        reason: 'low-significance',
        daysSinceLastSeen: days,
        count: memory.observation.count,
        text: memory.observation.text,
      };
    }

    return null;
  }

  /**
   * Evaluate a single observation against the observation-level pruning rules.
   *
   * Returns the first matching PrunedItem if any rule fires, or null if the
   * observation should be retained.  Only `denied` and stale `pending`
   * observations are targeted — approved or already-promoted observations are
   * left intact.
   *
   * @param observation - The observation to evaluate
   * @param now         - Reference timestamp for staleness computation
   * @returns A PrunedItem if the observation should be pruned, otherwise null
   */
  private evaluateObservationForPruning(observation: Observation, now: Date): PrunedItem | null {
    // Rule 1: Denied observations
    if (this.config.pruneDenied && observation.status === 'denied') {
      return {
        id: observation.id,
        reason: 'denied',
        daysSinceLastSeen: daysSince(observation.lastSeen, now),
        count: observation.count,
        text: observation.text,
      };
    }

    // Rule 2: Stale pending observations
    if (observation.status === 'pending') {
      const days = daysSince(observation.lastSeen, now);
      if (days > this.config.staleDays) {
        return {
          id: observation.id,
          reason: 'stale',
          daysSinceLastSeen: days,
          count: observation.count,
          text: observation.text,
        };
      }
    }

    return null;
  }
}
