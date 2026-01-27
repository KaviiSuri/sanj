/**
 * State Storage Module
 *
 * Manages Sanj's state file (~/.sanj/state.json) for tracking:
 * - Last analysis run timestamp
 * - Session cursors for incremental analysis
 * - Error recovery data
 * - Current counts (observations, memories)
 *
 * Enables incremental analysis by tracking the last successful run.
 *
 * @module storage/state
 */

import { existsSync, mkdirSync, renameSync, unlinkSync } from "fs";
import type { AnalysisState } from "../core/types";
import { SANJ_HOME, STATE_PATH } from "./paths";

/**
 * State file schema
 * Persisted to ~/.sanj/state.json
 */
interface StateFile {
  /** ISO 8601 timestamp of last successful analysis */
  lastAnalysisRun: string | null;

  /** Per-adapter cursor positions for incremental processing */
  sessionCursors: Record<string, string | null>;

  /** State file schema version for future migrations */
  version: number;

  /** Last error message for debugging */
  lastError: string | null;

  /** Current observation count */
  observationCount: number;

  /** Current long-term memory count */
  longTermMemoryCount: number;

  /** Current core memory count */
  coreMemoryCount: number;
}

/**
 * Returns the default state when no state file exists.
 *
 * Default state includes:
 * - No previous analysis run
 * - Empty cursors
 * - No errors
 * - Zero counts
 *
 * @returns Default StateFile object
 */
function getDefaultState(): StateFile {
  return {
    lastAnalysisRun: null,
    sessionCursors: {},
    version: 1,
    lastError: null,
    observationCount: 0,
    longTermMemoryCount: 0,
    coreMemoryCount: 0,
  };
}

/**
 * Converts StateFile (disk format) to AnalysisState (runtime format)
 *
 * @param stateFile - State file from disk
 * @returns AnalysisState object with Date objects
 */
function stateFileToAnalysisState(stateFile: StateFile): AnalysisState {
  return {
    lastAnalysisRun: stateFile.lastAnalysisRun
      ? new Date(stateFile.lastAnalysisRun)
      : undefined,
    lastAnalysisError: stateFile.lastError ?? undefined,
    sessionCursors: stateFile.sessionCursors as Record<string, string>,
    observationCount: stateFile.observationCount,
    longTermMemoryCount: stateFile.longTermMemoryCount,
    coreMemoryCount: stateFile.coreMemoryCount,
  };
}

/**
 * Converts AnalysisState (runtime format) to StateFile (disk format)
 *
 * @param state - Runtime state object
 * @returns StateFile object with ISO strings
 */
function analysisStateToStateFile(state: AnalysisState): StateFile {
  return {
    lastAnalysisRun: state.lastAnalysisRun
      ? state.lastAnalysisRun.toISOString()
      : null,
    sessionCursors: state.sessionCursors ?? {},
    version: 1,
    lastError: state.lastAnalysisError ?? null,
    observationCount: state.observationCount,
    longTermMemoryCount: state.longTermMemoryCount,
    coreMemoryCount: state.coreMemoryCount,
  };
}

/**
 * Loads state from ~/.sanj/state.json.
 *
 * If the state file doesn't exist, returns default state without error.
 * If the file exists but contains invalid JSON, throws an error.
 *
 * @param statePath - Optional custom state file path (for testing)
 * @returns Promise resolving to AnalysisState object
 * @throws Error if state file exists but contains malformed JSON
 *
 * @example
 * const state = await getState();
 * console.log(state.lastAnalysisRun); // Date | undefined
 */
