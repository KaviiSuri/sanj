/**
 * Background Analysis Service
 *
 * Non-interactive analysis runner designed for scheduled execution (cron jobs).
 * Runs the full analysis pipeline with comprehensive logging and graceful error handling.
 *
 * Features:
 * - Runs completely unattended without user interaction
 * - Logs all output to ~/.sanj/logs/analysis.log
 * - Handles errors gracefully without crashing
 * - Reports detailed statistics for monitoring
 * - Supports both full and incremental analysis
 *
 * Design Principles:
 * - Zero user interaction required
 * - Fail gracefully: errors are logged but don't crash the process
 * - Comprehensive logging for debugging and monitoring
 * - Atomic state updates to prevent corruption
 * - Idempotent: safe to run multiple times
 *
 * @module services/background-analysis
 */

import { existsSync, mkdirSync, appendFileSync } from 'fs';
import { join } from 'path';
import { AnalysisEngine, type AnalysisResult } from '../core/AnalysisEngine';
import type { Config } from '../core/types';
import { readConfig } from '../storage/config';
import { getState, updateLastAnalysisRun, updateObservationCount } from '../storage/state';
import { SANJ_HOME } from '../storage/paths';
import { ClaudeCodeSessionAdapter } from '../adapters/session/ClaudeCodeSession';
import { OpenCodeSessionAdapter } from '../adapters/session/OpenCodeSession';
import { OpenCodeLLMAdapter } from '../adapters/llm/OpenCodeLLM';
import { ObservationStore } from '../storage/observation-store';
import {
  notifyAnalysisComplete,
  notifyAnalysisError,
  getDefaultNotificationConfig,
} from '../utils/notifications';

// =============================================================================
// Types
// =============================================================================

/**
 * Options for background analysis run.
 */
export interface BackgroundAnalysisOptions {
  /** Force full analysis, ignoring last run timestamp */
  forceFullAnalysis?: boolean;

  /** Override timestamp for incremental analysis */
  since?: Date;

  /** Skip writing state updates (useful for testing) */
  noWriteState?: boolean;
}

/**
 * Result of a background analysis run.
 */
export interface BackgroundAnalysisResult {
  /** Whether the analysis completed successfully */
  success: boolean;

  /** Detailed analysis result from AnalysisEngine */
  analysisResult?: AnalysisResult;

  /** Error message if analysis failed */
  error?: string;

  /** Start time of analysis */
  startTime: Date;

  /** End time of analysis */
  endTime: Date;

  /** Duration in milliseconds */
  durationMs: number;
}

// =============================================================================
// Background Analysis Service
// =============================================================================

/**
 * Background analysis service for unattended execution.
 *
 * This service orchestrates the complete analysis pipeline in a non-interactive
 * manner, suitable for cron jobs and automated scheduling.
 */
export class BackgroundAnalysisService {
  private logPath: string;

  /**
   * Create a new background analysis service.
   *
   * @param options - Optional configuration
   */
  constructor(options: { logPath?: string } = {}) {
    this.logPath = options.logPath || join(SANJ_HOME, 'logs', 'analysis.log');
  }

