/**
 * Storage Path Constants
 *
 * Centralizes all file and directory paths for the Sanj ecosystem.
 * All paths are absolute and rooted at ~/.sanj/
 *
 * @module storage/paths
 */

import { homedir } from "os";
import { join } from "path";

/**
 * Root directory for all Sanj storage
 * Location: ~/.sanj/
 *
 * Used by: init command, all storage operations
 * @example "/Users/username/.sanj"
 */
export const SANJ_HOME = join(homedir(), ".sanj");

/**
 * Configuration file path
 * Location: ~/.sanj/config.json
 *
 * Stores user configuration and preferences including:
 * - LLM provider settings (Anthropic/OpenAI)
 * - API keys
 * - Model selection
 * - Memory settings
 *
 * Used by: ConfigManager (storage/config.ts)
 * @example "/Users/username/.sanj/config.json"
 */
export const CONFIG_PATH = join(SANJ_HOME, "config.json");

/**
 * Observations storage file path
 * Location: ~/.sanj/observations.json
 *
 * Stores all user observations collected via the observe command.
 * Each observation includes timestamp, tags, and content.
 *
 * Used by: ObservationStore, observe command
 * @example "/Users/username/.sanj/observations.json"
 */
export const OBSERVATIONS_PATH = join(SANJ_HOME, "observations.json");

/**
 * Long-term memory file path
 * Location: ~/.sanj/long-term-memory.md
 *
 * Markdown file containing consolidated insights and patterns
 * extracted from observations over time.
 *
 * Used by: MemoryHierarchy, reflect command
 * @example "/Users/username/.sanj/long-term-memory.md"
 */
export const LONG_TERM_MEMORY_PATH = join(SANJ_HOME, "long-term-memory.md");

/**
 * State tracking file path
 * Location: ~/.sanj/state.json
 *
 * Tracks system state including:
 * - Last reflection timestamp
 * - Active sessions
 * - Scheduled task status
 *
 * Used by: StateManager (storage/state.ts), CronHandler
 * @example "/Users/username/.sanj/state.json"
 */
export const STATE_PATH = join(SANJ_HOME, "state.json");

/**
 * Logs directory path
 * Location: ~/.sanj/logs/
 *
 * Contains timestamped log files for:
 * - Cron job execution
 * - System operations
 * - Error tracking
 *
 * Used by: CronHandler, logging utilities
 * @example "/Users/username/.sanj/logs"
 */
export const LOGS_DIR = join(SANJ_HOME, "logs");

/**
 * Default export containing all path constants
 * Convenient for importing all paths at once
 *
 * @example
 * import paths from './storage/paths';
 * console.log(paths.CONFIG_PATH);
 */
export default {
  SANJ_HOME,
  CONFIG_PATH,
  OBSERVATIONS_PATH,
  LONG_TERM_MEMORY_PATH,
  STATE_PATH,
  LOGS_DIR,
};
