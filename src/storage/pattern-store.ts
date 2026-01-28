/**
 * Pattern Store Implementation
 *
 * Persists and retrieves aggregated patterns (observations) extracted from
 * session analysis. Supports filtering by category/type and automatic
 * expiration of stale patterns.
 *
 * Storage strategy:
 * - In-memory Map for fast lookups
 * - Atomic writes to disk using temp file + rename
 * - All date fields properly serialized/deserialized
 *
 * Expiration:
 * - Patterns older than `expirationDays` (default 30) since lastSeen
 *   are considered expired and excluded from queries by default.
 * - Call `purgeExpired()` to physically remove expired patterns.
 *
 * @module storage/pattern-store
 */

import { existsSync, mkdirSync, renameSync, unlinkSync } from "fs";
import type { Observation } from "../core/types.ts";
import { SanjError, ErrorCode } from "../core/types.ts";
import { PATTERNS_PATH, SANJ_HOME } from "./paths.ts";
import type { PaginationOptions, SortOptions } from "./interfaces.ts";

// =============================================================================
// Query Options
// =============================================================================

/**
 * Filter options for pattern queries.
 */
export interface PatternQueryOptions {
  /** Filter by observation category (e.g., 'pattern', 'workflow', 'preference') */
  category?: Observation["category"] | Observation["category"][];

  /** Filter by date range on lastSeen */
  dateRange?: {
    start?: Date;
    end?: Date;
  };

  /** Filter by minimum count (frequency threshold) */
  minCount?: number;

  /** Filter by tags (OR logic - matches if any tag matches) */
  tags?: string[];

  /** Filter by source session IDs (OR logic) */
  sessionIds?: string[];

  /** Whether to include expired patterns. Defaults to false. */
  includeExpired?: boolean;
}

// =============================================================================
// Serialization Types
// =============================================================================

/**
 * Serialized pattern format for disk storage.
 * All Date objects are converted to ISO 8601 strings.
 */
interface SerializedPattern {
  id: string;
  text: string;
  category?: Observation["category"];
  count: number;
  status: Observation["status"];
  sourceSessionIds: string[];
  firstSeen: string;
  lastSeen: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

/**
 * Storage file format for patterns.
 */
interface PatternsFile {
  version: number;
  patterns: SerializedPattern[];
}

// =============================================================================
// Serialization Helpers
// =============================================================================

function serializePattern(obs: Observation): SerializedPattern {
  return {
    id: obs.id,
    text: obs.text,
    category: obs.category,
    count: obs.count,
    status: obs.status,
    sourceSessionIds: obs.sourceSessionIds,
    firstSeen: obs.firstSeen.toISOString(),
    lastSeen: obs.lastSeen.toISOString(),
    tags: obs.tags,
    metadata: obs.metadata,
  };
}

function deserializePattern(serialized: SerializedPattern): Observation {
  return {
    id: serialized.id,
    text: serialized.text,
    category: serialized.category,
    count: serialized.count,
    status: serialized.status,
    sourceSessionIds: serialized.sourceSessionIds,
    firstSeen: new Date(serialized.firstSeen),
    lastSeen: new Date(serialized.lastSeen),
    tags: serialized.tags,
    metadata: serialized.metadata,
  };
}

// =============================================================================
// FilePatternStore
// =============================================================================

/**
 * File-based pattern store.
 *
 * Stores aggregated patterns from the PatternAggregationService and provides
 * query capabilities with category filtering and expiration logic.
 *
 * @example
 * ```typescript
 * const store = new FilePatternStore();
 * await store.load();
 *
 * // Save patterns from aggregation
 * await store.savePatterns(aggregationResult.observations);
 *
 * // Query with filters
 * const workflows = await store.query({ category: 'workflow', minCount: 3 });
 *
 * // Remove stale patterns
 * const purged = await store.purgeExpired();
 * ```
 */
export class FilePatternStore {
  /** In-memory cache: pattern ID → Observation */
  private patterns: Map<string, Observation> = new Map();

  /** Path to the storage file */
  private readonly storagePath: string;

  /** Number of days after lastSeen before a pattern is considered expired */
  private readonly expirationDays: number;

