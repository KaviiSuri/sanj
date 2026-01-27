/**
 * Config Command Handler
 *
 * Implements the `sanj config` command with subcommands:
 * - list: Display all configuration settings
 * - get <key>: Get a specific configuration value
 * - set <key> <value>: Update a specific configuration value
 *
 * @module cli/commands/config
 */

import type { Clerc } from "clerc";
import { existsSync } from "fs";
import type { Config } from "../../core/types";
import { readConfig, writeConfig, getDefaultConfig } from "../../storage/config";
import { CONFIG_PATH } from "../../storage/paths";

/**
 * Main config command handler that routes to subcommands.
 */
export async function configHandler(ctx: Clerc.Context): Promise<void> {
  // Get arguments from process.argv (CLERC doesn't expose rawArguments)
  // Format: ["bun", "dist/cli.js", "config", "subcommand", "arg1", "arg2", ...]
  const argv = process.argv;
  const configIndex = argv.indexOf("config");
  const args = configIndex >= 0 ? argv.slice(configIndex + 1) : [];
  const subcommand = args[0];

  // Default to "list" if no subcommand specified
  if (!subcommand || subcommand === "list") {
    await configListHandler(ctx);
    return;
  }

  if (subcommand === "get") {
    const key = args[1];
    if (!key) {
      console.error("✗ Error: Missing key argument");
      console.error("Usage: sanj config get <key>");
      console.error("\nExample: sanj config get llmAdapter.type");
      process.exit(1);
    }
    await configGetHandler(key);
    return;
  }

  if (subcommand === "set") {
    const key = args[1];
    const value = args[2];
    if (!key || value === undefined) {
      console.error("✗ Error: Missing key or value argument");
      console.error("Usage: sanj config set <key> <value>");
      console.error("\nExamples:");
      console.error("  sanj config set llmAdapter.type opencode");
      console.error("  sanj config set analysis.windowDays 7");
      console.error("  sanj config set sessionAdapters.claudeCode true");
      process.exit(1);
    }
    await configSetHandler(key, value);
    return;
  }

  console.error(`✗ Error: Unknown subcommand '${subcommand}'`);
  console.error("Valid subcommands: list, get, set");
  console.error("\nUsage:");
  console.error("  sanj config [list]           - Show all configuration");
  console.error("  sanj config get <key>        - Get a specific value");
  console.error("  sanj config set <key> <value> - Set a specific value");
  process.exit(1);
}

/**
 * Display all configuration settings in a human-readable format.
 */
