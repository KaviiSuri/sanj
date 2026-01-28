/**
 * Status Summary Service
 *
 * Aggregates system statistics from all data sources:
 * - Observation counts by status (pending, approved, denied, promoted)
 * - Long-term memory counts and promotion eligibility
 * - Analysis run history (last run, errors)
 * - Cron schedule information
 *
 * Used by the `sanj status` command to provide a unified view
 * of the system's current state.
 *
 * @module services/status-summary
 */

import { ObservationStore } from "../storage/observation-store.ts";
import { MemoryStore } from "../storage/memory-store.ts";
import { getState } from "../storage/state.ts";

/**
 * Complete status summary containing all system metrics.
 */
export interface StatusSummary {
  /** Observation metrics by status */
  observations: {
    pending: number;
    approved: number;
    denied: number;
    promoted: number;
    total: number;
  };
  /** Memory hierarchy metrics */
  memory: {
    longTermCount: number;
    coreCount: number;
    promotableToCoreCount: number;
  };
  /** Analysis run history */
  analysis: {
    lastRun: Date | null;
    lastError: string | null;
    observationCount: number;
    longTermMemoryCount: number;
    coreMemoryCount: number;
  };
  /** Cron schedule information */
  cron: ScheduleInfo;
  /** Overall health status */
  healthStatus: "READY" | "WARNING" | "ERROR";
  /** Specific health issues found */
  issues: string[];
  /** Timestamp when this summary was generated */
  generatedAt: Date;
}

/**
 * Information about installed cron schedules.
 */
export interface ScheduleInfo {
  isInstalled: boolean;
  analysis: {
    cronExpression?: string;
    humanReadable?: string;
  };
  promotion: {
    cronExpression?: string;
    humanReadable?: string;
  };
  message?: string;
}

/**
 * StatusSummaryService aggregates metrics from all system components.
 *
 * Integrates with:
 * - ObservationStore for observation counts
 * - MemoryStore for memory hierarchy metrics
 * - state.ts for analysis run history
 * - System crontab for schedule information
 */
export class StatusSummaryService {
  private observationStore: ObservationStore;
  private memoryStore: MemoryStore;

  constructor(observationStorePath?: string, memoryStorePath?: string) {
    this.observationStore = new ObservationStore(observationStorePath);
    this.memoryStore = new MemoryStore(memoryStorePath);
  }

  /**
   * Generate a complete status summary.
   *
   * Loads all data sources and aggregates metrics.
   * Never throws — returns summary with issues array for any errors encountered.
   *
   * @returns Complete StatusSummary with all metrics
   */
  async getSummary(): Promise<StatusSummary> {
    const issues: string[] = [];

    // Load observation metrics
    const observations = await this.getObservationMetrics(issues);

    // Load memory metrics
    const memory = await this.getMemoryMetrics(issues);

    // Load analysis state
    const analysis = await this.getAnalysisMetrics(issues);

    // Load cron schedule
    const cron = await this.getCronSchedule(issues);

    // Determine overall health
    const healthStatus = this.calculateHealthStatus(observations, analysis, issues);

    return {
      observations,
      memory,
      analysis,
      cron,
      healthStatus,
      issues,
      generatedAt: new Date(),
    };
  }

  /**
   * Get observation counts broken down by status.
   */
  private async getObservationMetrics(
    issues: string[]
  ): Promise<StatusSummary["observations"]> {
    try {
      await this.observationStore.load();
      const all = await this.observationStore.getAll();

      let pending = 0;
      let approved = 0;
      let denied = 0;
      let promoted = 0;

      for (const obs of all) {
        switch (obs.status) {
          case "pending":
            pending++;
            break;
          case "approved":
            approved++;
            break;
          case "denied":
            denied++;
            break;
          case "promoted-to-long-term":
          case "promoted-to-core":
            promoted++;
            break;
        }
      }

      return { pending, approved, denied, promoted, total: all.length };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      issues.push(`Failed to load observations: ${msg}`);
      return { pending: 0, approved: 0, denied: 0, promoted: 0, total: 0 };
    }
  }

