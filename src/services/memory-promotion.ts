/**
 * Memory Promotion Service
 *
 * Orchestrates promotions across the memory hierarchy:
 *   Observation → LongTermMemory → CoreMemory
 *
 * Promotion rules:
 * - Observation → Long-Term: observation must be approved AND its count must
 *   meet or exceed Config.promotion.observationCountThreshold.  Additionally,
 *   observations seen across 5+ unique sessions are flagged as project-level
 *   patterns and are promoted regardless of the numeric count threshold.
 * - Long-Term → Core: the long-term memory must have been resident for at
 *   least Config.promotion.longTermDaysThreshold days AND the underlying
 *   observation count must still meet the count threshold.
 *
 * The service tracks every promotion event in an append-only log so callers
 * can audit what was promoted, when, and why.  A dry-run method
 * (getPromotionCandidates) lets consumers preview what would be promoted
 * without actually executing the promotions.
 *
 * @module services/memory-promotion
 */

import type { Observation, LongTermMemory, Config } from '../core/types.ts';
import type { IMemoryStore, IObservationStore, PromotionResult } from '../storage/interfaces.ts';

// =============================================================================
// Promotion Event Log
// =============================================================================

/**
 * Lifecycle stage that was transitioned through.
 */
export type PromotionLevel = 'observation-to-long-term' | 'long-term-to-core';

/**
 * A single recorded promotion event.
 */
export interface PromotionEvent {
  /** Monotonic sequence number within this service instance */
  eventId: number;

  /** Which promotion level was executed */
  level: PromotionLevel;

  /** Source entity ID (observation ID or long-term memory ID) */
  sourceId: string;

  /** Resulting promoted entity ID (long-term memory ID or core memory ID) */
  resultId?: string;

  /** Whether the promotion succeeded */
  success: boolean;

  /** Human-readable reason for failure (absent when successful) */
  reason?: string;

  /** Timestamp when this event was recorded */
  timestamp: Date;
}

// =============================================================================
// Candidate / Dry-Run Types
// =============================================================================

/**
 * A candidate observation that is eligible for promotion to long-term memory.
 */
export interface ObservationCandidate {
  /** The observation itself */
  observation: Observation;

  /** Why this observation qualifies */
  reason: string;

  /** Whether it qualifies via the session-spread rule (5+ sessions) */
  isProjectLevel: boolean;
}

/**
 * A candidate long-term memory that is eligible for promotion to core memory.
 */
export interface LongTermCandidate {
  /** The long-term memory itself */
  memory: LongTermMemory;

  /** Number of days resident in long-term memory */
  daysInLongTerm: number;

  /** Why this memory qualifies */
  reason: string;
}

/**
 * Combined dry-run preview of all promotable items at both levels.
 */
export interface PromotionCandidatesResult {
  /** Observations ready to be promoted to long-term memory */
  observationCandidates: ObservationCandidate[];

  /** Long-term memories ready to be promoted to core memory */
  longTermCandidates: LongTermCandidate[];

  /** Timestamp when this snapshot was taken */
  evaluatedAt: Date;
}

// =============================================================================
// Promotion Run Results
// =============================================================================

/**
 * Summary of a single `checkAndPromoteObservations()` run.
 */
export interface ObservationPromotionRunResult {
  /** Number of observations evaluated */
  evaluated: number;

  /** Number successfully promoted to long-term memory */
  promoted: number;

  /** Number that failed promotion (see events for details) */
  failed: number;

  /** Detailed event records */
  events: PromotionEvent[];

  /** Wall-clock duration in milliseconds */
  durationMs: number;
}

/**
 * Summary of a single `checkAndPromoteToCore()` run.
 */
export interface CorePromotionRunResult {
  /** Number of long-term memories evaluated */
  evaluated: number;

  /** Number successfully promoted to core memory */
  promoted: number;

  /** Number that failed promotion (see events for details) */
  failed: number;

  /** Detailed event records */
  events: PromotionEvent[];

