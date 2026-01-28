/**
 * Session Analysis Service
 *
 * Orchestrates the end-to-end analysis of individual sessions and batches.
 * Pipeline: load session → parse conversation → run analyzers → aggregate → store patterns.
 *
 * Responsibilities:
 * - Single-session analysis with full pipeline execution
 * - Batch analysis with concurrency control and progress tracking
 * - Per-session status tracking (pending, in-progress, completed, failed)
 * - Error isolation: a single session failure does not abort the batch
 *
 * @module services/session-analysis
 */

import type { Session, Observation } from '../core/types.ts';
import type { PatternAnalyzer } from '../analyzers/base.ts';
import { ToolUsageAnalyzer } from '../analyzers/tool-usage.ts';
import { ErrorPatternDetector } from '../analyzers/error-pattern.ts';
import { FileInteractionTracker } from '../analyzers/file-tracker.ts';
import { WorkflowSequenceDetector } from '../analyzers/workflow-detector.ts';
import { PatternAggregationService } from './pattern-aggregation.ts';
import type { AggregationResult } from './pattern-aggregation.ts';
import { FilePatternStore } from '../storage/pattern-store.ts';
import { parseConversation } from '../parsers/conversation.ts';

// =============================================================================
// Status & Result Types
// =============================================================================

/**
 * Lifecycle state for a single session's analysis.
 */
export type SessionAnalysisStatus = 'pending' | 'in-progress' | 'completed' | 'failed';

/**
 * Outcome of analyzing a single session.
 */
export interface SingleSessionResult {
  /** Session that was analyzed */
  sessionId: string;

  /** Terminal status of this session's analysis */
  status: SessionAnalysisStatus;

  /** Number of observations extracted (after aggregation) */
  observationsExtracted: number;

  /** Number of duplicate patterns merged during aggregation */
  duplicatesMerged: number;

  /** Breakdown of observations produced by each analyzer */
  analyzerBreakdown: Record<string, number>;

  /** How long this session's analysis took in milliseconds */
  durationMs: number;

  /** Error message if status is 'failed' */
  error?: string;
}

/**
 * Summary of a batch analysis run.
 */
export interface BatchAnalysisResult {
  /** Total sessions submitted for analysis */
  totalSessions: number;

  /** Sessions that completed successfully */
  completedCount: number;

  /** Sessions that failed */
  failedCount: number;

  /** Per-session results */
  results: SingleSessionResult[];

  /** Overall batch duration in milliseconds */
  durationMs: number;

  /** Total observations stored across all sessions */
  totalObservationsStored: number;
}

/**
 * Configuration for the session analysis service.
 */
export interface SessionAnalysisConfig {
  /** Pattern analyzers to run. Defaults to all four built-in analyzers. */
  analyzers?: PatternAnalyzer[];

  /** Configuration for the aggregation service. */
  aggregationConfig?: {
    similarityThreshold?: number;
    maxResults?: number;
  };

  /** Maximum concurrent sessions to analyze in a batch. Default: 5. */
  batchConcurrency?: number;
}

// =============================================================================
// SessionAnalysisService
// =============================================================================

/**
 * Orchestrates session analysis from parsing through pattern storage.
 *
 * Usage:
 * ```typescript
 * const service = new SessionAnalysisService(patternStore);
 * const result = await service.analyzeSession(session, rawContent);
 *
 * // Or batch:
 * const batch = await service.analyzeBatch(sessionsWithContent);
 * ```
 */
export class SessionAnalysisService {
  private readonly analyzers: PatternAnalyzer[];
  private readonly aggregationService: PatternAggregationService;
  private readonly patternStore: FilePatternStore;
  private readonly batchConcurrency: number;

  /**
   * Create a SessionAnalysisService.
   *
   * @param patternStore - Pattern store for persisting extracted observations
   * @param config - Optional configuration overrides
   */
  constructor(patternStore: FilePatternStore, config: SessionAnalysisConfig = {}) {
    this.analyzers = config.analyzers ?? [
      new ToolUsageAnalyzer(),
      new ErrorPatternDetector(),
      new FileInteractionTracker(),
      new WorkflowSequenceDetector(),
    ];

    this.aggregationService = new PatternAggregationService({
      similarityThreshold: config.aggregationConfig?.similarityThreshold ?? 0.7,
      maxResults: config.aggregationConfig?.maxResults ?? 0,
    });

    this.patternStore = patternStore;
    this.batchConcurrency = config.batchConcurrency ?? 5;
  }