  /**
   * Run background analysis.
   *
   * This method orchestrates the complete analysis pipeline:
   * 1. Load configuration
   * 2. Initialize adapters
   * 3. Run analysis engine
   * 4. Update state
   * 5. Log results
   *
   * All errors are caught and logged - the process never crashes.
   *
   * @param options - Analysis options
   * @returns Analysis result with success status
   */
  async run(options: BackgroundAnalysisOptions = {}): Promise<BackgroundAnalysisResult> {
    const startTime = new Date();
    this.log('INFO', '=== Background Analysis Started ===');
    this.log('INFO', `Start time: ${startTime.toISOString()}`);

    try {
      // Load configuration
      this.log('INFO', 'Loading configuration...');
      let config: Config;
      try {
        config = await readConfig();
        this.log('INFO', 'Configuration loaded successfully');
      } catch (error) {
        const errorMsg = this.formatError(error);
        this.log('ERROR', `Failed to load configuration: ${errorMsg}`);
        return this.createErrorResult(
          startTime,
          `Configuration error: ${errorMsg}. Run 'sanj init' to initialize.`
        );
      }

      // Verify initialization
      if (!existsSync(join(SANJ_HOME, 'config.json'))) {
        this.log('ERROR', 'Configuration file not found');
        return this.createErrorResult(
          startTime,
          'Sanj not initialized. Run \'sanj init\' first.'
        );
      }

      // Load state to get last analysis run
      this.log('INFO', 'Loading analysis state...');
      const state = await getState();
      const lastRun = state.lastAnalysisRun;

      // Determine effective "since" date
      let effectiveSince: Date | undefined;
      if (options.since) {
        effectiveSince = options.since;
        this.log('INFO', `Using override timestamp: ${effectiveSince.toISOString()}`);
      } else if (lastRun && !options.forceFullAnalysis) {
        effectiveSince = lastRun;
        this.log('INFO', `Incremental analysis since: ${effectiveSince.toISOString()}`);
      } else {
        this.log('INFO', 'Running full analysis (all sessions)');
      }

      // Create session adapters
      this.log('INFO', 'Initializing session adapters...');
      const sessionAdapters = [
        new ClaudeCodeSessionAdapter(),
        new OpenCodeSessionAdapter(),
      ];

      // Filter adapters based on config
      const enabledAdapters = sessionAdapters.filter((adapter) => {
        const adapterKey = adapter.name === 'claude-code' ? 'claudeCode' : 'opencode';
        const isEnabled = (config as any).sessionAdapters?.[adapterKey]?.enabled !== false;
        if (isEnabled) {
          this.log('INFO', `Session adapter enabled: ${adapter.name}`);
        } else {
          this.log('INFO', `Session adapter disabled: ${adapter.name}`);
        }
        return isEnabled;
      });

      if (enabledAdapters.length === 0) {
        this.log('ERROR', 'No session adapters enabled in configuration');
        return this.createErrorResult(
          startTime,
          'No session adapters enabled. Enable at least one adapter in config.'
        );
      }

      this.log('INFO', `Active adapters: ${enabledAdapters.map((a) => a.name).join(', ')}`);

      // Create LLM adapter
      this.log('INFO', 'Initializing LLM adapter...');
      const llmAdapter = new OpenCodeLLMAdapter(config.llmAdapter.model);

      // Check if LLM adapter is available
      const llmAvailable = await llmAdapter.isAvailable();
      if (!llmAvailable) {
        this.log('ERROR', `LLM adapter not available: ${llmAdapter.name}`);
        return this.createErrorResult(
          startTime,
          `LLM adapter '${llmAdapter.name}' not available. Check installation.`
        );
      }

      this.log('INFO', `LLM adapter ready: ${llmAdapter.name} (model: ${config.llmAdapter.model})`);

      // Create observation store
      this.log('INFO', 'Initializing observation store...');
      const observationStore = new ObservationStore();
      const observationCountBefore = (await observationStore.getAll()).length;
      this.log('INFO', `Current observations in store: ${observationCountBefore}`);

      // Create analysis engine
      this.log('INFO', 'Creating analysis engine...');
      const engine = new AnalysisEngine(
        config,
        enabledAdapters,
        llmAdapter,
        observationStore,
        {
          getLastAnalysisRun: () => lastRun || null,
          updateLastAnalysisRun: async (_timestamp: Date) => {
            if (!options.noWriteState) {
              await updateLastAnalysisRun();
              this.log('INFO', 'Analysis state updated');
            }
          },
        }
      );

      // Run analysis
      this.log('INFO', 'Starting analysis pipeline...');
      const analysisResult: AnalysisResult = await engine.run({
        since: effectiveSince,
        forceFullAnalysis: options.forceFullAnalysis,
      });

      // Log detailed results
      this.log('INFO', '=== Analysis Complete ===');
      this.log('INFO', `Status: ${analysisResult.status}`);
      this.log('INFO', `Sessions processed: ${analysisResult.sessionsProcessed}`);
      this.log('INFO', `Sessions failed: ${analysisResult.sessionsFailed}`);
      this.log('INFO', `Observations created: ${analysisResult.observationsCreated}`);
      this.log('INFO', `Observations bumped: ${analysisResult.observationsBumped}`);
      this.log('INFO', `Duration: ${(analysisResult.durationMs / 1000).toFixed(2)}s`);

      if (analysisResult.errors.length > 0) {
        this.log('WARN', `${analysisResult.errors.length} errors encountered during analysis`);
        analysisResult.errors.forEach((error, index) => {
          this.log('WARN', `  Error ${index + 1}: [${error.adapter}] ${error.reason}`);
        });
      }

      // Update observation count in state
      try {
        const observationCountAfter = (await observationStore.getAll()).length;
        await updateObservationCount(observationCountAfter);
        this.log('INFO', `Observation count updated: ${observationCountBefore} → ${observationCountAfter}`);
      } catch (error) {
        const errorMsg = this.formatError(error);
        this.log('WARN', `Failed to update observation count: ${errorMsg}`);
      }

      const endTime = new Date();
      const durationMs = endTime.getTime() - startTime.getTime();

      this.log('INFO', `End time: ${endTime.toISOString()}`);
      this.log('INFO', `Total duration: ${(durationMs / 1000).toFixed(2)}s`);
      this.log('INFO', '=== Background Analysis Finished ===');

      // Send notification if configured
      try {
        const notificationConfig = config.notifications || getDefaultNotificationConfig();
        const notificationSent = notifyAnalysisComplete(
          {
            observationsCreated: analysisResult.observationsCreated,
            observationsBumped: analysisResult.observationsBumped,
            sessionsProcessed: analysisResult.sessionsProcessed,
          },
          notificationConfig
        );
        if (notificationSent) {
          this.log('INFO', 'Desktop notification sent');
        }
      } catch (error) {
        // Notification failure should not affect analysis result
        this.log('WARN', `Failed to send notification: ${this.formatError(error)}`);
      }

      return {
        success: analysisResult.status !== 'failure',
        analysisResult,
        startTime,
        endTime,
        durationMs,
      };
    } catch (error) {
      // Catch-all for unexpected errors
      const errorMsg = this.formatError(error);
      this.log('ERROR', `Unexpected error during analysis: ${errorMsg}`);

      if (error instanceof Error && error.stack) {
        this.log('ERROR', `Stack trace: ${error.stack}`);
      }

      // Send error notification if configured
      try {
        const config = await readConfig();
        const notificationConfig = config.notifications || getDefaultNotificationConfig();
        notifyAnalysisError(errorMsg, notificationConfig);
      } catch {
        // Silently ignore notification errors in error handler
      }

      return this.createErrorResult(startTime, errorMsg);
    }
  }

