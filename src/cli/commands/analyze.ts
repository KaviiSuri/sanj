/**
 * Analyze Command Handler
 *
 * Entry point for `sanj analyze` command.
 * Wires together AnalysisEngine with CLI to enable pattern extraction
 * from coding sessions.
 *
 * Supports:
 * - Manual execution by user
 * - Automated execution via cron jobs
 * - Configurable verbosity and date filtering
 * - State tracking for incremental analysis
 *
 * @module cli/commands/analyze
 */

import { existsSync, mkdirSync, appendFileSync } from 'fs';
import { join } from 'path';
import { AnalysisEngine, type AnalysisResult } from '../../core/AnalysisEngine';
import type { Config } from '../../core/types';
import { readConfig } from '../../storage/config';
import { getState, updateLastAnalysisRun, updateObservationCount } from '../../storage/state';
import { SANJ_HOME } from '../../storage/paths';
import { ClaudeCodeSessionAdapter } from '../../adapters/session/ClaudeCodeSession';
import { OpenCodeSessionAdapter } from '../../adapters/session/OpenCodeSession';
import { OpenCodeLLMAdapter } from '../../adapters/llm/OpenCodeLLM';
import { ObservationStore } from '../../storage/observation-store';

/**
 * Flags for the analyze command.
 */
interface AnalyzeFlags {
  verbose?: boolean;
  'no-write-state'?: boolean;
  since?: string;
  limit?: number;
}

/**
 * Log file path for analysis output.
 */
const ANALYZE_LOG_PATH = join(SANJ_HOME, 'logs', 'analyze.log');

/**
 * Ensure log directory exists.
 */
function ensureLogDirectory(): void {
  const logDir = join(SANJ_HOME, 'logs');
  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true });
  }
}

/**
 * Write log entry to analysis log file.
 *
 * @param level - Log level (DEBUG, INFO, WARN, ERROR)
 * @param message - Log message
 */
