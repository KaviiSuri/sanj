/**
 * Status Command Handler
 *
 * Displays a comprehensive status report for Sanj including:
 * - Observation counts (pending, approved, denied, promoted)
 * - Long-term memory and core memory counts
 * - Last analysis run timestamp
 * - Cron schedule information
 * - Overall health status
 *
 * Supports --verbose flag for detailed metrics including:
 * - Category distribution
 * - Top patterns
 * - Age distribution
 * - Recent activity
 *
 * @module cli/commands/status
 */

import { existsSync } from "fs";
import { formatter } from "../formatter.ts";
import { StatusSummaryService } from "../../services/status-summary.ts";
import { MemoryStatsReporter } from "../../reporters/memory-stats.ts";
import { RecentActivityReporter, createTimeWindow } from "../../reporters/recent-activity.ts";
import { SANJ_HOME } from "../../storage/paths.ts";

/**
 * Format a Date as a human-readable string.
 * Shows relative time for recent timestamps, absolute for older ones.
 */
function formatTimestamp(date: Date | null): string {
  if (!date) return "Never";

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes > 1 ? "s" : ""} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;

  return date.toISOString().replace("T", " ").slice(0, 19);
}

/**
 * Main handler for the `sanj status` command.
 *
 * Checks initialization, loads metrics from all sources,
 * and displays a formatted status report.
 *
 * @param ctx - CLERC command context (unused but required by framework)
 */
export async function handleStatus(ctx: unknown): Promise<void> {
  // Check if sanj is initialized
  if (!existsSync(SANJ_HOME)) {
    formatter.error("Sanj is not initialized.");
    formatter.info("Run 'sanj init' to set up Sanj first.");
    process.exit(1);
  }

  // Parse --verbose flag from process args
  const isVerbose = process.argv.includes("--verbose") || process.argv.includes("-v");

  // Note: -v conflicts with --version in CLERC, so we check both but
  // --verbose is the recommended flag for verbose status output

  try {
    const summaryService = new StatusSummaryService();
    const summary = await summaryService.getSummary();

    // Header
    formatter.header("Sanj Status Report");
    formatter.newline();

    // Observations section
    formatter.subheader("Observations");
    formatter.table([
      ["Pending", summary.observations.pending],
      ["Approved", summary.observations.approved],
      ["Denied", summary.observations.denied],
      ["Promoted", summary.observations.promoted],
      ["Total", summary.observations.total],
    ]);
    formatter.newline();

    // Memory section
    formatter.subheader("Memory Hierarchy");
    formatter.table([
      ["Long-Term Items", summary.memory.longTermCount],
      ["Core Memory Items", summary.memory.coreCount],
      ["Ready for Promotion", summary.memory.promotableToCoreCount],
    ]);
    formatter.newline();

    // Analysis section
    formatter.subheader("Analysis");
    formatter.table([
      ["Last Run", formatTimestamp(summary.analysis.lastRun)],
      ["Observations Tracked", summary.analysis.observationCount],
      ["Long-Term Memories", summary.analysis.longTermMemoryCount],
      ["Core Memories", summary.analysis.coreMemoryCount],
    ]);
    if (summary.analysis.lastError) {
      formatter.warning(`Last Error: ${summary.analysis.lastError}`);
    }
    formatter.newline();

    // Cron section
    formatter.subheader("Scheduled Tasks");
    if (summary.cron.isInstalled) {
      const cronRows: Array<[string, string]> = [];
      if (summary.cron.analysis.humanReadable) {
        cronRows.push(["Analysis", summary.cron.analysis.humanReadable]);
      }
      if (summary.cron.promotion.humanReadable) {
        cronRows.push(["Promotion", summary.cron.promotion.humanReadable]);
      }
      if (cronRows.length > 0) {
        formatter.table(cronRows);
      }
    } else {
      formatter.table([
        ["Analysis", "Not scheduled"],
        ["Promotion", "Not scheduled"],
      ]);
      if (summary.cron.message) {
        formatter.info(summary.cron.message);
      }
    }
    formatter.newline();

    // Issues section (if any)
    if (summary.issues.length > 0) {
      formatter.subheader("Issues");
      for (const issue of summary.issues) {
        formatter.warning(issue);
      }
      formatter.newline();
    }

    // Overall status
    const statusIcon =
      summary.healthStatus === "READY"
        ? "READY"
        : summary.healthStatus === "WARNING"
          ? "WARNING"
          : "ERROR";
    formatter.plain(`Status: ${statusIcon}`);

    // Verbose output: detailed statistics
    if (isVerbose) {
      await printVerboseDetails();
    }

    formatter.newline();
    process.exit(0);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    formatter.error(`Failed to generate status: ${msg}`);
    process.exit(1);
  }
}

/**
 * Print verbose status details including memory stats and recent activity.
 */
async function printVerboseDetails(): Promise<void> {
  formatter.newline();
  formatter.subheader("--- Verbose Details ---");

  // Memory statistics
  try {
    const memoryReporter = new MemoryStatsReporter();
    const stats = await memoryReporter.getStats();

    formatter.newline();
    formatter.subheader("Category Distribution");
    if (stats.categoryDistribution.length > 0) {
      formatter.table(
        stats.categoryDistribution.map((c) => [
          c.category,
          `${c.count} (${c.percentage}%)`,
        ])
      );
    } else {
      formatter.plain("  No categories tracked yet.");
    }

    formatter.newline();
    formatter.subheader("Top Patterns");
    if (stats.topPatterns.length > 0) {
      for (let i = 0; i < stats.topPatterns.length; i++) {
        const p = stats.topPatterns[i];
        formatter.plain(
          `  ${i + 1}. [${p.count}x] ${p.text}${p.category ? ` (${p.category})` : ""}`
        );
      }
    } else {
      formatter.plain("  No patterns tracked yet.");
    }

    formatter.newline();
    formatter.subheader("Age Distribution");
    formatter.table(
      stats.ageDistribution.map((b) => [b.label, b.count])
    );

    formatter.newline();
    formatter.subheader("Status Breakdown");
    const statusEntries = Object.entries(stats.statusCounts);
    if (statusEntries.length > 0) {
      formatter.table(statusEntries.map(([status, count]) => [status, count]));
    } else {
      formatter.plain("  No observations tracked yet.");
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    formatter.warning(`Could not load memory stats: ${msg}`);
  }

  // Recent activity
  try {
    const activityReporter = new RecentActivityReporter();
    const activity = await activityReporter.getRecentActivity(
      createTimeWindow(7)
    );

    formatter.newline();
    formatter.subheader("Recent Activity (7 days)");
    formatter.table([
      ["New Observations", activity.newObservations],
      ["Approved", activity.approvedObservations],
      ["Denied", activity.deniedObservations],
      ["Promoted", activity.promotedObservations],
    ]);

    if (activity.items.length > 0) {
      formatter.newline();
      formatter.plain("  Latest activities:");
      const recentItems = activity.items.slice(0, 5);
      for (const item of recentItems) {
        formatter.plain(
          `    ${formatTimestamp(item.timestamp)} - ${item.description}`
        );
      }
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    formatter.warning(`Could not load recent activity: ${msg}`);
  }
}