  /**
   * Analyze a single session end-to-end.
   *
   * Pipeline:
   * 1. Parse raw conversation content into structured messages
   * 2. Run each analyzer against the parsed messages
   * 3. Aggregate & deduplicate observations across analyzers
   * 4. Persist aggregated patterns to the pattern store
   *
   * @param session - Session metadata
   * @param rawContent - Raw conversation file content (JSONL text)
   * @returns Result with extraction stats and per-analyzer breakdown
   */
  async analyzeSession(session: Session, rawContent: string): Promise<SingleSessionResult> {
    const startTime = Date.now();

    try {
      // Parse conversation content
      const parsed = parseConversation(rawContent);

      // Run each analyzer and collect outputs
      const analyzerOutputs: Array<{ analyzer: string; observations: Observation[] }> = [];

      for (const analyzer of this.analyzers) {
        const observations = await analyzer.analyze(session, parsed.messages);
        analyzerOutputs.push({ analyzer: analyzer.name, observations });
      }

      // Aggregate: deduplicate and rank
      const aggregation: AggregationResult = await this.aggregationService.aggregate(analyzerOutputs);

      // Persist to pattern store
      if (aggregation.observations.length > 0) {
        await this.patternStore.savePatterns(aggregation.observations);
      }

      return {
        sessionId: session.id,
        status: 'completed',
        observationsExtracted: aggregation.observations.length,
        duplicatesMerged: aggregation.duplicatesMerged,
        analyzerBreakdown: aggregation.analyzerBreakdown,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        sessionId: session.id,
        status: 'failed',
        observationsExtracted: 0,
        duplicatesMerged: 0,
        analyzerBreakdown: {},
        durationMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Analyze multiple sessions as a batch with concurrency control.
   *
   * Sessions are analyzed in chunks of `batchConcurrency` size.
   * Analysis (parsing + running analyzers) runs concurrently within a chunk,
   * but pattern storage is serialized to avoid write conflicts on the shared store.
   * A failure in one session does not prevent others from completing.
   *
   * @param sessions - Array of { session metadata, raw content } pairs
   * @returns Batch result with per-session outcomes and aggregate stats
   */
  async analyzeBatch(
    sessions: Array<{ session: Session; rawContent: string }>
  ): Promise<BatchAnalysisResult> {
    const batchStart = Date.now();
    const results: SingleSessionResult[] = [];

    // Process in chunks to limit concurrency
    for (let i = 0; i < sessions.length; i += this.batchConcurrency) {
      const chunk = sessions.slice(i, i + this.batchConcurrency);

      // Run analysis (parsing + analyzers + aggregation) concurrently
      const chunkResults = await Promise.all(
        chunk.map(({ session, rawContent }) => this.analyzeSessionWithoutPersist(session, rawContent))
      );

      // Persist results sequentially to avoid write conflicts
      for (const pendingResult of chunkResults) {
        if (pendingResult.observations.length > 0) {
          try {
            await this.patternStore.savePatterns(pendingResult.observations);
          } catch (error) {
            pendingResult.result.status = 'failed';
            pendingResult.result.error = error instanceof Error ? error.message : String(error);
            pendingResult.result.observationsExtracted = 0;
            pendingResult.observations = [];
          }
        }
        results.push(pendingResult.result);
      }
    }

    const completedCount = results.filter((r) => r.status === 'completed').length;
    const failedCount = results.filter((r) => r.status === 'failed').length;
    const totalObservationsStored = results.reduce(
      (sum, r) => sum + r.observationsExtracted,
      0
    );

    return {
      totalSessions: sessions.length,
      completedCount,
      failedCount,
      results,
      durationMs: Date.now() - batchStart,
      totalObservationsStored,
    };
  }

  /**
   * Analyze a session without persisting to the pattern store.
   * Used internally by analyzeBatch to separate analysis from persistence.
   */
  private async analyzeSessionWithoutPersist(
    session: Session,
    rawContent: string
  ): Promise<{ result: SingleSessionResult; observations: Observation[] }> {
    const startTime = Date.now();

    try {
      const parsed = parseConversation(rawContent);

      const analyzerOutputs: Array<{ analyzer: string; observations: Observation[] }> = [];
      for (const analyzer of this.analyzers) {
        const observations = await analyzer.analyze(session, parsed.messages);
        analyzerOutputs.push({ analyzer: analyzer.name, observations });
      }

      const aggregation: AggregationResult = await this.aggregationService.aggregate(analyzerOutputs);

      return {
        result: {
          sessionId: session.id,
          status: 'completed',
          observationsExtracted: aggregation.observations.length,
          duplicatesMerged: aggregation.duplicatesMerged,
          analyzerBreakdown: aggregation.analyzerBreakdown,
          durationMs: Date.now() - startTime,
        },
        observations: aggregation.observations,
      };
    } catch (error) {
      return {
        result: {
          sessionId: session.id,
          status: 'failed',
          observationsExtracted: 0,
          duplicatesMerged: 0,
          analyzerBreakdown: {},
          durationMs: Date.now() - startTime,
          error: error instanceof Error ? error.message : String(error),
        },
        observations: [],
      };
    }
  }

  /**
   * Get the list of analyzer names registered with this service.
   */
  getAnalyzerNames(): string[] {
    return this.analyzers.map((a) => a.name);
  }
}
