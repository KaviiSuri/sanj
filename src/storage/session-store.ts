/**
 * Session Store Implementation
 *
 * Manages session metadata indexing and querying:
 * - Index sessions from SessionDiscoveryService
 * - Query sessions with flexible filtering
 * - Support sorting and pagination
 * - Calculate duration on-demand from timestamps
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
 * @module storage/session-store
 */

import { existsSync, mkdirSync, renameSync, unlinkSync } from "fs";
import type { Session } from "../core/types.ts";
import { SanjError, ErrorCode } from "../core/types.ts";
import type {
  ISessionStore,
  SessionQueryOptions,
  PaginationOptions,
  SortOptions,
} from "./interfaces.ts";
import { SESSIONS_PATH, SANJ_HOME } from "./paths.ts";

/**
 * Serialized session format for disk storage.
 * All Date objects are converted to ISO 8601 strings.
 */
interface SerializedSession {
  id: string;
  tool: Session["tool"];
  projectSlug?: string;
  createdAt: string;
  modifiedAt: string;
  path: string;
  messageCount: number;
}

/**
 * Storage file format for sessions.
 */
interface SessionsFile {
  /** Schema version for future migrations */
  version: number;

  /** Array of serialized sessions */
  sessions: SerializedSession[];
}

/**
 * Converts runtime Session to serialized format.
 *
 * @param session - Runtime session with Date objects
 * @returns Serialized session with ISO strings
 */
function serializeSession(session: Session): SerializedSession {
  return {
    id: session.id,
    tool: session.tool,
    projectSlug: session.projectSlug,
    createdAt: session.createdAt.toISOString(),
    modifiedAt: session.modifiedAt.toISOString(),
    path: session.path,
    messageCount: session.messageCount,
  };
}

/**
 * Converts serialized session to runtime format.
 *
 * @param serialized - Serialized session with ISO strings
 * @returns Runtime session with Date objects
 */
function deserializeSession(serialized: SerializedSession): Session {
  return {
    id: serialized.id,
    tool: serialized.tool,
    projectSlug: serialized.projectSlug,
    createdAt: new Date(serialized.createdAt),
    modifiedAt: new Date(serialized.modifiedAt),
    path: serialized.path,
    messageCount: serialized.messageCount,
  };
}

/**
 * Calculate session duration in milliseconds.
 *
 * @param session - Session with timestamps
 * @returns Duration in milliseconds
 */
function calculateDuration(session: Session): number {
  return session.modifiedAt.getTime() - session.createdAt.getTime();
}

/**
 * SessionStore implementation using file-based storage.
 *
 * Features:
 * - In-memory Map for O(1) lookups
 * - Atomic writes using temp file + rename
 * - Comprehensive error handling
 * - Full ISessionStore implementation
 * - Sorting by date and calculated duration
 * - Flexible query filtering
 */
export class SessionStore implements ISessionStore {
  /**
   * In-memory cache for fast lookups.
   * Key: session ID
   * Value: session object
   */
  private sessions: Map<string, Session> = new Map();

  /**
   * Path to storage file.
   * Defaults to SESSIONS_PATH but can be overridden for testing.
   */
  private readonly storagePath: string;

  /**
   * Create a new SessionStore instance.
   *
   * @param storagePath - Optional custom storage path (for testing)
   */
  constructor(storagePath?: string) {
    this.storagePath = storagePath || SESSIONS_PATH;
  }

  // ===========================================================================
  // Lifecycle Methods (IStore)
  // ===========================================================================

  /**
   * Load sessions from disk into memory.
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
        this.sessions.clear();
        return;
      }

      // Read file using Bun's native API
      const file = Bun.file(this.storagePath);
      const text = await file.text();

      // Parse JSON
      const data = JSON.parse(text) as SessionsFile;

      // Deserialize all sessions
      this.sessions.clear();
      for (const serialized of data.sessions) {
        const session = deserializeSession(serialized);
        this.sessions.set(session.id, session);
      }
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new SanjError(
          `Failed to parse sessions.json: Invalid JSON format`,
          ErrorCode.FILE_WRITE_FAILED,
          { path: this.storagePath, error: error.message }
        );
      }

      throw new SanjError(
        `Failed to load sessions: ${error instanceof Error ? error.message : String(error)}`,
        ErrorCode.FILE_WRITE_FAILED,
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

    // Serialize all sessions
    const serialized: SerializedSession[] = [];
    for (const session of this.sessions.values()) {
      serialized.push(serializeSession(session));
    }

    const data: SessionsFile = {
      version: 1,
      sessions: serialized,
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
        `Failed to save sessions: ${error instanceof Error ? error.message : String(error)}`,
        ErrorCode.FILE_WRITE_FAILED,
        { path: this.storagePath }
      );
    }
  }

  /**
   * Get count of all sessions in store.
   *
   * @returns Number of sessions
   */
  async count(): Promise<number> {
    return this.sessions.size;
  }

