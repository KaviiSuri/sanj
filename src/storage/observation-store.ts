/**
 * Observation Store Implementation
 *
 * Manages the complete lifecycle of observations (extracted patterns):
 * - Creation from LLM extraction results
 * - Deduplication via semantic similarity checks
 * - Status transitions (pending → approved → promoted)
 * - Count tracking for promotion thresholds
 * - Query and filtering for TUI display
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
 * @module storage/observation-store
 */

import { existsSync, mkdirSync, renameSync, unlinkSync } from "fs";
import type { Observation } from "../core/types.ts";
import { SanjError, ErrorCode } from "../core/types.ts";
import type {
  IObservationStore,
  ObservationQueryOptions,
  PaginationOptions,
  SortOptions,
} from "./interfaces.ts";
import { OBSERVATIONS_PATH, SANJ_HOME } from "./paths.ts";

/**
 * Serialized observation format for disk storage.
 * All Date objects are converted to ISO 8601 strings.
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
 * Storage file format for observations.
 */
interface ObservationsFile {
  /** Schema version for future migrations */
  version: number;

  /** Array of serialized observations */
  observations: SerializedObservation[];
}

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
 * ObservationStore implementation using file-based storage.
 *
 * Features:
 * - In-memory Map for O(1) lookups
 * - Atomic writes using temp file + rename
 * - Comprehensive error handling
 * - All CRUD operations with proper type safety
 */
export class ObservationStore implements IObservationStore {
  /**
   * In-memory cache for fast lookups.
   * Key: observation ID
   * Value: observation object
   */
  private observations: Map<string, Observation> = new Map();

  /**
   * Path to the storage file.
   * Defaults to OBSERVATIONS_PATH but can be overridden for testing.
   */
  private readonly storagePath: string;

  /**
   * Create a new ObservationStore instance.
   *
   * @param storagePath - Optional custom storage path (for testing)
   */
  constructor(storagePath?: string) {
    this.storagePath = storagePath || OBSERVATIONS_PATH;
  }

  // ===========================================================================
  // Lifecycle Methods (IStore)
  // ===========================================================================

