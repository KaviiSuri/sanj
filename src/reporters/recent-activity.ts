/**
 * Recent Activity Reporter
 *
 * Generates human-readable reports of recent Sanj activity:
 * - Recently analyzed sessions
 * - Newly extracted observations
 * - Recent memory promotions
 *
 * Supports time-based filtering (24h, 7d, 30d) for focused views.
 *
 * @module reporters/recent-activity
 */

import { ObservationStore } from "../storage/observation-store.ts";
import type { Observation } from "../core/types.ts";

/**
 * Configuration for activity time windows.
 */
export interface TimeWindowConfig {
  /** Time window label (e.g., "24h", "7d", "30d") */
  label: string;
  /** Start date for the window */
  startDate: Date;
}

/**
 * A single recent activity item for display.
 */
export interface ActivityItem {
  /** Timestamp of the activity */
  timestamp: Date;
  /** Type of activity */
  type: "observation-created" | "observation-approved" | "observation-denied" | "observation-promoted";
  /** Brief description */
  description: string;
  /** Related observation category */
  category?: string;
}

/**
 * Complete recent activity report.
 */
export interface RecentActivityReport {
  /** Time window used for this report */
  timeWindow: TimeWindowConfig;
  /** Activity items sorted by timestamp (newest first) */
  items: ActivityItem[];
  /** Total count of new observations in window */
  newObservations: number;
  /** Total count of approved observations in window */
  approvedObservations: number;
  /** Total count of denied observations in window */
  deniedObservations: number;
  /** Total count of promoted observations in window */
  promotedObservations: number;
}

/**
 * Creates a TimeWindowConfig for a given number of days back from now.
 */
export function createTimeWindow(days: number): TimeWindowConfig {
  const labels: Record<number, string> = {
    1: "24h",
    7: "7d",
    30: "30d",
  };

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  return {
    label: labels[days] || `${days}d`,
    startDate,
  };
}

/**
 * RecentActivityReporter generates activity reports from observation data.
 *
 * Scans observations for recent changes based on timestamps
 * and aggregates them into a structured report.
 */
export class RecentActivityReporter {
  private observationStore: ObservationStore;

  constructor(observationStorePath?: string) {
    this.observationStore = new ObservationStore(observationStorePath);
  }

  /**
   * Generate a recent activity report for the given time window.
   *
   * @param timeWindow - Time window configuration (defaults to 7 days)
   * @returns Structured activity report
   */
  async getRecentActivity(
    timeWindow?: TimeWindowConfig
  ): Promise<RecentActivityReport> {
    const window = timeWindow || createTimeWindow(7);

    await this.observationStore.load();
    const allObservations = await this.observationStore.getAll();

    const items: ActivityItem[] = [];
    let newObservations = 0;
    let approvedObservations = 0;
    let deniedObservations = 0;
    let promotedObservations = 0;

    for (const obs of allObservations) {
      // Check if observation was created within the window
      if (obs.firstSeen >= window.startDate) {
        newObservations++;
        items.push({
          timestamp: obs.firstSeen,
          type: "observation-created",
          description: this.truncateText(obs.text, 80),
          category: obs.category,
        });
      }

      // Check for status-based activities within the window
      // We use lastSeen as a proxy for when the status changed
      if (obs.lastSeen >= window.startDate) {
        switch (obs.status) {
          case "approved":
            approvedObservations++;
            items.push({
              timestamp: obs.lastSeen,
              type: "observation-approved",
              description: `Approved: ${this.truncateText(obs.text, 60)}`,
              category: obs.category,
            });
            break;
          case "denied":
            deniedObservations++;
            items.push({
              timestamp: obs.lastSeen,
              type: "observation-denied",
              description: `Denied: ${this.truncateText(obs.text, 60)}`,
              category: obs.category,
            });
            break;
          case "promoted-to-long-term":
          case "promoted-to-core":
            promotedObservations++;
            items.push({
              timestamp: obs.lastSeen,
              type: "observation-promoted",
              description: `Promoted: ${this.truncateText(obs.text, 60)}`,
              category: obs.category,
            });
            break;
        }
      }
    }

    // Sort by timestamp descending (newest first)
    items.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    return {
      timeWindow: window,
      items,
      newObservations,
      approvedObservations,
      deniedObservations,
      promotedObservations,
    };
  }

  /**
   * Get recent observations sorted by lastSeen.
   *
   * @param limit - Maximum number of observations to return
   * @param timeWindow - Optional time window filter
   * @returns Array of recent observations
   */
  async getRecentObservations(
    limit: number = 10,
    timeWindow?: TimeWindowConfig
  ): Promise<Observation[]> {
    const window = timeWindow || createTimeWindow(30);

    await this.observationStore.load();
    const all = await this.observationStore.getAll();

    return all
      .filter((obs) => obs.lastSeen >= window.startDate)
      .sort((a, b) => b.lastSeen.getTime() - a.lastSeen.getTime())
      .slice(0, limit);
  }

  /**
   * Truncate text to a maximum length with ellipsis.
   */
  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength - 3) + "...";
  }
}
