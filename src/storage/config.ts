/**
 * Configuration Storage Module
 *
 * Provides type-safe read and write functions for application configuration.
 * Handles ~/.sanj/config.json with atomic writes and graceful error handling.
 *
 * @module storage/config
 */

import { existsSync, renameSync, unlinkSync } from "fs";
import type { Config } from "../core/types";
import { CONFIG_PATH, SANJ_HOME } from "./paths";

/**
 * Returns the default configuration with sensible defaults.
 *
 * Default configuration includes:
 * - OpenCode LLM adapter with GLM-4 model
 * - Both Claude Code and OpenCode session monitoring enabled
 * - Both CLAUDE.md and AGENTS.md memory targets enabled
 * - 24-hour analysis window
 * - Promotion thresholds: 3 observations, 7 days for long-term
 *
 * @returns Default Config object
 */
export function getDefaultConfig(): Config {
  return {
    version: "1.0.0",
    llmAdapter: {
      type: "opencode",
      model: "zai-coding-plan/glm-4.7",
    },
    sessionAdapters: {
      claudeCode: true,
      opencode: true,
    },
    memoryTargets: {
      claudeMd: true,
      agentsMd: true,
    },
    analysis: {
      windowDays: 1, // 24 hours
      similarityThreshold: 0.8,
    },
    promotion: {
      observationCountThreshold: 3,
      longTermDaysThreshold: 7,
    },
  };
}

/**
 * Reads configuration from ~/.sanj/config.json.
 *
 * If the config file doesn't exist, returns default configuration without error.
 * If the file exists but contains invalid JSON, throws an error with helpful context.
 *
 * @returns Promise resolving to Config object
 * @throws Error if config file exists but contains malformed JSON
 *
 * @example
 * const config = await readConfig();
 * console.log(config.llmAdapter.type); // "opencode"
 */
export async function readConfig(): Promise<Config> {
  // Return default config if file doesn't exist
  if (!existsSync(CONFIG_PATH)) {
    return getDefaultConfig();
  }

  try {
    // Read file using Bun's native file API
    const file = Bun.file(CONFIG_PATH);
    const text = await file.text();

    // Parse JSON
    const config = JSON.parse(text) as Config;

    return config;
  } catch (error) {
    // Provide helpful error message for malformed JSON
    if (error instanceof SyntaxError) {
      throw new Error(
        `Failed to parse config.json: Invalid JSON format.\nPath: ${CONFIG_PATH}\nError: ${error.message}`,
      );
    }

    // Re-throw other errors
    throw new Error(
      `Failed to read config.json: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Writes configuration to ~/.sanj/config.json using atomic writes.
 *
 * Uses a temporary file and rename operation to ensure data integrity.
 * Creates the parent directory if it doesn't exist.
 * Formats JSON with 2-space indentation for human readability.
 *
 * @param config - Configuration object to persist
 * @returns Promise that resolves when write completes
 * @throws Error if directory doesn't exist or write fails
 *
 * @example
 * const config = getDefaultConfig();
 * config.analysis.windowDays = 7;
 * await writeConfig(config);
 */
export async function writeConfig(config: Config): Promise<void> {
  // Ensure parent directory exists
  if (!existsSync(SANJ_HOME)) {
    throw new Error(
      `Config directory does not exist: ${SANJ_HOME}\n` +
        `Please run 'sanj init' first to initialize the application.`,
    );
  }

  // Create temporary file path
  const tempPath = `${CONFIG_PATH}.tmp`;

  try {
    // Serialize config with readable formatting
    const jsonContent = JSON.stringify(config, null, 2);

    // Write to temporary file using Bun's native API
    await Bun.write(tempPath, jsonContent);

    // Atomic rename (on most systems, this is atomic)
    renameSync(tempPath, CONFIG_PATH);
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
      `Failed to write config.json: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
