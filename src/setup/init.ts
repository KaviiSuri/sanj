/**
 * First-time initialization logic for Sanj
 * Creates directory structure and default configuration
 *
 * TASK-008: First-time initialization logic
 * Dependencies: TASK-005 (config operations), TASK-007 (storage layer)
 */

import { existsSync, mkdirSync } from "fs";
import { join } from "path";
import { SANJ_HOME, CONFIG_PATH, LOGS_DIR, STATE_PATH } from "../storage/paths.js";
import { getDefaultConfig, writeConfig, readConfig } from "../storage/config.js";
import { setState } from "../storage/state.js";
import { injectMemoryContext } from "./memory-context-injector.js";
import type { AnalysisState } from "../core/types.js";

/**
 * Result of initialization operation
 */
export interface InitResult {
  success: boolean;
  message: string;
  alreadyInitialized: boolean;
  createdDirectories: string[];
  createdFiles: string[];
}

/**
 * Initializes the Sanj project structure and configuration.
 *
 * Creates:
 * - ~/.sanj/ directory (SANJ_HOME)
 * - ~/.sanj/logs/ directory (LOGS_DIR)
 * - ~/.sanj/config.json with default configuration
 * - ~/.sanj/state.json with initial analysis state
 *
 * This function is idempotent - safe to run multiple times.
 * If already initialized, returns information about existing setup.
 *
 * @param sanjHome - Optional custom SANJ_HOME path for testing
 * @returns Promise resolving to InitResult with operation details
 * @throws Error if directory/file creation fails with permission issues
 *
 * @example
 * ```typescript
 * const result = await initializeProject();
 * if (result.alreadyInitialized) {
 *   console.log("Already initialized");
 * } else {
 *   console.log("Created:", result.createdDirectories);
 * }
 * ```
 */
export async function initializeProject(sanjHome?: string): Promise<InitResult> {
  const createdDirectories: string[] = [];
  const createdFiles: string[] = [];

  // Use provided path or default
  const homeDir = sanjHome || SANJ_HOME;
  const configPath = sanjHome ? join(sanjHome, "config.json") : CONFIG_PATH;
  const logsDir = sanjHome ? join(sanjHome, "logs") : LOGS_DIR;
  const statePath = sanjHome ? join(sanjHome, "state.json") : STATE_PATH;

  // Check if already initialized
  const alreadyInitialized = existsSync(homeDir) && existsSync(configPath);

  if (alreadyInitialized) {
    // Verify existing configuration is valid
    try {
      await readConfig(configPath);
      return {
        success: true,
        message: "Sanj is already initialized. Configuration is valid.",
        alreadyInitialized: true,
        createdDirectories: [],
        createdFiles: [],
      };
    } catch (error) {
      // Config exists but is invalid - we'll reinitialize
      return {
        success: false,
        message: `Existing configuration is invalid: ${error instanceof Error ? error.message : String(error)}. Please fix or delete ${configPath} and run init again.`,
        alreadyInitialized: true,
        createdDirectories: [],
        createdFiles: [],
      };
    }
  }

  try {
    // Create SANJ_HOME directory if it doesn't exist
    if (!existsSync(homeDir)) {
      mkdirSync(homeDir, { recursive: true });
      createdDirectories.push(homeDir);
    }

    // Create logs directory
    if (!existsSync(logsDir)) {
      mkdirSync(logsDir, { recursive: true });
      createdDirectories.push(logsDir);
    }

    // Generate and write default configuration
    if (!existsSync(configPath)) {
      const defaultConfig = getDefaultConfig();
      await writeConfig(defaultConfig, configPath);
      createdFiles.push(configPath);
    }

    // Initialize state file with empty state
    // State module will handle directory creation automatically
    const initialState: AnalysisState = {
      lastAnalysisRun: undefined,
      lastAnalysisError: undefined,
      sessionCursors: {},
      observationCount: 0,
      longTermMemoryCount: 0,
      coreMemoryCount: 0,
    };

    await setState(initialState, statePath);
    createdFiles.push(statePath);

    // Inject memory context into CLAUDE.md and AGENTS.md
    const injectionResult = await injectMemoryContext();
    const injectedFiles: string[] = [];
    if (injectionResult.claudeMd.injected) {
      injectedFiles.push(injectionResult.claudeMd.path);
    }
    if (injectionResult.agentsMd.injected) {
      injectedFiles.push(injectionResult.agentsMd.path);
    }

    // Build success message
    const message = buildWelcomeMessage(createdDirectories, createdFiles, injectedFiles);

    return {
      success: true,
      message,
      alreadyInitialized: false,
      createdDirectories,
      createdFiles,
    };
  } catch (error) {
    // Handle errors during initialization
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      message: `Initialization failed: ${errorMessage}`,
      alreadyInitialized: false,
      createdDirectories,
      createdFiles,
    };
  }
}

/**
 * Builds a welcome message showing what was created and next steps
 */
function buildWelcomeMessage(
  directories: string[],
  files: string[],
  injectedFiles: string[] = []
): string {
  const lines: string[] = [];

  lines.push("✓ Sanj initialized successfully!");
  lines.push("");

  if (directories.length > 0) {
    lines.push("Created directories:");
    directories.forEach(dir => lines.push(`  - ${dir}`));
    lines.push("");
  }

  if (files.length > 0) {
    lines.push("Created files:");
    files.forEach(file => lines.push(`  - ${file}`));
    lines.push("");
  }

  if (injectedFiles.length > 0) {
    lines.push("Added memory context to:");
    injectedFiles.forEach(file => lines.push(`  - ${file}`));
    lines.push("");
  }

  lines.push("Next steps:");
  lines.push("  1. Run 'sanj config list' to view your configuration");
  lines.push("  2. Run 'sanj analyze' to analyze your coding sessions");
  lines.push("  3. Run 'sanj review' to review and approve observations");
  lines.push("  4. Run 'sanj status' to check your memory statistics");
  lines.push("");
  lines.push("For more help, run 'sanj --help'");

  return lines.join("\n");
}

/**
 * Checks if Sanj has been initialized
 *
 * @param sanjHome - Optional custom SANJ_HOME path for testing
 * @returns true if SANJ_HOME and config.json exist
 */
export function isInitialized(sanjHome?: string): boolean {
  const homeDir = sanjHome || SANJ_HOME;
  const configPath = sanjHome ? join(sanjHome, "config.json") : CONFIG_PATH;
  return existsSync(homeDir) && existsSync(configPath);
}

/**
 * Gets the current initialization status with details
 *
 * @param sanjHome - Optional custom SANJ_HOME path for testing
 * @returns Object with status details
 */
export function getInitializationStatus(sanjHome?: string): {
  initialized: boolean;
  sanjHomeExists: boolean;
  configExists: boolean;
  logsDirectoryExists: boolean;
} {
  const homeDir = sanjHome || SANJ_HOME;
  const configPath = sanjHome ? join(sanjHome, "config.json") : CONFIG_PATH;
  const logsDir = sanjHome ? join(sanjHome, "logs") : LOGS_DIR;

  return {
    initialized: isInitialized(sanjHome),
    sanjHomeExists: existsSync(homeDir),
    configExists: existsSync(configPath),
    logsDirectoryExists: existsSync(logsDir),
  };
}
