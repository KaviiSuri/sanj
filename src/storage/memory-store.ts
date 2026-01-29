/**
 * Memory Store Implementation
 *
 * Manages the memory hierarchy and promotion lifecycle:
 * 1. Observation (pending review) → managed by ObservationStore
 * 2. Long-Term Memory (approved, frequently seen) → managed here
 * 3. Core Memory (written to CLAUDE.md / AGENTS.md) → managed by adapters
 *
 * Promotion logic:
 * - Observation → Long-Term: User approves + observation exists
 * - Long-Term → Core: User approves + meets count + time thresholds
 *
 * Storage strategy:
 * - In-memory Map for fast lookups
 * - Periodic saves to disk using atomic write pattern
 * - All date fields properly serialized/deserialized
 *
 * Thread safety:
 * - All operations are atomic within a single process
 * - Uses temp file + rename for data integrity
 *
 * @module storage/memory-store
 */

import { existsSync, mkdirSync, renameSync, unlinkSync } from "fs";
import type { LongTermMemory, Observation } from "../core/types.ts";
import { SanjError, ErrorCode } from "../core/types.ts";
import type {
  IMemoryStore,
  MemoryQueryOptions,
  PaginationOptions,
  PromotionResult,
  SortOptions,
} from "./interfaces.ts";
import { LONG_TERM_MEMORY_PATH, SANJ_HOME } from "./paths.ts";

/**
 * Serialized long-term memory format for disk storage.
 * All Date objects are converted to ISO 8601 strings.
 */
interface SerializedLongTermMemory {
  id: string;
  observation: SerializedObservation;
  promotedAt: string;
  status: LongTermMemory["status"];
}

/**
 * Serialized observation within long-term memory.
 */
interface SerializedObservation {
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
 * Storage file format for long-term memories.
 */
interface MemoryFile {
  /** Schema version for future migrations */
  version: number;