  /** Wall-clock duration in milliseconds */
  durationMs: number;
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Minimum number of unique source sessions for an observation to be
 * considered a project-level pattern (eligible for promotion regardless of
 * the configured count threshold).
 */
const PROJECT_LEVEL_SESSION_THRESHOLD = 5;

// =============================================================================
// MemoryPromotionService
// =============================================================================

/**
 * Orchestrates memory promotions across the hierarchy.
 *
 * Dependencies are injected via the constructor for testability:
 * - `observationStore`: reads observations and updates their status
 * - `memoryStore`: performs the actual promotion writes and checks eligibility
 * - `config`: provides threshold values
 *
 * @example
 * ```typescript
 * const service = new MemoryPromotionService(observationStore, memoryStore, config);
 *
 * // Dry-run to preview candidates
 * const candidates = await service.getPromotionCandidates();
 *
 * // Execute observation → long-term promotions
 * const obsResult = await service.checkAndPromoteObservations();
 *
 * // Execute long-term → core promotions
 * const coreResult = await service.checkAndPromoteToCore();
 *
 * // Inspect accumulated event log
 * console.log(service.getPromotionLog());
 * ```
 */
export class MemoryPromotionService {
  private readonly observationStore: IObservationStore;
  private readonly memoryStore: IMemoryStore;
  private readonly config: Config;

  /** Append-only log of every promotion event executed by this instance */
  private promotionLog: PromotionEvent[] = [];

  /** Auto-incrementing event counter */
  private eventCounter = 0;

  /**
   * Create a MemoryPromotionService.
   *
   * @param observationStore - Store for reading/updating observations
   * @param memoryStore      - Store for performing memory promotions
   * @param config           - Application configuration with promotion thresholds
   */
  constructor(
    observationStore: IObservationStore,
    memoryStore: IMemoryStore,
    config: Config
  ) {
    this.observationStore = observationStore;
    this.memoryStore = memoryStore;
    this.config = config;
  }

  // ---------------------------------------------------------------------------
  // Public API: Dry-run / Preview
  // ---------------------------------------------------------------------------

  /**
   * Preview which observations and long-term memories would be promoted
   * without executing any actual promotions.
   *
   * This is useful for building review UIs or for logging what is pending.
   *
   * @returns Candidates at both levels with eligibility reasons
   */
  async getPromotionCandidates(): Promise<PromotionCandidatesResult> {
    const [promotableObservations, promotableMemories] = await Promise.all([
      this.observationStore.getPromotable(),
      this.memoryStore.getPromotableToCore(),
    ]);

    const observationCandidates: ObservationCandidate[] = promotableObservations
      .filter((obs) => this.isObservationEligible(obs))
      .map((obs) => {
        const isProjectLevel = obs.sourceSessionIds.length >= PROJECT_LEVEL_SESSION_THRESHOLD;
        const reason = isProjectLevel
          ? `Seen across ${obs.sourceSessionIds.length} sessions (project-level threshold: ${PROJECT_LEVEL_SESSION_THRESHOLD})`
          : `Count ${obs.count} meets threshold ${this.config.promotion.observationCountThreshold}`;

        return { observation: obs, reason, isProjectLevel };
      });

    const longTermCandidates: LongTermCandidate[] = promotableMemories
      .filter((mem) => this.memoryStore.isEligibleForCorePromotion(mem))
      .map((mem) => {
        const daysInLongTerm = this.memoryStore.daysSinceLongTermPromotion(mem);
        const reason =
          `Resident for ${daysInLongTerm} days (threshold: ${this.config.promotion.longTermDaysThreshold}) ` +
          `and count ${mem.observation.count} meets threshold ${this.config.promotion.observationCountThreshold}`;

        return { memory: mem, daysInLongTerm, reason };
      });

    return {
      observationCandidates,
      longTermCandidates,
      evaluatedAt: new Date(),
    };
  }

  // ---------------------------------------------------------------------------
  // Public API: Observation → Long-Term Promotion
  // ---------------------------------------------------------------------------

