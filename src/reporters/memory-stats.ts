/**
 * Memory Statistics Reporter
 *
 * Calculates and reports statistics about the memory hierarchy:
 * - Counts at each level (observations, long-term, core)
 * - Category distribution across observations
 * - Memory age distribution
 * - Top patterns by frequency
 *
 * Used by the `sanj status` command and `--verbose` output.
 *
 * @module reporters/memory-stats
 */

import { ObservationStore } from "../storage/observation-store.ts";
import { MemoryStore } from "../storage/memory-store.ts";
import type { Observation } from "../core/types.ts";

/**
 * Category distribution entry.
 */
export interface CategoryStats {
  category: string;
  count: number;
  percentage: number;
}

/**
 * Top pattern entry ranked by observation count.
 */
export interface TopPattern {
  text: string;
  category?: string;
  count: number;
  status: string;
  firstSeen: Date;
}

/**
 * Age distribution bucket.
 */
export interface AgeBucket {
  label: string;
  count: number;
}

/**
 * Complete memory statistics report.
 */
export interface MemoryStatsReport {
  /** Counts at each memory level */
  levelCounts: {
    observations: number;
    longTerm: number;
    core: number;
  };
  /** Category distribution of observations */
  categoryDistribution: CategoryStats[];
  /** Top N patterns ranked by count */
  topPatterns: TopPattern[];
  /** Age distribution of observations */
  ageDistribution: AgeBucket[];
  /** Observations by status */
  statusCounts: Record<string, number>;
  /** Report generation timestamp */
  generatedAt: Date;
}

/**
 * MemoryStatsReporter calculates statistics across the memory hierarchy.
 *
 * Provides aggregate metrics for status reporting and verbose output.
 */
export class MemoryStatsReporter {
  private observationStore: ObservationStore;
  private memoryStore: MemoryStore;

  constructor(observationStorePath?: string, memoryStorePath?: string) {
    this.observationStore = new ObservationStore(observationStorePath);
    this.memoryStore = new MemoryStore(memoryStorePath);
  }

  /**
   * Generate a complete memory statistics report.
   *
   * @param topN - Number of top patterns to include (default: 5)
   * @returns Complete statistics report
   */
  async getStats(topN: number = 5): Promise<MemoryStatsReport> {
    // Load stores
    await this.observationStore.load();
    await this.memoryStore.load();

    const observations = await this.observationStore.getAll();
    const memoryCounts = await this.memoryStore.getCounts();

    // Level counts
    const levelCounts = {
      observations: observations.length,
      longTerm: memoryCounts.longTerm,
      core: memoryCounts.core,
    };

    // Category distribution
    const categoryDistribution = this.calculateCategoryDistribution(observations);

    // Top patterns
    const topPatterns = this.calculateTopPatterns(observations, topN);

    // Age distribution
    const ageDistribution = this.calculateAgeDistribution(observations);

    // Status counts
    const statusCounts = this.calculateStatusCounts(observations);

    return {
      levelCounts,
      categoryDistribution,
      topPatterns,
      ageDistribution,
      statusCounts,
      generatedAt: new Date(),
    };
  }

  /**
   * Calculate category distribution across all observations.
   */
  private calculateCategoryDistribution(
    observations: Observation[]
  ): CategoryStats[] {
    const categoryMap = new Map<string, number>();

    for (const obs of observations) {
      const cat = obs.category || "uncategorized";
      categoryMap.set(cat, (categoryMap.get(cat) || 0) + 1);
    }

    const total = observations.length || 1; // Avoid division by zero
    const stats: CategoryStats[] = [];

    for (const [category, count] of categoryMap.entries()) {
      stats.push({
        category,
        count,
        percentage: Math.round((count / total) * 100),
      });
    }

    // Sort by count descending
    stats.sort((a, b) => b.count - a.count);

    return stats;
  }

  /**
   * Get top N patterns ranked by observation count.
   */
  private calculateTopPatterns(
    observations: Observation[],
    n: number
  ): TopPattern[] {
    const sorted = [...observations].sort((a, b) => b.count - a.count);

    return sorted.slice(0, n).map((obs) => ({
      text: obs.text.length > 100 ? obs.text.slice(0, 97) + "..." : obs.text,
      category: obs.category,
      count: obs.count,
      status: obs.status,
      firstSeen: obs.firstSeen,
    }));
  }

  /**
   * Calculate age distribution of observations into time buckets.
   *
   * Buckets: Today, This Week, This Month, Older
   */
  private calculateAgeDistribution(observations: Observation[]): AgeBucket[] {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    let today = 0;
    let thisWeek = 0;
    let thisMonth = 0;
    let older = 0;

    for (const obs of observations) {
      if (obs.firstSeen >= oneDayAgo) {
        today++;
      } else if (obs.firstSeen >= oneWeekAgo) {
        thisWeek++;
      } else if (obs.firstSeen >= oneMonthAgo) {
        thisMonth++;
      } else {
        older++;
      }
    }

    return [
      { label: "Today", count: today },
      { label: "This Week", count: thisWeek },
      { label: "This Month", count: thisMonth },
      { label: "Older", count: older },
    ];
  }

  /**
   * Calculate observation counts grouped by status.
   */
  private calculateStatusCounts(
    observations: Observation[]
  ): Record<string, number> {
    const counts: Record<string, number> = {};

    for (const obs of observations) {
      counts[obs.status] = (counts[obs.status] || 0) + 1;
    }

    return counts;
  }
}