  /**
   * Clear all sessions from store.
   * Use with caution - primarily for testing or reset operations.
   */
  async clear(): Promise<void> {
    this.sessions.clear();
    await this.save();
  }

  // ===========================================================================
  // Index Operations (ISessionStore)
  // ===========================================================================

  /**
   * Index a session for faster querying.
   * Stores metadata only, not full conversation content.
   *
   * @param session - Session to index
   * @returns Indexed session
   */
  async index(session: Session): Promise<Session> {
    this.sessions.set(session.id, session);
    await this.save();
    return session;
  }

  /**
   * Bulk index multiple sessions.
   * More efficient than individual index calls.
   *
   * @param sessions - Sessions to index
   * @returns Indexed sessions
   */
  async bulkIndex(sessions: Session[]): Promise<Session[]> {
    for (const session of sessions) {
      this.sessions.set(session.id, session);
    }
    await this.save();
    return sessions;
  }

  // ===========================================================================
  // Read Operations
  // ===========================================================================

  /**
   * Get a session by ID.
   *
   * @param id - Session identifier
   * @returns Session if found, null otherwise
   */
  async getById(id: string): Promise<Session | null> {
    return this.sessions.get(id) || null;
  }

  /**
   * Get sessions modified since a timestamp.
   * Used for incremental analysis.
   *
   * @param since - Timestamp to filter by
   * @returns Sessions modified since timestamp
   */
  async getSince(since: Date): Promise<Session[]> {
    const results: Session[] = [];
    for (const session of this.sessions.values()) {
      if (session.modifiedAt >= since) {
        results.push(session);
      }
    }
    return results;
  }

  /**
   * Query sessions with flexible filtering.
   * All filters are ANDed together.
   *
   * Supports:
   * - Filter by tool type
   * - Filter by project slug
   * - Filter by date range (createdAt or modifiedAt)
   * - Filter by minimum message count
   * - Sort by any field (including calculated 'duration')
   * - Pagination for large result sets
   *
   * @param options - Query filters
   * @param pagination - Optional pagination
   * @param sort - Optional sort order (field can be 'duration' for calculated sorting)
   * @returns Matching sessions
   */
  async query(
    options: SessionQueryOptions,
    pagination?: PaginationOptions,
    sort?: SortOptions<Session>
  ): Promise<Session[]> {
    let results = Array.from(this.sessions.values());

    // Apply filters
    results = results.filter((session) => {
      // Filter by tool type
      if (options.tool !== undefined && session.tool !== options.tool) {
        return false;
      }

      // Filter by project slug
      if (options.projectSlug !== undefined && session.projectSlug !== options.projectSlug) {
        return false;
      }

      // Filter by date range
      if (options.dateRange) {
        const { start, end, field = "createdAt" } = options.dateRange;
        const dateToCheck = session[field];

        if (start && dateToCheck < start) {
          return false;
        }
        if (end && dateToCheck > end) {
          return false;
        }
      }

      // Filter by minimum message count
      if (options.minMessages !== undefined && session.messageCount < options.minMessages) {
        return false;
      }

      return true;
    });

    // Apply sorting
    if (sort) {
      results.sort((a, b) => {
        // Handle 'duration' special field (not in Session type)
        const sortField = sort.field as string;
        if (sortField === "duration") {
          const aDuration = calculateDuration(a);
          const bDuration = calculateDuration(b);

          let comparison = 0;
          if (aDuration < bDuration) comparison = -1;
          if (aDuration > bDuration) comparison = 1;

          return sort.direction === "asc" ? comparison : -comparison;
        }

        // Handle regular fields
        const field = sort.field as keyof Session;
        const aValue = a[field];
        const bValue = b[field];

        // Handle undefined values (optional fields like projectSlug)
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
      const { offset, limit } = pagination;
      results = results.slice(offset, offset + limit);
    }

    return results;
  }

  // ===========================================================================
  // Update Operations
  // ===========================================================================

  /**
   * Update session metadata.
   * Used when re-scanning sessions after modification.
   *
   * @param id - Session identifier
   * @param partial - Fields to update
   * @returns Updated session
   * @throws {SanjError} If session not found
   */
  async update(id: string, partial: Partial<Session>): Promise<Session> {
    const session = this.sessions.get(id);
    if (!session) {
      throw new SanjError(
        `Session not found: ${id}`,
        ErrorCode.SESSION_READ_FAILED,
        { id }
      );
    }

    // Apply partial update (excluding id)
    Object.assign(session, {
      ...partial,
      id: session.id, // Preserve ID
    });

    await this.save();
    return session;
  }

  // ===========================================================================
  // Delete Operations
  // ===========================================================================

  /**
   * Remove session from index.
   * Does NOT delete the source session file.
   *
   * @param id - Session identifier
   * @returns true if removed, false if not found
   */
  async remove(id: string): Promise<boolean> {
    const existed = this.sessions.delete(id);
    if (existed) {
      await this.save();
    }
    return existed;
  }
}