  /**
   * Write log entry to analysis log file.
   *
   * Ensures log directory exists and appends formatted log entry.
   *
   * @param level - Log level
   * @param message - Log message
   */
  private log(level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR', message: string): void {
    this.ensureLogDirectory();
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [${level}] ${message}\n`;
    try {
      appendFileSync(this.logPath, logEntry);
    } catch (error) {
      // If we can't write to log, at least try console
      console.error(`Failed to write to log: ${this.formatError(error)}`);
      console.error(`Log entry was: ${logEntry}`);
    }
  }

  /**
   * Ensure log directory exists, creating it if necessary.
   */
  private ensureLogDirectory(): void {
    const logDir = join(SANJ_HOME, 'logs');
    if (!existsSync(logDir)) {
      try {
        mkdirSync(logDir, { recursive: true });
      } catch (error) {
        console.error(`Failed to create log directory: ${this.formatError(error)}`);
      }
    }
  }

  /**
   * Create error result for failed analysis.
   *
   * @param startTime - When analysis started
   * @param errorMessage - Error description
   * @returns Error result
   */
  private createErrorResult(startTime: Date, errorMessage: string): BackgroundAnalysisResult {
    const endTime = new Date();
    return {
      success: false,
      error: errorMessage,
      startTime,
      endTime,
      durationMs: endTime.getTime() - startTime.getTime(),
    };
  }

  /**
   * Format error for logging.
   *
   * @param error - Error object
   * @returns Formatted error message
   */
  private formatError(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }
}

/**
 * Convenience function to run background analysis with default settings.
 *
 * @param options - Analysis options
 * @returns Analysis result
 */
export async function runBackgroundAnalysis(
  options?: BackgroundAnalysisOptions
): Promise<BackgroundAnalysisResult> {
  const service = new BackgroundAnalysisService();
  return service.run(options);
}
