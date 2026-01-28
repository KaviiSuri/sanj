/**
 * Doctor Command Handler (Health Check Diagnostics)
 *
 * Performs comprehensive health checks on the Sanj installation:
 * - Configuration validity
 * - Storage directory existence and accessibility
 * - Data file integrity
 * - Session adapter availability
 * - Stale session detection
 *
 * Provides actionable suggestions for any issues found.
 *
 * Usage: sanj doctor
 *
 * @module cli/commands/doctor
 */

import { existsSync, statSync } from "fs";
import { formatter } from "../formatter.ts";
import {
  SANJ_HOME,
  CONFIG_PATH,
  OBSERVATIONS_PATH,
  LONG_TERM_MEMORY_PATH,
  STATE_PATH,
  LOGS_DIR,
} from "../../storage/paths.ts";
import { readConfig } from "../../storage/config.ts";
import { getState } from "../../storage/state.ts";

/**
 * Result of a single diagnostic check.
 */
interface DiagnosticResult {
  name: string;
  status: "pass" | "warning" | "fail";
  message: string;
  suggestion?: string;
}

/**
 * Check if a path exists and is accessible.
 */
function checkPath(
  path: string,
  label: string,
  required: boolean = true
): DiagnosticResult {
  if (!existsSync(path)) {
    return {
      name: label,
      status: required ? "fail" : "warning",
      message: `${label} does not exist: ${path}`,
      suggestion: required
        ? "Run 'sanj init' to create required directories and files."
        : undefined,
    };
  }

  try {
    statSync(path);
    return {
      name: label,
      status: "pass",
      message: `${label} exists and is accessible`,
    };
  } catch {
    return {
      name: label,
      status: "fail",
      message: `${label} exists but is not accessible: ${path}`,
      suggestion: "Check file permissions with 'ls -la' on the path.",
    };
  }
}

/**
 * Check if a JSON file is valid and parseable.
 */
async function checkJsonFile(
  path: string,
  label: string
): Promise<DiagnosticResult> {
  if (!existsSync(path)) {
    return {
      name: `${label} validity`,
      status: "warning",
      message: `${label} does not exist (will use defaults)`,
    };
  }

  try {
    const file = Bun.file(path);
    const text = await file.text();
    JSON.parse(text);
    return {
      name: `${label} validity`,
      status: "pass",
      message: `${label} is valid JSON`,
    };
  } catch (error) {
    return {
      name: `${label} validity`,
      status: "fail",
      message: `${label} contains invalid JSON`,
      suggestion: `Delete ${path} and run 'sanj init' to regenerate with defaults.`,
    };
  }
}

/**
 * Check if an external tool is available in PATH.
 */