  /**
   * Scan for approved observations that meet promotion criteria and promote
   * them to long-term memory.
   *
   * An observation is eligible when ANY of the following hold:
   * 1. It is approved AND its `count` >= `config.promotion.observationCountThreshold`
   * 2. It is approved AND it spans >= 5 unique source sessions (project-level rule)
   *
   * For each eligible observation the service:
   * 1. Calls `memoryStore.promoteToLongTerm(observationId)`
   * 2. On success, updates the observation status to `'promoted-to-long-term'`
   * 3. Records a PromotionEvent regardless of outcome
   *
   * @returns Run summary with counts, events, and timing
   */
  async checkAndPromoteObservations(): Promise<ObservationPromotionRunResult> {
    const startTime = Date.now();
    const runEvents: PromotionEvent[] = [];

    // Fetch observations that the store considers promotable (approved + above count)
    const promotableObservations = await this.observationStore.getPromotable();

    // Additionally fetch ALL approved observations to check the project-level rule
    const approvedObservations = await this.observationStore.getByStatus('approved');

    // Merge: start with the promotable set, then add any approved observations
    // that qualify under the project-level rule but were not already included
    const promotableIds = new Set(promotableObservations.map((o) => o.id));
    const candidates: Observation[] = [...promotableObservations];

    for (const obs of approvedObservations) {
      if (!promotableIds.has(obs.id) && this.isProjectLevelObservation(obs)) {
        candidates.push(obs);
        promotableIds.add(obs.id);
      }
    }

    // Execute promotions
    let promoted = 0;
    let failed = 0;

    for (const observation of candidates) {
      const result: PromotionResult = await this.memoryStore.promoteToLongTerm(observation.id);

      if (result.success) {
        // Update observation status in the observation store
        await this.observationStore.setStatus(observation.id, 'promoted-to-long-term');

        const event = this.recordEvent({
          level: 'observation-to-long-term',
          sourceId: observation.id,
          resultId: result.id,
          success: true,
        });
        runEvents.push(event);
        promoted++;
      } else {
        const event = this.recordEvent({
          level: 'observation-to-long-term',
          sourceId: observation.id,
          success: false,
          reason: result.reason ?? 'Promotion failed with no reason provided',
        });
        runEvents.push(event);
        failed++;
      }
    }

    return {
      evaluated: candidates.length,
      promoted,
      failed,
      events: runEvents,
      durationMs: Date.now() - startTime,
    };
  }

  // ---------------------------------------------------------------------------
  // Public API: Long-Term → Core Promotion
  // ---------------------------------------------------------------------------

  /**
   * Scan for long-term memories that meet both the time and count thresholds
   * and promote them to core memory.
   *
   * A long-term memory is eligible when:
   * - Days since promotion >= `config.promotion.longTermDaysThreshold`
   * - Underlying observation count >= `config.promotion.observationCountThreshold`
   *
   * Target files are determined by `config.memoryTargets`:
   * - `claudeMd: true`  → writes to `'claude_md'`
   * - `agentsMd: true`  → writes to `'agents_md'`
   *
   * For each eligible memory the service:
   * 1. Calls `memoryStore.promoteToCore(memoryId, targets)`
   * 2. On success, sets the long-term memory status to `'scheduled-for-core'`
   * 3. Records a PromotionEvent regardless of outcome
   *
   * @returns Run summary with counts, events, and timing
   */
  async checkAndPromoteToCore(): Promise<CorePromotionRunResult> {
    const startTime = Date.now();
    const runEvents: PromotionEvent[] = [];

    const promotableMemories = await this.memoryStore.getPromotableToCore();

    // Determine target files from config
    const targets: Array<'claude_md' | 'agents_md'> = [];
    if (this.config.memoryTargets.claudeMd) targets.push('claude_md');
    if (this.config.memoryTargets.agentsMd) targets.push('agents_md');

    let promoted = 0;
    let failed = 0;

    for (const memory of promotableMemories) {
      // Double-check eligibility (the store's getPromotableToCore should already
      // filter, but we validate locally to be defensive)
      if (!this.memoryStore.isEligibleForCorePromotion(memory)) {
        continue;
      }

      // If no targets are configured, record a failure event and skip
      if (targets.length === 0) {
        const event = this.recordEvent({
          level: 'long-term-to-core',
          sourceId: memory.id,
          success: false,
          reason: 'No memory targets configured (both claudeMd and agentsMd are disabled)',
        });
        runEvents.push(event);
        failed++;
        continue;
      }

      const result: PromotionResult = await this.memoryStore.promoteToCore(memory.id, targets);

      if (result.success) {
        // Mark the long-term memory as scheduled for core
        await this.memoryStore.setStatus(memory.id, 'scheduled-for-core');

        // Also update the underlying observation status
        await this.observationStore.setStatus(memory.observation.id, 'promoted-to-core');

        const event = this.recordEvent({
          level: 'long-term-to-core',
          sourceId: memory.id,
          resultId: result.id,
          success: true,
        });
        runEvents.push(event);
        promoted++;
      } else {
        const event = this.recordEvent({
          level: 'long-term-to-core',
          sourceId: memory.id,
          success: false,
          reason: result.reason ?? 'Core promotion failed with no reason provided',
        });
        runEvents.push(event);
        failed++;
      }
    }

    return {
      evaluated: promotableMemories.length,
      promoted,
      failed,
      events: runEvents,
      durationMs: Date.now() - startTime,
    };
  }