  /**
   * Load observations from disk into memory.
   * Called once during application startup or before first use.
   *
   * Handles missing file gracefully by initializing empty store.
   * Throws error if file exists but contains invalid JSON.
   *
   * @throws {SanjError} If storage file is corrupted or inaccessible
   */
  async load(): Promise<void> {
    try {
      // Handle missing file gracefully - initialize empty store
      if (!existsSync(this.storagePath)) {
        this.observations.clear();
        return;
      }

      // Read file using Bun's native API
      const file = Bun.file(this.storagePath);
      const text = await file.text();

      // Parse JSON
      const data = JSON.parse(text) as ObservationsFile;

      // Deserialize all observations
      this.observations.clear();
      for (const serialized of data.observations) {
        const observation = deserializeObservation(serialized);
        this.observations.set(observation.id, observation);
      }
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new SanjError(
          `Failed to parse observations.json: Invalid JSON format`,
          ErrorCode.OBSERVATION_STORE_FAILED,
          { path: this.storagePath, error: error.message }
        );
      }

      throw new SanjError(
        `Failed to load observations: ${error instanceof Error ? error.message : String(error)}`,
        ErrorCode.OBSERVATION_STORE_FAILED,
        { path: this.storagePath }
      );
    }
  }

  /**
   * Persist current state to storage using atomic write pattern.
   *
   * Uses temp file + rename to ensure data integrity.
   * Creates parent directory if it doesn't exist.
   *
   * @throws {SanjError} If write operation fails
   */
  async save(): Promise<void> {
    const parentDir = this.storagePath.substring(0, this.storagePath.lastIndexOf("/")) || SANJ_HOME;

    // Ensure parent directory exists
    if (!existsSync(parentDir)) {
      mkdirSync(parentDir, { recursive: true });
    }

    // Serialize all observations
    const serialized: SerializedObservation[] = [];
    for (const observation of this.observations.values()) {
      serialized.push(serializeObservation(observation));
    }

    const data: ObservationsFile = {
      version: 1,
      observations: serialized,
    };

    // Create temporary file path
    const tempPath = `${this.storagePath}.tmp`;

    try {
      // Write to temporary file
      const jsonContent = JSON.stringify(data, null, 2);
      await Bun.write(tempPath, jsonContent);

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
        `Failed to save observations: ${error instanceof Error ? error.message : String(error)}`,
        ErrorCode.OBSERVATION_STORE_FAILED,
        { path: this.storagePath }
      );
    }
  }

  /**
   * Get count of all observations in the store.
   *
   * @returns Number of observations
   */
  async count(): Promise<number> {
    return this.observations.size;
  }

  /**
   * Clear all observations from the store.
   * Use with caution - primarily for testing or reset operations.
   */
  async clear(): Promise<void> {
    this.observations.clear();
    await this.save();
  }

  // ===========================================================================
  // Create Operations
  // ===========================================================================

  /**
   * Create a new observation.
   * Auto-generates ID and sets firstSeen/lastSeen timestamps.
   *
   * @param observation - Observation data (omit id, firstSeen, lastSeen)
   * @returns Created observation with generated ID
   */
  async create(
    observation: Omit<Observation, "id" | "firstSeen" | "lastSeen">
  ): Promise<Observation> {
    const now = new Date();
    const newObservation: Observation = {
      ...observation,
      id: crypto.randomUUID(),
      firstSeen: now,
      lastSeen: now,
    };

    this.observations.set(newObservation.id, newObservation);
    await this.save();

    return newObservation;
  }

  /**
   * Create multiple observations in a single operation.
   * More efficient than individual creates for batch imports.
   *
   * @param observations - Array of observation data
   * @returns Array of created observations with generated IDs
   */
  async bulkCreate(
    observations: Array<Omit<Observation, "id" | "firstSeen" | "lastSeen">>
  ): Promise<Observation[]> {
    const now = new Date();
    const created: Observation[] = [];

    for (const obs of observations) {
      const newObservation: Observation = {
        ...obs,
        id: crypto.randomUUID(),
        firstSeen: now,
        lastSeen: now,
      };

      this.observations.set(newObservation.id, newObservation);
      created.push(newObservation);
    }

    await this.save();
    return created;
  }

  // ===========================================================================
  // Read Operations
  // ===========================================================================

  /**
   * Retrieve a single observation by ID.
   *
   * @param id - Observation identifier
   * @returns Observation if found, null otherwise
   */
  async getById(id: string): Promise<Observation | null> {
    return this.observations.get(id) || null;
  }

  /**
   * Get all observations.
   * Consider using query() with pagination for better performance on large datasets.
   *
   * @returns All observations
   */
  async getAll(): Promise<Observation[]> {
    return Array.from(this.observations.values());
  }

  /**
   * Get all observations awaiting user review.
   * Shortcut for query({ status: 'pending' }).
   *
   * @returns Pending observations
   */
  async getPending(): Promise<Observation[]> {
    return this.getByStatus("pending");
  }

  /**
   * Get all approved observations.
   * Shortcut for query({ status: 'approved' }).
   *
   * @returns Approved observations
   */
  async getApproved(): Promise<Observation[]> {
    return this.getByStatus("approved");
  }

  /**
   * Get all denied observations.
   * Shortcut for query({ status: 'denied' }).
   *
   * @returns Denied observations
   */
  async getDenied(): Promise<Observation[]> {
    return this.getByStatus("denied");
  }

  /**
   * Get observations by status.
   *
   * @param status - Lifecycle status to filter by
   * @returns Observations matching status
   */
  async getByStatus(status: Observation["status"]): Promise<Observation[]> {
    const results: Observation[] = [];
    for (const obs of this.observations.values()) {
      if (obs.status === status) {
        results.push(obs);
      }
    }
    return results;
  }

  /**
   * Query observations with flexible filtering.
   * All filters are ANDed together.
   *
   * @param options - Query filters
   * @param pagination - Optional pagination
   * @param sort - Optional sort order
   * @returns Matching observations
   */
  async query(
    options: ObservationQueryOptions,
    pagination?: PaginationOptions,
    sort?: SortOptions<Observation>
  ): Promise<Observation[]> {
    let results = Array.from(this.observations.values());

    // Apply filters
    results = results.filter((obs) => {
      // Filter by status
      if (options.status !== undefined) {
        const statuses = Array.isArray(options.status) ? options.status : [options.status];
        if (!statuses.includes(obs.status)) {
          return false;
        }
      }

      // Filter by date range
      if (options.dateRange) {
        const { start, end, field = "lastSeen" } = options.dateRange;
        const dateToCheck = obs[field];

        if (start && dateToCheck < start) {
          return false;
        }
        if (end && dateToCheck > end) {
          return false;
        }
      }

      // Filter by minimum count
      if (options.countThreshold !== undefined && obs.count < options.countThreshold) {
        return false;
      }

      // Filter by category
      if (options.category !== undefined && obs.category !== options.category) {
        return false;
      }

      // Filter by tags (OR logic - matches if any tag matches)
      if (options.tags && options.tags.length > 0) {
        if (!obs.tags || !obs.tags.some((tag) => options.tags!.includes(tag))) {
          return false;
        }
      }

      // Filter by session source (OR logic - matches if any session matches)
      if (options.sessionIds && options.sessionIds.length > 0) {
        if (!obs.sourceSessionIds.some((id) => options.sessionIds!.includes(id))) {
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
   * Execute custom filter predicate on all observations.
   * Use query() with options when possible for better performance.
   *
   * @param predicate - Filter function
   * @returns Observations matching predicate
   */
  async filter(predicate: (obs: Observation) => boolean): Promise<Observation[]> {
    const results: Observation[] = [];
    for (const obs of this.observations.values()) {
      if (predicate(obs)) {
        results.push(obs);
      }
    }
    return results;
  }

  // ===========================================================================
  // Update Operations
  // ===========================================================================

  /**
   * Increment observation count (when pattern seen again).
   * Also updates lastSeen timestamp.
   *
   * @param id - Observation identifier
   * @param increment - Amount to increment (default: 1)
   * @returns Updated observation
   * @throws {SanjError} If observation not found
   */
  async incrementCount(id: string, increment: number = 1): Promise<Observation> {
    const observation = this.observations.get(id);
    if (!observation) {
      throw new SanjError(
        `Observation not found: ${id}`,
        ErrorCode.OBSERVATION_STORE_FAILED,
        { id }
      );
    }

    observation.count += increment;
    observation.lastSeen = new Date();

    await this.save();
    return observation;
  }

  /**
   * Update lastSeen timestamp to current time.
   *
   * @param id - Observation identifier
   * @returns Updated observation
   * @throws {SanjError} If observation not found
   */
  async updateLastSeen(id: string): Promise<Observation> {
    const observation = this.observations.get(id);
    if (!observation) {
      throw new SanjError(
        `Observation not found: ${id}`,
        ErrorCode.OBSERVATION_STORE_FAILED,
        { id }
      );
    }

    observation.lastSeen = new Date();

    await this.save();
    return observation;
  }

  /**
   * Change observation status (lifecycle transition).
   *
   * @param id - Observation identifier
   * @param status - New status
   * @returns Updated observation
   * @throws {SanjError} If observation not found
   */
  async setStatus(id: string, status: Observation["status"]): Promise<Observation> {
    const observation = this.observations.get(id);
    if (!observation) {
      throw new SanjError(
        `Observation not found: ${id}`,
        ErrorCode.OBSERVATION_STORE_FAILED,
        { id }
      );
    }

    observation.status = status;

    await this.save();
    return observation;
  }

  /**
   * Add a session reference to an observation.
   * Records that this session contributed to the pattern.
   * Prevents duplicate session IDs.
   *
   * @param id - Observation identifier
   * @param sessionId - Session that contributed to this observation
   * @returns Updated observation
   * @throws {SanjError} If observation not found
   */
  async addSessionRef(id: string, sessionId: string): Promise<Observation> {
    const observation = this.observations.get(id);
    if (!observation) {
      throw new SanjError(
        `Observation not found: ${id}`,
        ErrorCode.OBSERVATION_STORE_FAILED,
        { id }
      );
    }

    // Add session ID if not already present
    if (!observation.sourceSessionIds.includes(sessionId)) {
      observation.sourceSessionIds.push(sessionId);
      await this.save();
    }

    return observation;
  }

  /**
   * Partial update of observation fields.
   * Cannot update id, firstSeen, or lastSeen through this method.
   *
   * @param id - Observation identifier
   * @param partial - Fields to update
   * @returns Updated observation
   * @throws {SanjError} If observation not found
   */
  async update(id: string, partial: Partial<Observation>): Promise<Observation> {
    const observation = this.observations.get(id);
    if (!observation) {
      throw new SanjError(
        `Observation not found: ${id}`,
        ErrorCode.OBSERVATION_STORE_FAILED,
        { id }
      );
    }

    // Apply partial update (excluding protected fields)
    Object.assign(observation, {
      ...partial,
      id: observation.id, // Preserve ID
      firstSeen: observation.firstSeen, // Preserve firstSeen
    });

    await this.save();
    return observation;
  }

  /**
   * Batch update multiple observations.
   * More efficient than individual updates.
   *
   * @param updates - Array of update operations
   * @returns Updated observations
   * @throws {SanjError} If any observation not found
   */
  async bulkUpdate(
    updates: Array<{ id: string; partial: Partial<Observation> }>
  ): Promise<Observation[]> {
    const updated: Observation[] = [];

    // Validate all IDs exist first
    for (const { id } of updates) {
      if (!this.observations.has(id)) {
        throw new SanjError(
          `Observation not found: ${id}`,
          ErrorCode.OBSERVATION_STORE_FAILED,
          { id }
        );
      }
    }

    // Apply all updates
    for (const { id, partial } of updates) {
      const observation = this.observations.get(id)!;

      Object.assign(observation, {
        ...partial,
        id: observation.id, // Preserve ID
        firstSeen: observation.firstSeen, // Preserve firstSeen
      });

      updated.push(observation);
    }

    await this.save();
    return updated;
  }

  // ===========================================================================
  // Delete Operations
  // ===========================================================================

  /**
   * Delete a single observation by ID.
   *
   * @param id - Observation identifier
   * @returns true if deleted, false if not found
   */
  async delete(id: string): Promise<boolean> {
    const existed = this.observations.delete(id);
    if (existed) {
      await this.save();
    }
    return existed;
  }

  /**
   * Delete all observations with a given status.
   * Use with caution - typically used for cleanup operations.
   *
   * @param status - Status to delete
   * @returns Number of observations deleted
   */
  async deleteByStatus(status: Observation["status"]): Promise<number> {
    let deleted = 0;

    for (const [id, obs] of this.observations.entries()) {
      if (obs.status === status) {
        this.observations.delete(id);
        deleted++;
      }
    }

    if (deleted > 0) {
      await this.save();
    }

    return deleted;
  }

  // ===========================================================================
  // Special Operations
  // ===========================================================================

  /**
   * Find semantically similar observation.
   * Used for deduplication during pattern extraction.
   *
   * TODO: Integrate with LLMAdapter for semantic comparison.
   * Current implementation returns null (placeholder).
   *
   * Future implementation will:
   * - Delegate to LLMAdapter.checkSimilarity() for semantic comparison
   * - Return first match above similarity threshold (configured in Config)
   * - Compare observation text and category
   *
   * @param observation - Observation to find similar match for
   * @returns Similar observation if found, null otherwise
   */
  async findSimilar(observation: Observation): Promise<Observation | null> {
    // TODO: Integrate with LLMAdapter for semantic similarity checking
    // This is a placeholder that will be replaced with LLM-based comparison
    //
    // Example future implementation:
    // for (const existing of this.observations.values()) {
    //   if (existing.category === observation.category) {
    //     const similarity = await llmAdapter.checkSimilarity(
    //       observation.text,
    //       existing.text
    //     );
    //     if (similarity.isSimilar) {
    //       return existing;
    //     }
    //   }
    // }

    return null;
  }

  /**
   * Get observations that meet promotion thresholds.
   * Filters by approved status and count threshold from config.
   *
   * TODO: Load count threshold from Config once ConfigManager is implemented.
   * Current implementation filters by status='approved' only.
   *
   * Future implementation will also filter by:
   * - config.promotion.observationCountThreshold
   * - Optional time threshold (days since firstSeen)
   *
   * @returns Observations ready for promotion to long-term memory
   */
  async getPromotable(): Promise<Observation[]> {
    // TODO: Load threshold from Config
    // const config = await configManager.getConfig();
    // const threshold = config.promotion.observationCountThreshold;

    const results: Observation[] = [];
    for (const obs of this.observations.values()) {
      // Must be approved to be promotable
      if (obs.status === "approved") {
        // TODO: Add count threshold check once Config is available
        // if (obs.count >= threshold) {
        results.push(obs);
        // }
      }
    }

    return results;
  }
}