function log(level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR', message: string): void {
  ensureLogDirectory();
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] [${level}] ${message}\n`;
  appendFileSync(ANALYZE_LOG_PATH, logEntry);
}

/**
 * Write log entry and optionally print to console based on verbosity.
 *
 * @param verbose - Whether to print to console
 * @param level - Log level
 * @param message - Message to log
 */
function logAndPrint(verbose: boolean, level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR', message: string): void {
  log(level, message);
  if (verbose || level === 'ERROR') {
    const levelIcon = {
      'DEBUG': '🔍',
      'INFO': 'ℹ',
      'WARN': '⚠',
      'ERROR': '✗',
    };
    console.log(`${levelIcon[level]} ${message}`);
  }
}

/**
 * Handle analyze command.
 *
 * @param ctx - Command context with flags
 */
export async function handleAnalyze(ctx: any): Promise<void> {
  const flags: AnalyzeFlags = ctx || {};
  const verbose = flags.verbose || false;
  const noWriteState = flags['no-write-state'] === true;
  const sinceDate = flags.since ? new Date(flags.since) : undefined;
  const limit = flags.limit;

  // Initialize logging
  log('INFO', 'Analysis started');

  try {
    // Load configuration
    let config: Config;
    try {
      config = await readConfig();
      logAndPrint(verbose, 'INFO', 'Configuration loaded');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logAndPrint(verbose, 'ERROR', `Failed to load configuration: ${errorMsg}`);
      console.error('Run `sanj init` to set up your configuration.');
      process.exit(1);
    }

    // Check if config has been initialized
    if (!existsSync(join(SANJ_HOME, 'config.json'))) {
      logAndPrint(verbose, 'ERROR', 'Configuration file not found');
      console.error('Run `sanj init` first to initialize Sanj.');
      process.exit(1);
    }

    // Load state to get last analysis run
    const state = await getState();
    const lastRun = state.lastAnalysisRun;

    // Determine effective "since" date
    let effectiveSince = null;
    if (sinceDate) {
      effectiveSince = sinceDate;
    } else if (lastRun) {
      effectiveSince = lastRun;
    }

    if (effectiveSince) {
      logAndPrint(verbose, 'INFO', `Analyzing sessions since ${effectiveSince.toISOString()}`);
    } else {
      logAndPrint(verbose, 'INFO', 'Analyzing all sessions');
    }

    // Create session adapters based on config
    const sessionAdapters = [
      new ClaudeCodeSessionAdapter(),
      new OpenCodeSessionAdapter(),
    ];

    // Filter adapters based on config
    const enabledAdapters = sessionAdapters.filter((adapter) => {
      const adapterKey = adapter.name === 'claude-code' ? 'claudeCode' : 'opencode';
      const isEnabled = (config as any).sessionAdapters?.[adapterKey]?.enabled !== false;
      return isEnabled;
    });

    if (enabledAdapters.length === 0) {
      logAndPrint(verbose, 'ERROR', 'No session adapters enabled');
      console.error('Enable at least one session adapter in config.');
      process.exit(1);
    }

    logAndPrint(verbose, 'INFO', `Enabled session adapters: ${enabledAdapters.map((a) => a.name).join(', ')}`);

    // Create LLM adapter
    const llmAdapter = new OpenCodeLLMAdapter(config.llmAdapter.model);

    // Check if LLM adapter is available
    const llmAvailable = await llmAdapter.isAvailable();
    if (!llmAvailable) {
      logAndPrint(verbose, 'ERROR', `LLM adapter not available: ${llmAdapter.name}`);
      console.error('Check that the configured LLM tool is installed and accessible.');
      process.exit(1);
    }

    logAndPrint(verbose, 'INFO', `Using LLM adapter: ${llmAdapter.name}`);

    // Create observation store
    const observationStore = new ObservationStore();

    // Create analysis engine
    const engine = new AnalysisEngine(
      config,
      sessionAdapters,
      llmAdapter,
      observationStore,
      {
        getLastAnalysisRun: () => lastRun || null,
        updateLastAnalysisRun: async (_timestamp: Date) => {
          if (!noWriteState) {
            await updateLastAnalysisRun();
          }
        },
      },
    );

    logAndPrint(verbose, 'INFO', 'Running analysis...');

    // Run analysis
    const result: AnalysisResult = await engine.run({ since: effectiveSince || undefined, limit });

    // Log detailed results
    log('INFO', `Analysis complete: ${result.status}`);
    log('INFO', `Sessions processed: ${result.sessionsProcessed}`);
    log('INFO', `Sessions failed: ${result.sessionsFailed}`);
    log('INFO', `Observations created: ${result.observationsCreated}`);
    log('INFO', `Observations bumped: ${result.observationsBumped}`);
    log('INFO', `Duration: ${(result.durationMs / 1000).toFixed(2)}s`);

    if (result.errors.length > 0) {
      log('WARN', `${result.errors.length} errors encountered`);
      result.errors.forEach((error, index) => {
        log('WARN', `Error ${index + 1}: ${error.adapter} - ${error.reason}`);
      });
    }

    // Update observation count in state
    try {
      const allObservations = await observationStore.getAll();
      await updateObservationCount(allObservations.length);
      logAndPrint(verbose, 'INFO', `Updated observation count: ${allObservations.length}`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logAndPrint(verbose, 'WARN', `Failed to update observation count: ${errorMsg}`);
    }

    // Print summary to user
    printSummary(result, verbose);

    // Check overall status and exit appropriately
    if (result.status === 'failure') {
      process.exit(1);
    }

    process.exit(0);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logAndPrint(verbose, 'ERROR', `Analysis failed: ${errorMsg}`);
    console.error(`Check ${ANALYZE_LOG_PATH} for details.`);
    process.exit(1);
  }
}

/**
 * Print analysis summary to console.
 *
 * @param result - Analysis result
 * @param verbose - Whether to print verbose output
 */
function printSummary(result: AnalysisResult, verbose: boolean): void {
  if (result.status === 'success') {
    console.log('✓ Analysis complete');
  } else if (result.status === 'partial_failure') {
    console.log('⚠ Analysis complete (with errors)');
  } else {
    console.log('✗ Analysis failed');
  }

  console.log(`  Sessions processed: ${result.sessionsProcessed}`);
  console.log(`  New observations: ${result.observationsCreated}`);
  console.log(`  Updated observations: ${result.observationsBumped}`);

  if (result.sessionsFailed > 0) {
    console.log(`  Sessions failed: ${result.sessionsFailed}`);
  }

  if (verbose && result.errors.length > 0) {
    console.log('\nErrors:');
    result.errors.forEach((error) => {
      console.log(`  - ${error.adapter}: ${error.reason}`);
    });
  }

  console.log(`  Last run: ${result.endTime.toISOString()}`);
}