  // ---------------------------------------------------------------------------
  // Public API: Log Access
  // ---------------------------------------------------------------------------

  /**
   * Return the full promotion event log accumulated by this service instance.
   * Events are ordered chronologically (earliest first).
   *
   * @returns Immutable copy of the promotion log
   */
  getPromotionLog(): Readonly<PromotionEvent[]> {
    return [...this.promotionLog];
  }

  /**
   * Return only events for a specific promotion level.
   *
   * @param level - The level to filter by
   * @returns Events matching the given level
   */
  getPromotionLogByLevel(level: PromotionLevel): PromotionEvent[] {
    return this.promotionLog.filter((e) => e.level === level);
  }

  /**
   * Clear the in-memory promotion log.
   * Does not affect any persisted state.
   */
  clearPromotionLog(): void {
    this.promotionLog = [];
    this.eventCounter = 0;
  }

  // ---------------------------------------------------------------------------
  // Private: Eligibility Checks
  // ---------------------------------------------------------------------------

  /**
   * Determine whether an observation meets promotion criteria.
   *
   * An observation is eligible if:
   * - It is in `'approved'` status, AND
   * - Either its count meets the configured threshold OR it spans enough
   *   sessions to qualify as a project-level pattern.
   *
   * @param observation - The observation to evaluate
   * @returns true if the observation should be promoted
   */
  private isObservationEligible(observation: Observation): boolean {
    if (observation.status !== 'approved') return false;

    const meetsCountThreshold =
      observation.count >= this.config.promotion.observationCountThreshold;
    const isProjectLevel = this.isProjectLevelObservation(observation);

    return meetsCountThreshold || isProjectLevel;
  }

  /**
   * Check whether an observation qualifies as a project-level pattern.
   *
   * A project-level observation is one that has been seen across at least
   * PROJECT_LEVEL_SESSION_THRESHOLD (5) unique sessions.
   *
   * @param observation - The observation to check
   * @returns true if the observation spans enough sessions
   */
  private isProjectLevelObservation(observation: Observation): boolean {
    return observation.sourceSessionIds.length >= PROJECT_LEVEL_SESSION_THRESHOLD;
  }

  // ---------------------------------------------------------------------------
  // Private: Event Recording
  // ---------------------------------------------------------------------------

  /**
   * Create and append a PromotionEvent to the internal log.
   *
   * @param params - Event fields (excluding eventId and timestamp)
   * @returns The fully formed event that was appended
   */
  private recordEvent(params: Omit<PromotionEvent, 'eventId' | 'timestamp'>): PromotionEvent {
    this.eventCounter++;

    const event: PromotionEvent = {
      eventId: this.eventCounter,
      timestamp: new Date(),
      ...params,
    };

    this.promotionLog.push(event);
    return event;
  }
}