async function checkToolAvailability(
  tool: string
): Promise<DiagnosticResult> {
  try {
    const proc = Bun.spawn(["which", tool], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await proc.exited;

    if (exitCode === 0) {
      return {
        name: `${tool} availability`,
        status: "pass",
        message: `${tool} is available in PATH`,
      };
    }

    return {
      name: `${tool} availability`,
      status: "warning",
      message: `${tool} is not available in PATH`,
      suggestion: `Install ${tool} to enable ${tool}-based session analysis.`,
    };
  } catch {
    return {
      name: `${tool} availability`,
      status: "warning",
      message: `Could not check ${tool} availability`,
    };
  }
}

/**
 * Check analysis state for staleness.
 */
async function checkAnalysisState(): Promise<DiagnosticResult> {
  try {
    const state = await getState();

    if (!state.lastAnalysisRun) {
      return {
        name: "Analysis history",
        status: "warning",
        message: "No analysis has been run yet",
        suggestion: "Run 'sanj analyze' to start extracting patterns.",
      };
    }

    // Check if analysis is stale (> 7 days)
    const now = new Date();
    const daysSinceRun =
      (now.getTime() - state.lastAnalysisRun.getTime()) /
      (1000 * 60 * 60 * 24);

    if (daysSinceRun > 7) {
      return {
        name: "Analysis freshness",
        status: "warning",
        message: `Last analysis was ${Math.floor(daysSinceRun)} days ago`,
        suggestion:
          "Run 'sanj analyze' or set up cron with 'sanj cron install'.",
      };
    }

    if (state.lastAnalysisError) {
      return {
        name: "Analysis errors",
        status: "warning",
        message: `Last analysis error: ${state.lastAnalysisError}`,
        suggestion: "Run 'sanj analyze' again to retry.",
      };
    }

    return {
      name: "Analysis history",
      status: "pass",
      message: `Last analysis: ${state.lastAnalysisRun.toISOString().slice(0, 19)}`,
    };
  } catch {
    return {
      name: "Analysis state",
      status: "warning",
      message: "Could not read analysis state",
      suggestion: "Run 'sanj init' to reset state files.",
    };
  }
}

/**
 * Check configuration validity.
 */
async function checkConfig(): Promise<DiagnosticResult[]> {
  const results: DiagnosticResult[] = [];

  try {
    const config = await readConfig();

    // Check LLM adapter configuration
    if (!config.llmAdapter || !config.llmAdapter.type) {
      results.push({
        name: "LLM adapter config",
        status: "fail",
        message: "LLM adapter is not configured",
        suggestion: "Run 'sanj config set llmAdapter.type opencode'.",
      });
    } else {
      results.push({
        name: "LLM adapter config",
        status: "pass",
        message: `LLM adapter: ${config.llmAdapter.type} (${config.llmAdapter.model || "default model"})`,
      });
    }

    // Check session adapters
    const adaptersEnabled =
      (config.sessionAdapters?.claudeCode ? 1 : 0) +
      (config.sessionAdapters?.opencode ? 1 : 0);

    if (adaptersEnabled === 0) {
      results.push({
        name: "Session adapters",
        status: "warning",
        message: "No session adapters are enabled",
        suggestion:
          "Enable at least one adapter: 'sanj config set sessionAdapters.claudeCode true'",
      });
    } else {
      results.push({
        name: "Session adapters",
        status: "pass",
        message: `${adaptersEnabled} session adapter(s) enabled`,
      });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    results.push({
      name: "Configuration",
      status: "fail",
      message: `Failed to read configuration: ${msg}`,
      suggestion: "Run 'sanj init' to regenerate configuration.",
    });
  }

  return results;
}

/**
 * Main handler for the `sanj doctor` command.
 *
 * Runs all diagnostic checks and displays results with suggestions.
 */
export async function handleDoctor(ctx: unknown): Promise<void> {
  formatter.header("Sanj Doctor");
  formatter.newline();

  const results: DiagnosticResult[] = [];

  // 1. Check initialization (directory structure)
  formatter.plain("Checking installation...");
  results.push(checkPath(SANJ_HOME, "Sanj home directory", true));
  results.push(checkPath(LOGS_DIR, "Logs directory", false));
  formatter.newline();

  // 2. Check data files
  formatter.plain("Checking data files...");
  results.push(await checkJsonFile(CONFIG_PATH, "Configuration"));
  results.push(await checkJsonFile(OBSERVATIONS_PATH, "Observations"));
  results.push(await checkJsonFile(STATE_PATH, "State"));
  results.push(
    checkPath(LONG_TERM_MEMORY_PATH, "Long-term memory file", false)
  );
  formatter.newline();

  // 3. Check configuration
  formatter.plain("Checking configuration...");
  const configResults = await checkConfig();
  results.push(...configResults);
  formatter.newline();

  // 4. Check tool availability
  formatter.plain("Checking tools...");
  results.push(await checkToolAvailability("opencode"));
  formatter.newline();

  // 5. Check analysis state
  formatter.plain("Checking analysis history...");
  results.push(await checkAnalysisState());
  formatter.newline();

  // Display results
  formatter.subheader("Diagnostic Results");
  formatter.newline();

  let passes = 0;
  let warnings = 0;
  let failures = 0;

  for (const result of results) {
    switch (result.status) {
      case "pass":
        formatter.success(result.message);
        passes++;
        break;
      case "warning":
        formatter.warning(result.message);
        if (result.suggestion) {
          formatter.plain(`    -> ${result.suggestion}`);
        }
        warnings++;
        break;
      case "fail":
        formatter.error(result.message);
        if (result.suggestion) {
          formatter.plain(`    -> ${result.suggestion}`);
        }
        failures++;
        break;
    }
  }

  formatter.newline();
  formatter.plain(
    `Results: ${passes} passed, ${warnings} warnings, ${failures} failures`
  );

  if (failures > 0) {
    formatter.newline();
    formatter.error("Sanj has issues that need attention.");
    process.exit(1);
  } else if (warnings > 0) {
    formatter.newline();
    formatter.warning("Sanj is functional but has warnings.");
    process.exit(0);
  } else {
    formatter.newline();
    formatter.success("All checks passed! Sanj is healthy.");
    process.exit(0);
  }
}