async function configListHandler(ctx: Clerc.Context): Promise<void> {
  try {
    // Check if initialized
    if (!existsSync(CONFIG_PATH)) {
      console.error("✗ Error: Config not found");
      console.error("Run 'sanj init' first to initialize the application.");
      process.exit(1);
    }

    const config = await readConfig();

    // Display config location
    console.log(`Config Location: ${CONFIG_PATH}\n`);

    // LLM Configuration
    console.log("LLM Configuration:");
    console.log(`  Adapter: ${config.llmAdapter.type}`);
    console.log(`  Model: ${config.llmAdapter.model || "(not set)"}\n`);

    // Session Adapters
    console.log("Session Adapters:");
    console.log(`  Claude Code: ${config.sessionAdapters.claudeCode ? "enabled" : "disabled"}`);
    console.log(`  OpenCode: ${config.sessionAdapters.opencode ? "enabled" : "disabled"}\n`);

    // Memory Targets
    console.log("Memory Targets:");
    console.log(`  CLAUDE.md: ${config.memoryTargets.claudeMd ? "enabled" : "disabled"}`);
    console.log(`  AGENTS.md: ${config.memoryTargets.agentsMd ? "enabled" : "disabled"}\n`);

    // Analysis Settings
    console.log("Analysis Settings:");
    console.log(`  Analysis Window: ${config.analysis.windowDays || 1} days`);
    console.log(`  Similarity Threshold: ${config.analysis.similarityThreshold || 0.8}\n`);

    // Promotion Thresholds
    console.log("Promotion Thresholds:");
    console.log(`  Observation → Long-Term: ${config.promotion.observationCountThreshold} occurrences`);
    console.log(`  Long-Term → Core: ${config.promotion.longTermDaysThreshold} days\n`);

    // Cron Settings (if present)
    if (config.cron) {
      console.log("Scheduled Automation:");
      console.log(`  Analysis Schedule: ${config.cron.analysisSchedule || "(not set)"}`);
      console.log(`  Promotion Schedule: ${config.cron.promotionSchedule || "(not set)"}\n`);
    }

    process.exit(0);
  } catch (error) {
    console.error("✗ Error reading configuration:");
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * Get a specific configuration value by key path.
 * Supports nested keys using dot notation (e.g., "llmAdapter.type").
 */
async function configGetHandler(key: string): Promise<void> {
  try {
    // Check if initialized
    if (!existsSync(CONFIG_PATH)) {
      console.error("✗ Error: Config not found");
      console.error("Run 'sanj init' first to initialize the application.");
      process.exit(1);
    }

    const config = await readConfig();
    const value = getNestedValue(config, key);

    if (value === undefined) {
      console.error(`✗ Error: Unknown config key '${key}'`);
      console.error("\nValid keys:");
      console.error("  llmAdapter.type");
      console.error("  llmAdapter.model");
      console.error("  sessionAdapters.claudeCode");
      console.error("  sessionAdapters.opencode");
      console.error("  memoryTargets.claudeMd");
      console.error("  memoryTargets.agentsMd");
      console.error("  analysis.windowDays");
      console.error("  analysis.similarityThreshold");
      console.error("  promotion.observationCountThreshold");
      console.error("  promotion.longTermDaysThreshold");
      process.exit(1);
    }

    // Format output based on value type
    if (typeof value === "object" && value !== null) {
      console.log(JSON.stringify(value, null, 2));
    } else {
      console.log(String(value));
    }

    process.exit(0);
  } catch (error) {
    console.error("✗ Error reading configuration:");
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * Set a specific configuration value by key path with validation.
 * Supports nested keys using dot notation (e.g., "llmAdapter.type").
 */
async function configSetHandler(key: string, value: string): Promise<void> {
  try {
    // Check if initialized
    if (!existsSync(CONFIG_PATH)) {
      console.error("✗ Error: Config not found");
      console.error("Run 'sanj init' first to initialize the application.");
      process.exit(1);
    }

    const config = await readConfig();
    const oldValue = getNestedValue(config, key);

    if (oldValue === undefined) {
      console.error(`✗ Error: Unknown config key '${key}'`);
      console.error("\nValid keys:");
      console.error("  llmAdapter.type");
      console.error("  llmAdapter.model");
      console.error("  sessionAdapters.claudeCode");
      console.error("  sessionAdapters.opencode");
      console.error("  memoryTargets.claudeMd");
      console.error("  memoryTargets.agentsMd");
      console.error("  analysis.windowDays");
      console.error("  analysis.similarityThreshold");
      console.error("  promotion.observationCountThreshold");
      console.error("  promotion.longTermDaysThreshold");
      process.exit(1);
    }

    // Validate and coerce value
    const coercedValue = validateAndCoerceValue(key, value, config);

    // Set the new value
    setNestedValue(config, key, coercedValue);

    // Validate config after change (for cross-field constraints)
    validateConfig(config);

    // Persist to disk
    await writeConfig(config);

    // Show confirmation
    console.log("✓ Updated config");
    console.log(`  ${key}: ${formatValue(oldValue)} → ${formatValue(coercedValue)}`);
    process.exit(0);
  } catch (error) {
    console.error("✗ Error updating configuration:");
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * Get a nested value from an object using dot notation.
 */
function getNestedValue(obj: any, path: string): any {
  const keys = path.split(".");
  let current = obj;

  for (const key of keys) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    current = current[key];
  }

  return current;
}

/**
 * Set a nested value in an object using dot notation.
 */
function setNestedValue(obj: any, path: string, value: any): void {
  const keys = path.split(".");
  let current = obj;

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (current[key] === undefined || typeof current[key] !== "object") {
      return; // Path doesn't exist
    }
    current = current[key];
  }

  const lastKey = keys[keys.length - 1];
  current[lastKey] = value;
}

/**
 * Validate and coerce a value based on the config key.
 */
function validateAndCoerceValue(key: string, value: string, config: Config): any {
  // LLM Adapter Type
  if (key === "llmAdapter.type") {
    const validTypes = ["opencode", "claude-code"];
    if (!validTypes.includes(value)) {
      throw new Error(
        `Invalid value for llmAdapter.type.\n` +
          `Must be one of: ${validTypes.join(", ")}\n` +
          `Current setting: ${config.llmAdapter.type}`
      );
    }
    return value;
  }

  // LLM Model
  if (key === "llmAdapter.model") {
    if (value.trim() === "") {
      throw new Error("Invalid value for llmAdapter.model. Model name cannot be empty.");
    }
    return value;
  }

  // Boolean fields
  if (
    key === "sessionAdapters.claudeCode" ||
    key === "sessionAdapters.opencode" ||
    key === "memoryTargets.claudeMd" ||
    key === "memoryTargets.agentsMd"
  ) {
    const boolValue = coerceBoolean(value);
    if (boolValue === null) {
      throw new Error(
        `Invalid value for ${key}.\n` +
          `Must be a boolean (true/false, yes/no, 1/0).\n` +
          `Current setting: ${getNestedValue(config, key)}`
      );
    }
    return boolValue;
  }

  // Numeric fields
  if (
    key === "analysis.windowDays" ||
    key === "analysis.similarityThreshold" ||
    key === "promotion.observationCountThreshold" ||
    key === "promotion.longTermDaysThreshold"
  ) {
    const numValue = parseFloat(value);
    if (isNaN(numValue)) {
      throw new Error(
        `Invalid value for ${key}.\n` +
          `Must be a number.\n` +
          `Current setting: ${getNestedValue(config, key)}`
      );
    }

    // Special validation for integers
    if (
      key === "analysis.windowDays" ||
      key === "promotion.observationCountThreshold" ||
      key === "promotion.longTermDaysThreshold"
    ) {
      if (!Number.isInteger(numValue) || numValue < 1) {
        throw new Error(
          `Invalid value for ${key}.\n` +
            `Must be an integer >= 1.\n` +
            `Current setting: ${getNestedValue(config, key)}`
        );
      }
    }

    // Special validation for similarity threshold
    if (key === "analysis.similarityThreshold") {
      if (numValue < 0 || numValue > 1) {
        throw new Error(
          `Invalid value for ${key}.\n` +
            `Must be a number between 0 and 1.\n` +
            `Current setting: ${getNestedValue(config, key)}`
        );
      }
    }

    return numValue;
  }

  // If we reach here, return the value as-is (string)
  return value;
}

/**
 * Coerce a string to a boolean value.
 * Returns null if the value cannot be coerced.
 */
function coerceBoolean(value: string): boolean | null {
  const lower = value.toLowerCase().trim();
  if (lower === "true" || lower === "yes" || lower === "1") return true;
  if (lower === "false" || lower === "no" || lower === "0") return false;
  return null;
}

/**
 * Validate config for cross-field constraints.
 */
function validateConfig(config: Config): void {
  // At least one session adapter must be enabled
  if (!config.sessionAdapters.claudeCode && !config.sessionAdapters.opencode) {
    throw new Error(
      "Cannot disable all session adapters.\n" +
        "At least one adapter (claudeCode or opencode) must be enabled."
    );
  }

  // At least one memory target must be enabled
  if (!config.memoryTargets.claudeMd && !config.memoryTargets.agentsMd) {
    throw new Error(
      "Cannot disable all memory targets.\n" +
        "At least one target (claudeMd or agentsMd) must be enabled."
    );
  }
}

/**
 * Format a value for display in confirmation messages.
 */
function formatValue(value: any): string {
  if (typeof value === "boolean") return value ? "enabled" : "disabled";
  if (typeof value === "object" && value !== null) return JSON.stringify(value);
  return String(value);
}