  /** Array of serialized long-term memories */
  memories: SerializedLongTermMemory[];
}

/**
 * Hardcoded promotion thresholds.
 * TODO: Load from Config once ConfigManager is implemented.
 */
const PROMOTION_THRESHOLDS = {
  /** Minimum observation count for core promotion */
  observationCountThreshold: 3,

  /** Minimum days in long-term memory for core promotion */
  longTermDaysThreshold: 7,
};

/**
 * Converts runtime Observation to serialized format.
 *
 * @param obs - Runtime observation with Date objects
 * @returns Serialized observation with ISO strings
 */
function serializeObservation(obs: Observation): SerializedObservation {
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

/**
 * Converts serialized observation to runtime format.
 *
 * @param serialized - Serialized observation with ISO strings
 * @returns Runtime observation with Date objects
 */
function deserializeObservation(serialized: SerializedObservation): Observation {
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

/**
 * Converts runtime LongTermMemory to serialized format.
 *
 * @param memory - Runtime long-term memory with Date objects
 * @returns Serialized long-term memory with ISO strings
 */
function serializeMemory(memory: LongTermMemory): SerializedLongTermMemory {
  return {
    id: memory.id,
    observation: serializeObservation(memory.observation),
    promotedAt: memory.promotedAt.toISOString(),
    status: memory.status,
  };
}

/**
 * Converts serialized long-term memory to runtime format.
 *
 * @param serialized - Serialized long-term memory with ISO strings
 * @returns Runtime long-term memory with Date objects
 */
function deserializeMemory(serialized: SerializedLongTermMemory): LongTermMemory {
  return {
    id: serialized.id,
    observation: deserializeObservation(serialized.observation),
    promotedAt: new Date(serialized.promotedAt),
    status: serialized.status,
  };
}

/**
 * MemoryStore implementation using file-based storage.
 *
 * Features:
 * - In-memory Map for O(1) lookups
 * - Atomic writes using temp file + rename
 * - Comprehensive error handling
 * - Promotion validation and threshold checking
 */
export class MemoryStore implements IMemoryStore {
  /**
   * In-memory cache for fast lookups.
   * Key: long-term memory ID
   * Value: long-term memory object
   */
  private memories: Map<string, LongTermMemory> = new Map();

  /**
   * Path to the storage file.
   * Defaults to LONG_TERM_MEMORY_PATH but can be overridden for testing.
   */
  private readonly storagePath: string;

  /**
   * Optional observation store reference for validation.
   * Used by promoteToLongTerm() to verify observation exists and is approved.
   */
  private observationStore?: { getById: (id: string) => Promise<Observation | null> };

  /**
   * Create a new MemoryStore instance.
   *
   * @param storagePath - Optional custom storage path (for testing)
   * @param observationStore - Optional observation store for validation
   */
  constructor(
    storagePath?: string,
    observationStore?: { getById: (id: string) => Promise<Observation | null> }
  ) {
    this.storagePath = storagePath || LONG_TERM_MEMORY_PATH;
    this.observationStore = observationStore;
  }

  // ===========================================================================
  // Lifecycle Methods (IStore)
  // ===========================================================================

  /**
   * Load long-term memories from disk into memory.
   * Called once during application startup or before first use.
   *
   * Supports both legacy JSON format and new markdown format.
   * Handles missing file gracefully by initializing empty store.
   *
   * Markdown format:
   * ```
   * # Sanj Long-Term Memory
   * ## category
   * - observation text `#memoryId count`
   * ```
   *
   * @throws {SanjError} If storage file is corrupted or inaccessible
   */
  async load(): Promise<void> {
    try {
      // Handle missing file gracefully - initialize empty store
      if (!existsSync(this.storagePath)) {
        this.memories.clear();
        return;
      }

      // Read file using Bun's native API
      const file = Bun.file(this.storagePath);
      const text = await file.text();

      // Try parsing as markdown first (new format)
      if (text.startsWith("# Sanj Long-Term Memory")) {
        this.parseMarkdown(text);
        return;
      }

      // Fall back to legacy JSON format
      const data = JSON.parse(text) as MemoryFile;
      this.memories.clear();
      for (const serialized of data.memories) {
        const memory = deserializeMemory(serialized);
        this.memories.set(memory.id, memory);
      }
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new SanjError(
          `Failed to parse long-term-memory.md: Invalid format`,
          ErrorCode.OBSERVATION_STORE_FAILED,
          { path: this.storagePath, error: error.message }
        );
      }

      throw new SanjError(
        `Failed to load long-term memories: ${error instanceof Error ? error.message : String(error)}`,
        ErrorCode.OBSERVATION_STORE_FAILED,
        { path: this.storagePath }
      );
    }
  }

  /**
   * Parse markdown format into memories.
   * Format: `- observation text \`#memoryId count\``
   */
  private parseMarkdown(text: string): void {
    this.memories.clear();

    let currentCategory: Observation["category"] = "other";
    const lines = text.split("\n");

    // Regex to match: - text `#id count`
    const lineRegex = /^- (.+?) `#([a-f0-9-]+) (\d+)`$/;
    const categoryRegex = /^## (.+)$/;

    for (const line of lines) {
      const trimmed = line.trim();

      // Check for category header
      const categoryMatch = trimmed.match(categoryRegex);
      if (categoryMatch) {
        currentCategory = categoryMatch[1] as Observation["category"];
        continue;
      }

      // Check for memory line
      const memoryMatch = trimmed.match(lineRegex);
      if (memoryMatch) {
        const [, observationText, memoryId, countStr] = memoryMatch;
        const count = parseInt(countStr, 10);

        // Create minimal observation
        const observation: Observation = {
          id: `obs-${memoryId}`,
          text: observationText,
          category: currentCategory,
          count,
          status: "promoted-to-long-term",
          sourceSessionIds: [],
          firstSeen: new Date(),
          lastSeen: new Date(),
        };

        const memory: LongTermMemory = {
          id: memoryId,
          observation,
          promotedAt: new Date(),
          status: "approved",
        };

        this.memories.set(memory.id, memory);
      }
    }
  }

  /**
   * Persist current state to storage as markdown.
   *
   * Format:
   * ```markdown
   * # Sanj Long-Term Memory
   *
   * ## workflow
   * - observation text `#memoryId count`
   *
   * ## preference
   * - another observation `#memoryId count`
   * ```
   *
   * Uses temp file + rename to ensure data integrity.
   * Creates parent directory if it doesn't exist.
   *
   * @throws {SanjError} If write operation fails
   */
  async save(): Promise<void> {
    const parentDir =
      this.storagePath.substring(0, this.storagePath.lastIndexOf("/")) || SANJ_HOME;

    // Ensure parent directory exists
    if (!existsSync(parentDir)) {
      mkdirSync(parentDir, { recursive: true });
    }

    // Group memories by category
    const byCategory = new Map<string, LongTermMemory[]>();
    for (const memory of this.memories.values()) {
      const category = memory.observation.category || "other";
      if (!byCategory.has(category)) {
        byCategory.set(category, []);
      }
      byCategory.get(category)!.push(memory);
    }

    // Build markdown content
    const lines: string[] = ["# Sanj Long-Term Memory", ""];

    // Sort categories for consistent output
    const sortedCategories = Array.from(byCategory.keys()).sort();

    for (const category of sortedCategories) {
      const memories = byCategory.get(category)!;
      lines.push(`## ${category}`);

      // Sort by count descending (most frequent first)
      memories.sort((a, b) => b.observation.count - a.observation.count);

      for (const memory of memories) {
        // Format: - observation text `#memoryId count`
        lines.push(`- ${memory.observation.text} \`#${memory.id} ${memory.observation.count}\``);
      }

      lines.push("");
    }

    const markdownContent = lines.join("\n");

    // Create temporary file path
    const tempPath = `${this.storagePath}.tmp`;

    try {
      // Write to temporary file
      await Bun.write(tempPath, markdownContent);

      // Atomic rename (on most systems, this is atomic)
      renameSync(tempPath, this.storagePath);
    } catch (error) {
      // Clean up temp file if it exists
      if (existsSync(tempPath)) {
        try {
          unlinkSync(tempPath);
        } catch {
          // Ignore cleanup errors
        }
      }

      throw new SanjError(
        `Failed to save long-term memories: ${error instanceof Error ? error.message : String(error)}`,
        ErrorCode.OBSERVATION_STORE_FAILED,
        { path: this.storagePath }
      );
    }
  }

  /**
   * Get count of all long-term memories in the store.
   *
   * @returns Number of long-term memories
   */
  async count(): Promise<number> {
    return this.memories.size;
  }

  /**
   * Clear all memories from the store.
   * Use with caution - primarily for testing or reset operations.
   */
  async clear(): Promise<void> {
    this.memories.clear();
    await this.save();
  }

  // ===========================================================================
  // Create/Promotion Operations
  // ===========================================================================

  /**
   * Promote an observation to long-term memory.
   * Creates a new LongTermMemory entry with reference to the observation.
   *
   * Prerequisites:
   * - Observation must exist in ObservationStore (if observationStore provided)
   * - Observation must be approved (if observationStore provided)
   *
   * TODO: Integrate with ObservationStore for validation once dependency injection is set up.
   *
   * @param observationId - ID of observation to promote
   * @returns Promotion result with new memory ID if successful
   */
  async promoteToLongTerm(observationId: string): Promise<PromotionResult> {
    try {
      // Validate observation exists and is approved (if store available)
      let observation: Observation | null = null;
      if (this.observationStore) {
        observation = await this.observationStore.getById(observationId);

        if (!observation) {
          return {
            success: false,
            reason: `Observation not found: ${observationId}`,
          };
        }

        if (observation.status !== "approved") {
          return {
            success: false,
            reason: `Observation must be approved before promotion. Current status: ${observation.status}`,
          };
        }
      } else {
        // Placeholder: If no observation store, we can't validate
        // This should not happen in production but allows for testing
        return {
          success: false,
          reason: "Observation store not configured - cannot validate observation",
        };
      }

      // Create new long-term memory
      const memory: LongTermMemory = {
        id: crypto.randomUUID(),
        observation: observation,
        promotedAt: new Date(),
        status: "approved",
      };

      this.memories.set(memory.id, memory);
      await this.save();

      return {
        success: true,
        id: memory.id,
      };
    } catch (error) {
      return {
        success: false,
        reason: `Failed to promote to long-term: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Promote a long-term memory to core memory.
   * This is a placeholder - actual writing to CLAUDE.md/AGENTS.md is done by CoreMemoryAdapter.
   *
   * Prerequisites:
   * - Memory must exist
   * - Memory must meet time threshold (days in long-term)
   * - Memory observation must meet count threshold
   * - User must approve (handled by calling code)
   *
   * The actual file writing is delegated to external adapters because:
   * - Core memory files are user-facing and should be human-readable
   * - Adapters handle formatting and conflict resolution
   * - Store only tracks that promotion occurred
   *
   * TODO: Integrate with CoreMemoryAdapter once implemented.
   *
   * @param memoryId - ID of long-term memory to promote
   * @param targets - Which core memory files to write to
   * @returns Promotion result (always successful as this is a placeholder)
   */
  async promoteToCore(
    memoryId: string,
    targets: Array<"claude_md" | "agents_md">
  ): Promise<PromotionResult> {
    try {
      // Validate memory exists
      const memory = this.memories.get(memoryId);
      if (!memory) {
        return {
          success: false,
          reason: `Long-term memory not found: ${memoryId}`,
        };
      }

      // Check eligibility
      if (!this.isEligibleForCorePromotion(memory)) {
        const days = this.daysSinceLongTermPromotion(memory);
        const count = memory.observation.count;
        return {
          success: false,
          reason: `Memory not eligible for core promotion. Days: ${days}/${PROMOTION_THRESHOLDS.longTermDaysThreshold}, Count: ${count}/${PROMOTION_THRESHOLDS.observationCountThreshold}`,
        };
      }

      // Placeholder: Actual writing to CLAUDE.md/AGENTS.md will be done by CoreMemoryAdapter
      // For now, we just update the status to indicate it's scheduled for core promotion
      memory.status = "scheduled-for-core";
      await this.save();

      return {
        success: true,
        id: crypto.randomUUID(), // Placeholder core memory ID
      };
    } catch (error) {
      return {
        success: false,
        reason: `Failed to promote to core: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  // ===========================================================================
  // Read Operations
  // ===========================================================================

  /**
   * Get all long-term memories.
   *
   * @returns All long-term memories
   */
  async getAll(): Promise<LongTermMemory[]> {
    return Array.from(this.memories.values());
  }

  /**
   * Get a specific memory by ID.
   *
   * @param id - Memory identifier
   * @returns Memory if found, null otherwise
   */
  async getById(id: string): Promise<LongTermMemory | null> {
    return this.memories.get(id) || null;
  }

  /**
   * Query memories with flexible filtering.
   * All filters are ANDed together.
   *
   * @param options - Query filters
   * @param pagination - Optional pagination
   * @param sort - Optional sort order
   * @returns Matching memories
   */
  async query(
    options: MemoryQueryOptions,
    pagination?: PaginationOptions,
    sort?: SortOptions<LongTermMemory>
  ): Promise<LongTermMemory[]> {
    let results = Array.from(this.memories.values());

    // Apply filters
    results = results.filter((memory) => {
      // Filter by status
      if (options.status !== undefined) {
        const statuses = Array.isArray(options.status) ? options.status : [options.status];
        if (!statuses.includes(memory.status)) {
          return false;
        }
      }

      // Filter by promotion date range
      if (options.dateRange) {
        const { start, end } = options.dateRange;

        if (start && memory.promotedAt < start) {
          return false;
        }
        if (end && memory.promotedAt > end) {
          return false;
        }
      }

      // Filter by eligibility for core promotion
      if (options.eligibleForCore === true) {
        if (!this.isEligibleForCorePromotion(memory)) {
          return false;
        }
      }

      // Filter by minimum observation count
      if (options.minCount !== undefined && memory.observation.count < options.minCount) {
        return false;
      }

      // Filter by minimum days in long-term memory
      if (options.minDays !== undefined) {
        const days = this.daysSinceLongTermPromotion(memory);
        if (days < options.minDays) {
          return false;
        }
      }

      return true;
    });

    // Apply sorting
    if (sort) {
      results.sort((a, b) => {
        const aValue = a[sort.field];
        const bValue = b[sort.field];

        let comparison = 0;
        if (aValue < bValue) comparison = -1;
        if (aValue > bValue) comparison = 1;

        return sort.direction === "asc" ? comparison : -comparison;
      });
    }

    // Apply pagination
    if (pagination) {
      const { offset, limit } = pagination;
      results = results.slice(offset, offset + limit);
    }

    return results;
  }

  /**
   * Get memories ready for core promotion.
   * Filters by time threshold and count threshold from config.
   *
   * @returns Memories eligible for core promotion
   */
  async getPromotableToCore(): Promise<LongTermMemory[]> {
    const results: LongTermMemory[] = [];

    for (const memory of this.memories.values()) {
      if (this.isEligibleForCorePromotion(memory)) {
        results.push(memory);
      }
    }

    return results;
  }

  /**
   * Get count of memories at each level.
   *
   * Note: 'pending' count refers to observations that haven't been promoted yet.
   * This requires access to ObservationStore, so it returns 0 as a placeholder.
   *
   * TODO: Integrate with ObservationStore once dependency injection is set up.
   *
   * @returns Counts for pending, long-term, and core memories
   */
  async getCounts(): Promise<{
    pending: number;
    longTerm: number;
    core: number;
  }> {
    let longTerm = 0;
    let core = 0;

    for (const memory of this.memories.values()) {
      if (memory.status === "scheduled-for-core") {
        core++;
      } else {
        longTerm++;
      }
    }

    return {
      pending: 0, // Placeholder: would need ObservationStore to count pending observations
      longTerm,
      core,
    };
  }

  // ===========================================================================
  // Validation Operations
  // ===========================================================================

  /**
   * Check if a memory meets thresholds for core promotion.
   *
   * Checks:
   * - Observation count >= PROMOTION_THRESHOLDS.observationCountThreshold (3)
   * - Days in long-term >= PROMOTION_THRESHOLDS.longTermDaysThreshold (7)
   *
   * @param memory - Memory to check
   * @returns true if eligible, false otherwise
   */
  isEligibleForCorePromotion(memory: LongTermMemory): boolean {
    // Check observation count threshold
    if (memory.observation.count < PROMOTION_THRESHOLDS.observationCountThreshold) {
      return false;
    }

    // Check time threshold
    const days = this.daysSinceLongTermPromotion(memory);
    if (days < PROMOTION_THRESHOLDS.longTermDaysThreshold) {
      return false;
    }

    return true;
  }

  /**
   * Calculate days since promotion to long-term memory.
   *
   * @param memory - Memory to check
   * @returns Number of days in long-term memory (rounded down)
   */
  daysSinceLongTermPromotion(memory: LongTermMemory): number {
    const now = new Date();
    const diffMs = now.getTime() - memory.promotedAt.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    return diffDays;
  }

  // ===========================================================================
  // Update Operations
  // ===========================================================================

  /**
   * Update memory status.
   *
   * @param id - Memory identifier
   * @param status - New status
   * @returns Updated memory
   * @throws {SanjError} If memory not found
   */
  async setStatus(id: string, status: LongTermMemory["status"]): Promise<LongTermMemory> {
    const memory = this.memories.get(id);
    if (!memory) {
      throw new SanjError(
        `Long-term memory not found: ${id}`,
        ErrorCode.OBSERVATION_STORE_FAILED,
        { id }
      );
    }

    memory.status = status;
    await this.save();

    return memory;
  }

  /**
   * Delete a long-term memory.
   *
   * @param id - Memory identifier
   * @returns true if deleted, false if not found
   */
  async delete(id: string): Promise<boolean> {
    const existed = this.memories.delete(id);
    if (existed) {
      await this.save();
    }
    return existed;
  }
}