  /**
   * Create a new FilePatternStore.
   *
   * @param storagePath - Optional custom path (defaults to PATTERNS_PATH, useful for testing)
   * @param expirationDays - Days until pattern expires (default 30)
   */
  constructor(storagePath?: string, expirationDays?: number) {
    this.storagePath = storagePath || PATTERNS_PATH;
    this.expirationDays = expirationDays ?? 30;
  }

  // ===========================================================================
  // Lifecycle Methods
  // ===========================================================================

  /**
   * Load patterns from disk into memory.
   * Handles missing file gracefully (initializes empty store).
   *
   * @throws {SanjError} If file is corrupted or inaccessible
   */
  async load(): Promise<void> {
    try {
      if (!existsSync(this.storagePath)) {
        this.patterns.clear();
        return;
      }

      const file = Bun.file(this.storagePath);
      const text = await file.text();
      const data = JSON.parse(text) as PatternsFile;

      this.patterns.clear();
      for (const serialized of data.patterns) {
        const pattern = deserializePattern(serialized);
        this.patterns.set(pattern.id, pattern);
      }
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new SanjError(
          "Failed to parse patterns.json: Invalid JSON format",
          ErrorCode.OBSERVATION_STORE_FAILED,
          { path: this.storagePath, error: error.message }
        );
      }
      throw new SanjError(
        `Failed to load patterns: ${error instanceof Error ? error.message : String(error)}`,
        ErrorCode.OBSERVATION_STORE_FAILED,
        { path: this.storagePath }
      );
    }
  }

  /**
   * Persist current in-memory state to disk using atomic write.
   *
   * @throws {SanjError} If write fails
   */
  async save(): Promise<void> {
    const parentDir =
      this.storagePath.substring(0, this.storagePath.lastIndexOf("/")) ||
      SANJ_HOME;

    if (!existsSync(parentDir)) {
      mkdirSync(parentDir, { recursive: true });
    }

    const serialized: SerializedPattern[] = [];
    for (const pattern of this.patterns.values()) {
      serialized.push(serializePattern(pattern));
    }

    const data: PatternsFile = {
      version: 1,
      patterns: serialized,
    };

    const tempPath = `${this.storagePath}.tmp`;

    try {
      await Bun.write(tempPath, JSON.stringify(data, null, 2));
      renameSync(tempPath, this.storagePath);
    } catch (error) {
      if (existsSync(tempPath)) {
        try {
          unlinkSync(tempPath);
        } catch {
          // Ignore cleanup errors
        }
      }
      throw new SanjError(
        `Failed to save patterns: ${error instanceof Error ? error.message : String(error)}`,
        ErrorCode.FILE_WRITE_FAILED,
        { path: this.storagePath }
      );
    }
  }

  /**
   * Get total number of patterns in the store.
   */
  async count(): Promise<number> {
    return this.patterns.size;
  }

  /**
   * Clear all patterns from the store.
   */
  async clear(): Promise<void> {
    this.patterns.clear();
    await this.save();
  }

  // ===========================================================================
  // Write Operations
  // ===========================================================================

  /**
   * Save a single pattern. If a pattern with the same ID exists, it is replaced.
   *
   * @param pattern - Pattern (Observation) to save
   * @returns The saved pattern
   */
  async savePattern(pattern: Observation): Promise<Observation> {
    this.patterns.set(pattern.id, pattern);
    await this.save();
    return pattern;
  }

  /**
   * Save multiple patterns in a single operation.
   * Existing patterns with matching IDs are replaced.
   *
   * @param patterns - Array of patterns to save
   * @returns The saved patterns
   */
  async savePatterns(patterns: Observation[]): Promise<Observation[]> {
    for (const pattern of patterns) {
      this.patterns.set(pattern.id, pattern);
    }
    await this.save();
    return patterns;
  }

  // ===========================================================================
  // Read Operations
  // ===========================================================================

  /**
   * Get a pattern by its ID.
   *
   * @param id - Pattern identifier
   * @returns Pattern if found, null otherwise
   */
  async getById(id: string): Promise<Observation | null> {
    return this.patterns.get(id) || null;
  }

