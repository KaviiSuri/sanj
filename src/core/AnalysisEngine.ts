/**
 * Analysis Engine
 *
 * Orchestrates the complete session analysis workflow.
 * Coordinates reading sessions from multiple adapters, extracting patterns using LLM,
 * deduplicating observations, and managing run state.
 *
 * This is the core logic that powers the `sanj analyze` command.
 *
 * @module core/AnalysisEngine
 */

import type { Config, Session, Observation } from "./types.ts";
import type { SessionAdapter, Session as AdapterSession } from "../adapters/session/SessionAdapter.ts";
import type { LLMAdapter } from "../adapters/llm/LLMAdapter.ts";
import type { IObservationStore } from "../storage/interfaces.ts";
import type { PatternAnalyzer } from "../analyzers/base";
import { ToolUsageAnalyzer } from "../analyzers/tool-usage";
import { ErrorPatternDetector } from "../analyzers/error-pattern";
import { FileInteractionTracker } from "../analyzers/file-tracker";
import { WorkflowSequenceDetector } from "../analyzers/workflow-detector";
import { parseConversation } from "../parsers/conversation";

/**
 * Analysis result with comprehensive statistics.
 */
export interface AnalysisResult {
  /** Overall status of the analysis run */
  status: "success" | "partial_failure" | "failure";

  /** Number of sessions successfully processed */
  sessionsProcessed: number;

  /** Number of sessions that failed during processing */
  sessionsFailed: number;

  /** Number of new observations created */
  observationsCreated: number;

  /** Number of existing observations updated (count bumped) */
  observationsBumped: number;

  /** When analysis started */
  startTime: Date;

  /** When analysis completed */
  endTime: Date;

  /** Total duration in milliseconds */
  durationMs: number;

  /** Errors that occurred during analysis */
  errors: AnalysisError[];
}

/**
 * Error that occurred during session processing.
 */
export interface AnalysisError {
  /** Session ID that failed */
  sessionId: string;

  /** Adapter name that was processing this session */
  adapter: string;

  /** Reason for failure */
  reason: string;
}

/**
 * Options for running analysis.
 */
export interface AnalysisOptions {
  /** Optional: Process all sessions regardless of last analysis run */
  forceFullAnalysis?: boolean;

  /** Optional: Override last analysis timestamp */
  since?: Date;
}

/**
 * Analysis Engine orchestrator.
 *
 * Coordinates:
 * - Loading configuration
 * - Reading sessions from enabled adapters
 * - Extracting patterns using LLM
 * - Deduplicating and storing observations
 * - Updating analysis state
 *
 * Designed for non-interactive execution (suitable for cron).
 */
export class AnalysisEngine {
  private config: Config;
  private sessionAdapters: SessionAdapter[];
  private llmAdapter: LLMAdapter;
  private observationStore: IObservationStore;
  private state: {
    getLastAnalysisRun(): Date | null;
    updateLastAnalysisRun(timestamp: Date): Promise<void>;
  };
  private patternAnalyzers: PatternAnalyzer[];

  /**
   * Create a new AnalysisEngine instance.
   *
   * All dependencies are injected for testability.
   *
   * @param config - Application configuration
   * @param sessionAdapters - All available session adapters
   * @param llmAdapter - LLM adapter for pattern extraction
   * @param observationStore - Observation store for persisting results
   * @param state - State manager for tracking last analysis run
   * @param patternAnalyzers - Optional array of programmatic pattern analyzers
   */
  constructor(
    config: Config,
    sessionAdapters: SessionAdapter[],
    llmAdapter: LLMAdapter,
    observationStore: IObservationStore,
    state: {
      getLastAnalysisRun(): Date | null;
      updateLastAnalysisRun(timestamp: Date): Promise<void>;
    },
    patternAnalyzers: PatternAnalyzer[] = []
  ) {
    this.config = config;
    this.sessionAdapters = sessionAdapters;
    this.llmAdapter = llmAdapter;
    this.observationStore = observationStore;
    this.state = state;
    this.patternAnalyzers = patternAnalyzers.length > 0 ? patternAnalyzers : [new ToolUsageAnalyzer(), new ErrorPatternDetector(), new FileInteractionTracker(), new WorkflowSequenceDetector()];
  }