export async function getState(statePath?: string): Promise<AnalysisState> {
  const path = statePath || STATE_PATH;

  // Return default state if file doesn't exist
  if (!existsSync(path)) {
    return stateFileToAnalysisState(getDefaultState());
  }

  try {
    // Read file using Bun's native file API
    const file = Bun.file(path);
    const text = await file.text();

    // Parse JSON
    const stateFile = JSON.parse(text) as StateFile;

    // Convert to runtime format
    return stateFileToAnalysisState(stateFile);
  } catch (error) {
    // Provide helpful error message for malformed JSON
    if (error instanceof SyntaxError) {
      throw new Error(
        `Failed to parse state.json: Invalid JSON format.\nPath: ${path}\nError: ${error.message}`,
      );
    }

    // Re-throw other errors
    throw new Error(
      `Failed to read state.json: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Writes state to ~/.sanj/state.json using atomic writes.
 *
 * Uses a temporary file and rename operation to ensure data integrity.
 * Creates the parent directory if it doesn't exist.
 * Formats JSON with 2-space indentation for human readability.
 *
 * @param state - State object to persist
 * @param statePath - Optional custom state file path (for testing)
 * @returns Promise that resolves when write completes
 * @throws Error if write fails
 *
 * @example
 * const state = await getState();
 * state.observationCount = 10;
 * await setState(state);
 */
export async function setState(
  state: AnalysisState,
  statePath?: string,
): Promise<void> {
  const path = statePath || STATE_PATH;
  const parentDir = statePath ? path.substring(0, path.lastIndexOf("/")) : SANJ_HOME;

  // Ensure parent directory exists
  if (!existsSync(parentDir)) {
    mkdirSync(parentDir, { recursive: true });
  }

  // Convert to disk format
  const stateFile = analysisStateToStateFile(state);

  // Create temporary file path
  const tempPath = `${path}.tmp`;

  try {
    // Serialize state with readable formatting
    const jsonContent = JSON.stringify(stateFile, null, 2);

    // Write to temporary file using Bun's native API
    await Bun.write(tempPath, jsonContent);

    // Atomic rename (on most systems, this is atomic)
    renameSync(tempPath, path);
  } catch (error) {
    // Clean up temp file if it exists
    if (existsSync(tempPath)) {
      try {
        unlinkSync(tempPath);
      } catch {
        // Ignore cleanup errors
      }
    }

    // Throw helpful error message
    throw new Error(
      `Failed to write state.json: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Updates the last analysis run timestamp to now.
 *
 * Loads current state, sets lastAnalysisRun to current time,
 * clears any error state, and persists to disk.
 *
 * @param statePath - Optional custom state file path (for testing)
 * @returns Promise that resolves when update completes
 *
 * @example
 * await updateLastAnalysisRun();
 * // state.json now has lastAnalysisRun set to current time
 */
export async function updateLastAnalysisRun(statePath?: string): Promise<void> {
  const state = await getState(statePath);
  state.lastAnalysisRun = new Date();
  state.lastAnalysisError = undefined;
  await setState(state, statePath);
}

/**
 * Gets the timestamp of the last analysis run.
 *
 * @param statePath - Optional custom state file path (for testing)
 * @returns Promise resolving to Date object or null if no run has occurred
 *
 * @example
 * const lastRun = await getLastAnalysisRun();
 * if (lastRun) {
 *   console.log(`Last analysis: ${lastRun.toISOString()}`);
 * }
 */
export async function getLastAnalysisRun(statePath?: string): Promise<Date | null> {
  const state = await getState(statePath);
  return state.lastAnalysisRun ?? null;
}

/**
 * Updates the cursor for a specific session adapter.
 *
 * Cursors track the last processed session timestamp per adapter,
 * enabling incremental analysis.
 *
 * @param adapter - Adapter name (e.g., "claude_code", "opencode")
 * @param timestamp - Last session timestamp processed
 * @param statePath - Optional custom state file path (for testing)
 * @returns Promise that resolves when update completes
 *
 * @example
 * await updateSessionCursor('claude_code', new Date());
 */
export async function updateSessionCursor(
  adapter: string,
  timestamp: Date,
  statePath?: string,
): Promise<void> {
  const state = await getState(statePath);
  if (!state.sessionCursors) {
    state.sessionCursors = {};
  }
  state.sessionCursors[adapter] = timestamp.toISOString();
  await setState(state, statePath);
}

/**
 * Gets the last processed session timestamp for an adapter.
 *
 * @param adapter - Adapter name (e.g., "claude_code", "opencode")
 * @param statePath - Optional custom state file path (for testing)
 * @returns Promise resolving to Date object or null if no cursor exists
 *
 * @example
 * const cursor = await getSessionCursor('claude_code');
 * if (cursor) {
 *   console.log(`Last processed: ${cursor.toISOString()}`);
 * }
 */
export async function getSessionCursor(
  adapter: string,
  statePath?: string,
): Promise<Date | null> {
  const state = await getState(statePath);
  const cursorString = state.sessionCursors?.[adapter];
  return cursorString ? new Date(cursorString) : null;
}

/**
 * Records an error for debugging and recovery.
 *
 * This function never throws - errors during error recording are silently ignored
 * to prevent cascading failures.
 *
 * @param message - Error message to record
 * @param statePath - Optional custom state file path (for testing)
 * @returns Promise that resolves when recording completes (or fails silently)
 *
 * @example
 * try {
 *   await performAnalysis();
 * } catch (error) {
 *   await recordError(`Analysis failed: ${error.message}`);
 * }
 */
export async function recordError(
  message: string,
  statePath?: string,
): Promise<void> {
  try {
    const state = await getState(statePath);
    state.lastAnalysisError = message;
    await setState(state, statePath);
  } catch {
    // Swallow errors - error recording should never throw
  }
}

/**
 * Updates observation count in state.
 *
 * @param count - New observation count
 * @param statePath - Optional custom state file path (for testing)
 * @returns Promise that resolves when update completes
 *
 * @example
 * await updateObservationCount(10);
 */
export async function updateObservationCount(
  count: number,
  statePath?: string,
): Promise<void> {
  const state = await getState(statePath);
  state.observationCount = count;
  await setState(state, statePath);
}

/**
 * Updates long-term memory count in state.
 *
 * @param count - New long-term memory count
 * @param statePath - Optional custom state file path (for testing)
 * @returns Promise that resolves when update completes
 *
 * @example
 * await updateLongTermMemoryCount(5);
 */
export async function updateLongTermMemoryCount(
  count: number,
  statePath?: string,
): Promise<void> {
  const state = await getState(statePath);
  state.longTermMemoryCount = count;
  await setState(state, statePath);
}

/**
 * Updates core memory count in state.
 *
 * @param count - New core memory count
 * @param statePath - Optional custom state file path (for testing)
 * @returns Promise that resolves when update completes
 *
 * @example
 * await updateCoreMemoryCount(3);
 */
export async function updateCoreMemoryCount(
  count: number,
  statePath?: string,
): Promise<void> {
  const state = await getState(statePath);
  state.coreMemoryCount = count;
  await setState(state, statePath);
}