  /**
   * Get memory hierarchy counts.
   */
  private async getMemoryMetrics(
    issues: string[]
  ): Promise<StatusSummary["memory"]> {
    try {
      await this.memoryStore.load();
      const counts = await this.memoryStore.getCounts();
      const promotable = await this.memoryStore.getPromotableToCore();

      return {
        longTermCount: counts.longTerm,
        coreCount: counts.core,
        promotableToCoreCount: promotable.length,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      issues.push(`Failed to load memory store: ${msg}`);
      return { longTermCount: 0, coreCount: 0, promotableToCoreCount: 0 };
    }
  }

  /**
   * Get analysis run state from state.json.
   */
  private async getAnalysisMetrics(
    issues: string[]
  ): Promise<StatusSummary["analysis"]> {
    try {
      const state = await getState();
      return {
        lastRun: state.lastAnalysisRun ?? null,
        lastError: state.lastAnalysisError ?? null,
        observationCount: state.observationCount,
        longTermMemoryCount: state.longTermMemoryCount,
        coreMemoryCount: state.coreMemoryCount,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      issues.push(`Failed to read analysis state: ${msg}`);
      return {
        lastRun: null,
        lastError: null,
        observationCount: 0,
        longTermMemoryCount: 0,
        coreMemoryCount: 0,
      };
    }
  }

  /**
   * Read cron schedule from system crontab.
   *
   * Parses output of `crontab -l` to find sanj entries.
   * Returns graceful defaults when crontab is unavailable.
   */
  private async getCronSchedule(issues: string[]): Promise<ScheduleInfo> {
    try {
      const proc = Bun.spawn(["crontab", "-l"], {
        stdout: "pipe",
        stderr: "pipe",
      });

      const stdout = await new Response(proc.stdout).text();
      const exitCode = await proc.exited;

      if (exitCode !== 0) {
        return {
          isInstalled: false,
          analysis: {},
          promotion: {},
          message: "Cron not configured. Run: sanj cron install",
        };
      }

      const lines = stdout.split("\n");
      let analysisEntry: string | undefined;
      let promotionEntry: string | undefined;

      for (const line of lines) {
        if (line.includes("sanj") && line.includes("analyze")) {
          analysisEntry = line.trim();
        }
        if (line.includes("sanj") && line.includes("promot")) {
          promotionEntry = line.trim();
        }
      }

      const isInstalled = !!(analysisEntry || promotionEntry);

      return {
        isInstalled,
        analysis: analysisEntry
          ? {
              cronExpression: this.extractCronExpression(analysisEntry),
              humanReadable: this.cronToHumanReadable(
                this.extractCronExpression(analysisEntry)
              ),
            }
          : {},
        promotion: promotionEntry
          ? {
              cronExpression: this.extractCronExpression(promotionEntry),
              humanReadable: this.cronToHumanReadable(
                this.extractCronExpression(promotionEntry)
              ),
            }
          : {},
        message: isInstalled
          ? undefined
          : "No sanj cron entries found. Run: sanj cron install",
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      issues.push(`Unable to read crontab: ${msg}`);
      return {
        isInstalled: false,
        analysis: {},
        promotion: {},
        message: "Unable to read crontab (permission denied or not available)",
      };
    }
  }

  /**
   * Extract the cron expression (first 5 fields) from a crontab line.
   */
  private extractCronExpression(line: string): string {
    const parts = line.split(/\s+/);
    if (parts.length >= 5) {
      return parts.slice(0, 5).join(" ");
    }
    return line;
  }

  /**
   * Convert a cron expression to a human-readable description.
   *
   * Handles common patterns:
   * - "0 20 * * *" → "Daily at 8:00 PM"
   * - "0 10 * * 0" → "Weekly on Sunday at 10:00 AM"
   */
  private cronToHumanReadable(expression: string): string {
    const parts = expression.split(/\s+/);
    if (parts.length !== 5) return expression;

    const [minute, hour, dayOfMonth, , dayOfWeek] = parts;

    const days = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ];

    const formatTime = (h: string, m: string): string => {
      const hourNum = parseInt(h, 10);
      const minNum = parseInt(m, 10);
      const period = hourNum >= 12 ? "PM" : "AM";
      const hour12 = hourNum === 0 ? 12 : hourNum > 12 ? hourNum - 12 : hourNum;
      return `${hour12}:${String(minNum).padStart(2, "0")} ${period}`;
    };

    // Daily at specific time
    if (
      dayOfMonth === "*" &&
      dayOfWeek === "*" &&
      minute !== "*" &&
      hour !== "*"
    ) {
      return `Daily at ${formatTime(hour, minute)}`;
    }

    // Weekly on specific day
    if (
      dayOfMonth === "*" &&
      dayOfWeek !== "*" &&
      minute !== "*" &&
      hour !== "*"
    ) {
      const dayIndex = parseInt(dayOfWeek, 10);
      const dayName = days[dayIndex] || dayOfWeek;
      return `Weekly on ${dayName} at ${formatTime(hour, minute)}`;
    }

    return expression;
  }

  /**
   * Determine overall health status based on metrics.
   */
  private calculateHealthStatus(
    observations: StatusSummary["observations"],
    analysis: StatusSummary["analysis"],
    issues: string[]
  ): "READY" | "WARNING" | "ERROR" {
    // ERROR if there are load failures
    if (issues.length > 0) return "ERROR";

    // ERROR if there's a persistent analysis error
    if (analysis.lastError) return "ERROR";

    // WARNING if analysis has never run
    if (!analysis.lastRun) return "WARNING";

    // WARNING if there are pending observations awaiting review
    if (observations.pending > 10) return "WARNING";

    return "READY";
  }
}