  /**
   * Run the complete analysis workflow.
   *
   * Algorithm:
   * 1. Get last analysis timestamp from state
   * 2. Load enabled session adapters
   * 3. For each adapter, check availability and get sessions
   * 4. Filter sessions by timestamp (since last analysis run)
   * 5. For each session, extract patterns using LLM
   * 6. Deduplicate and store observations
   * 7. Update last analysis timestamp
   * 8. Return comprehensive result
   *
   * @param options - Optional analysis options
   * @returns Analysis result with statistics and errors
   */
  async run(options: AnalysisOptions = {}): Promise<AnalysisResult> {
    const startTime = new Date();
    const errors: AnalysisError[] = [];

    // Initialize counters
    let sessionsProcessed = 0;
    let sessionsFailed = 0;
    let observationsCreated = 0;
    let observationsBumped = 0;

    console.log("[AnalysisEngine] Starting analysis...");

    // Determine timestamp filter
    const lastAnalysisRun = this.state.getLastAnalysisRun();
    const since = options.since || options.forceFullAnalysis
      ? undefined
      : lastAnalysisRun || undefined;

    if (since) {
      console.log(
        `[AnalysisEngine] Loading sessions since ${since.toISOString()}...`
      );
    } else {
      console.log("[AnalysisEngine] Loading all sessions...");
    }

    // Get enabled adapters
    const enabledAdapters = this.getEnabledAdapters();
    console.log(
      `[AnalysisEngine] Enabled adapters: ${enabledAdapters
        .map((a) => a.name)
        .join(", ")}`
    );

    // Collect all sessions from all adapters
    const allAdapterSessions: AdapterSession[] = [];

    for (const adapter of enabledAdapters) {
      try {
        // Check adapter availability
        const isAvailable = await adapter.isAvailable();
        if (!isAvailable) {
          console.log(
            `[AnalysisEngine] Adapter ${adapter.name} is not available, skipping...`
          );
          continue;
        }

        // Get sessions from adapter
        const sessions = await adapter.getSessions(since);
        console.log(
          `[AnalysisEngine] Found ${sessions.length} sessions from ${adapter.name}`
        );
        allAdapterSessions.push(...sessions);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.warn(
          `[AnalysisEngine] Error loading sessions from ${adapter.name}: ${errorMsg}`
        );
        errors.push({
          sessionId: "N/A",
          adapter: adapter.name,
          reason: errorMsg,
        });
        continue;
      }
    }

    console.log(
      `[AnalysisEngine] Processing ${allAdapterSessions.length} total sessions...`
    );

    // Process each session
    for (const adapterSession of allAdapterSessions) {
      try {
        console.log(
          `[AnalysisEngine] Processing session: ${adapterSession.id} (${adapterSession.toolName})`
        );

        // Convert AdapterSession to Session type expected by LLMAdapter
        const coreSession: Session = {
          id: adapterSession.id,
          tool: adapterSession.toolName as 'claude-code' | 'opencode',
          projectSlug: undefined,
          createdAt: adapterSession.timestamp,
          modifiedAt: adapterSession.timestamp,
          path: adapterSession.filePath,
          messageCount: 0,
        };

        // Parse conversation content for programmatic analyzers
        let allExtracted: Observation[] = [];
        const parsed = parseConversation(adapterSession.content);

        for (const analyzer of this.patternAnalyzers) {
          console.log(
            `[AnalysisEngine] Running ${analyzer.name} analyzer on ${adapterSession.id}`
          );
          const observations = await analyzer.analyze(coreSession, parsed.messages);
          console.log(
            `[AnalysisEngine] ${analyzer.name} extracted ${observations.length} observations`
          );
          allExtracted.push(...observations);
        }

        // Extract patterns using LLM
        const extracted = await this.llmAdapter.extractPatterns(coreSession);
        console.log(
          `[AnalysisEngine] Extracted ${extracted.length} patterns from ${adapterSession.id}`
        );

        // Merge LLM observations with programmatic analyzer observations
        allExtracted.push(...extracted);

        // Store/deduplicate observations
        for (const observation of allExtracted) {
          try {
            // Get existing observations to compare against
            const existing = await this.observationStore.getAll();

            // Check for similar existing observations
            let similarObservation: Observation | null = null;
            for (const obs of existing) {
              if (obs.status === "denied") {
                continue;
              }
              if (obs.category !== observation.category) {
                continue;
              }
              try {
                const isSimilar = await this.llmAdapter.checkSimilarity(
                  observation,
                  obs
                );
                if (isSimilar) {
                  similarObservation = obs;
                  break;
                }
              } catch {
                continue;
              }
            }

            if (similarObservation) {
              // Update existing observation
              similarObservation.count += 1;
              similarObservation.lastSeen = new Date();
              if (
                !similarObservation.sourceSessionIds.includes(adapterSession.id)
              ) {
                similarObservation.sourceSessionIds.push(adapterSession.id);
              }
              await this.observationStore.update(similarObservation.id, similarObservation);
              observationsBumped++;
            } else {
              // Create new observation
              const now = new Date();
              const newObservation: Observation = {
                ...observation,
                id: crypto.randomUUID(),
                count: 1,
                status: "pending",
                sourceSessionIds: [adapterSession.id],
                firstSeen: now,
                lastSeen: now,
              };
              await this.observationStore.create(newObservation);
              observationsCreated++;
            }
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.warn(
              `[AnalysisEngine] Error storing observation: ${errorMsg}`
            );
            errors.push({
              sessionId: adapterSession.id,
              adapter: adapterSession.toolName,
              reason: `Failed to store observation: ${errorMsg}`,
            });
          }
        }

        sessionsProcessed++;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.warn(
          `[AnalysisEngine] Error processing session ${adapterSession.id}: ${errorMsg}`
        );

        sessionsFailed++;
        errors.push({
          sessionId: adapterSession.id,
          adapter: adapterSession.toolName,
          reason: errorMsg,
        });

        // Continue with next session
        continue;
      }
    }

    // Update last analysis timestamp
    try {
      await this.state.updateLastAnalysisRun(new Date());
      console.log("[AnalysisEngine] Last analysis run timestamp updated");
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.warn(
        `[AnalysisEngine] Failed to update last analysis run: ${errorMsg}`
      );
      errors.push({
        sessionId: "N/A",
        adapter: "state",
        reason: `Failed to update timestamp: ${errorMsg}`,
      });
    }

    // Calculate results
    const endTime = new Date();
    const durationMs = endTime.getTime() - startTime.getTime();

    // Determine overall status
    let status: "success" | "partial_failure" | "failure";
    if (sessionsFailed === 0 && errors.length === 0) {
      status = "success";
    } else if (
      sessionsProcessed > 0 ||
      sessionsFailed < allAdapterSessions.length
    ) {
      status = "partial_failure";
    } else {
      status = "failure";
    }

    const result: AnalysisResult = {
      status,
      sessionsProcessed,
      sessionsFailed,
      observationsCreated,
      observationsBumped,
      startTime,
      endTime,
      durationMs,
      errors,
    };

    console.log(
      `[AnalysisEngine] Analysis complete: ${observationsCreated} created, ${observationsBumped} bumped, ${sessionsFailed} failed (${(durationMs / 1000).toFixed(2)}s)`
    );

    return result;
  }

  /**
   * Get list of enabled session adapters based on config.
   *
   * @returns Array of adapters that are enabled in config
   */
  private getEnabledAdapters(): SessionAdapter[] {
    const enabled: SessionAdapter[] = [];

    for (const adapter of this.sessionAdapters) {
      // Check if adapter is enabled based on its name
      const isEnabled = this.isAdapterEnabled(adapter.name);
      if (isEnabled) {
        enabled.push(adapter);
      }
    }

    return enabled;
  }

  /**
   * Check if an adapter is enabled in config.
   *
   * @param adapterName - Name of adapter to check
   * @returns true if adapter is enabled, false otherwise
   */
  private isAdapterEnabled(adapterName: string): boolean {
    const adapterConfig = (this.config as any).sessionAdapters;

    if (!adapterConfig) {
      // If no config, assume all adapters are enabled
      return true;
    }

    // Check if adapter is enabled in config
    const enabled = adapterConfig[adapterName]?.enabled;
    return enabled !== false; // enabled by default if not specified
  }
}