  /**
   * Get all patterns (optionally excluding expired ones).
   *
   * @param includeExpired - Whether to include expired patterns (default: false)
   * @returns Array of patterns
   */
  async getAll(includeExpired: boolean = false): Promise<Observation[]> {
    const all = Array.from(this.patterns.values());
    if (includeExpired) return all;
    return all.filter((p) => !this.isExpired(p));
  }

  /**
   * Query patterns with flexible filtering.
   * All filters are ANDed together. Expired patterns are excluded by default.
   *
   * @param options - Query filter options
   * @param pagination - Optional pagination (offset + limit)
   * @param sort - Optional sort order
   * @returns Matching patterns
   */
  async query(
    options: PatternQueryOptions = {},
    pagination?: PaginationOptions,
    sort?: SortOptions<Observation>
  ): Promise<Observation[]> {
    let results = Array.from(this.patterns.values());

    // Exclude expired unless explicitly included
    if (!options.includeExpired) {
      results = results.filter((p) => !this.isExpired(p));
    }

    // Filter by category
    if (options.category !== undefined) {
      const categories = Array.isArray(options.category)
        ? options.category
        : [options.category];
      results = results.filter(
        (p) => p.category !== undefined && categories.includes(p.category)
      );
    }

    // Filter by date range on lastSeen
    if (options.dateRange) {
      const { start, end } = options.dateRange;
      results = results.filter((p) => {
        if (start && p.lastSeen < start) return false;
        if (end && p.lastSeen > end) return false;
        return true;
      });
    }

    // Filter by minimum count
    if (options.minCount !== undefined) {
      results = results.filter((p) => p.count >= options.minCount!);
    }

    // Filter by tags (OR logic)
    if (options.tags && options.tags.length > 0) {
      results = results.filter(
        (p) => p.tags && p.tags.some((tag) => options.tags!.includes(tag))
      );
    }

    // Filter by session IDs (OR logic)
    if (options.sessionIds && options.sessionIds.length > 0) {
      results = results.filter((p) =>
        p.sourceSessionIds.some((id) => options.sessionIds!.includes(id))
      );
    }

    // Apply sorting
    if (sort) {
      results.sort((a, b) => {
        const aValue = a[sort.field];
        const bValue = b[sort.field];

        if (aValue === undefined && bValue === undefined) return 0;
        if (aValue === undefined) return 1;
        if (bValue === undefined) return -1;

        let comparison = 0;
        if (aValue < bValue) comparison = -1;
        if (aValue > bValue) comparison = 1;

        return sort.direction === "asc" ? comparison : -comparison;
      });
    }

    // Apply pagination
    if (pagination) {
      results = results.slice(pagination.offset, pagination.offset + pagination.limit);
    }

    return results;
  }

  // ===========================================================================
  // Expiration Logic
  // ===========================================================================

  /**
   * Check if a pattern is expired based on lastSeen and expirationDays.
   *
   * @param pattern - Pattern to check
   * @returns true if expired
   */
  isExpired(pattern: Observation): boolean {
    const now = new Date();
    const daysSinceLastSeen =
      (now.getTime() - pattern.lastSeen.getTime()) / (1000 * 60 * 60 * 24);
    return daysSinceLastSeen > this.expirationDays;
  }

  /**
   * Get all expired patterns without removing them.
   *
   * @returns Array of expired patterns
   */
  async getExpired(): Promise<Observation[]> {
    return Array.from(this.patterns.values()).filter((p) => this.isExpired(p));
  }

  /**
   * Remove all expired patterns from the store and persist.
   *
   * @returns Number of patterns purged
   */
  async purgeExpired(): Promise<number> {
    let purged = 0;
    for (const [id, pattern] of this.patterns.entries()) {
      if (this.isExpired(pattern)) {
        this.patterns.delete(id);
        purged++;
      }
    }
    if (purged > 0) {
      await this.save();
    }
    return purged;
  }

  // ===========================================================================
  // Delete Operations
  // ===========================================================================

  /**
   * Delete a pattern by ID.
   *
   * @param id - Pattern identifier
   * @returns true if deleted, false if not found
   */
  async delete(id: string): Promise<boolean> {
    const existed = this.patterns.delete(id);
    if (existed) {
      await this.save();
    }
    return existed;
  }
}
