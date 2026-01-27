/**
 * Session ingestion service.
 *
 * Orchestrates the ingestion pipeline: discovery → parsing → storage.
 * Receives events from FileWatcher and processes sessions for analysis.
 */

import type { Session } from '../core/types';
import { SanjError, ErrorCode } from '../core/types';
import { SessionDiscoveryService } from './session-discovery';
import type { SessionEvent } from './file-watcher';

/**
 * Result of a session ingestion operation.
 */
export interface IngestionResult {
  /** Whether ingestion succeeded */
  success: boolean;

  /** Session ID (if successful) */
  sessionId?: string;

  /** Reason for failure (if unsuccessful) */
  error?: string;
}

/**
 * Options for session ingestion.
 */
export interface IngestionOptions {
  /** Whether to skip existing sessions (default: true) */
  skipExisting?: boolean;

  /** Whether to trigger analysis after ingestion (default: false) */
  triggerAnalysis?: boolean;

  /** Custom Claude directory path (defaults to ~/.claude) */
  claudeDir?: string | undefined;
}

/**
 * Ingestion event emitted after processing a session.
 */
export interface IngestionEvent {
  /** Type of event */
  type: 'ingested' | 'updated' | 'skipped' | 'error';

  /** Session that was processed (if successful) */
  session?: Session;

  /** Session ID */
  sessionId: string;

  /** When event occurred */
  timestamp: Date;

  /** Error details (if event type is 'error') */
  error?: Error;
}

/**
 * Ingestion listener callback.
 */
export type IngestionListener = (event: IngestionEvent) => void;
export type ErrorListener = (error: Error) => void;

/**
 * Session ingestion service.
 *
 * Orchestrates the ingestion pipeline for sessions:
 * - Receives events from FileWatcher
 * - Parses session data using SessionDiscoveryService
 * - Tracks ingested sessions for idempotency
 * - Emits events for downstream processing (e.g., analysis)
 *
 * @example
 * ```typescript
 * const watcher = new FileWatcher();
 * const ingestion = new SessionIngestionService();
 *
 * // Subscribe to watcher events
 * watcher.on('session', async (event) => {
 *   await ingestion.handleSessionEvent(event);
 * });
 *
 * // Subscribe to ingestion events
 * ingestion.on('ingested', (event) => {
 *   console.log(`Ingested session: ${event.sessionId}`);
 * });
 * ```
 */
export class SessionIngestionService {
  private readonly discovery: SessionDiscoveryService;
  private readonly ingestedSessions: Set<string> = new Set();
  private readonly ingestionListeners: Set<IngestionListener> = new Set();
  private readonly errorListeners: Set<ErrorListener> = new Set();
  private readonly options: IngestionOptions;

  /**
   * Create a new SessionIngestionService.
   *
   * @param options - Ingestion options
   */
  constructor(options: IngestionOptions = {}) {
    this.options = {
      skipExisting: options.skipExisting ?? true,
      triggerAnalysis: options.triggerAnalysis ?? false,
      claudeDir: options.claudeDir,
    };

    this.discovery = new SessionDiscoveryService(this.options.claudeDir);
  }

  /**
   * Handle a session event from FileWatcher.
   *
   * Orchestrates the full ingestion pipeline:
   * 1. Check idempotency (skip if already ingested)
   * 2. Parse session data
   * 3. Track session
   * 4. Emit ingestion event
   *
   * @param event - Session event from FileWatcher
   * @returns Ingestion result
   */
  async handleSessionEvent(event: SessionEvent): Promise<IngestionResult> {
    try {
      const { sessionId, type } = event;

      switch (type) {
        case 'newSession':
        case 'conversationUpdated':
          return await this.ingestSession(sessionId);
        case 'sessionClosed':
          return await this.handleSessionClosed(sessionId);
        default:
          return {
            success: false,
            error: `Unknown event type: ${type}`,
          };
      }
    } catch (error) {
      const wrapped = new SanjError(
        `Failed to handle session event: ${error instanceof Error ? error.message : String(error)}`,
        ErrorCode.SESSION_PARSE_ERROR,
        { event }
      );
      this.emitError(wrapped);
      return {
        success: false,
        error: wrapped.message,
      };
    }
  }

  /**
   * Ingest a single session.
   *
   * @param sessionId - Session identifier
   * @returns Ingestion result
   */
  private async ingestSession(sessionId: string): Promise<IngestionResult> {
    try {
      if (this.options.skipExisting && this.hasIngestedSession(sessionId)) {
        this.emitIngestionEvent({
          type: 'skipped',
          sessionId,
          timestamp: new Date(),
        });
        return {
          success: true,
          sessionId,
        };
      }

      // Track session as ingested (even if not found in discovery)
      this.ingestedSessions.add(sessionId);

      // Parse session using discovery service
      const sessions = await this.discovery.discoverSessions();

      const session = sessions.find(s => s.id === sessionId);

      if (!session) {
        // Session not found - this could be because:
        // - Directory doesn't exist yet
        // - Conversation file not yet created
        // - Session ID doesn't match
        // We'll emit an error event but still return success for idempotency
        this.emitIngestionEvent({
          type: 'error',
          sessionId,
          timestamp: new Date(),
          error: new SanjError(
            `Session not found in discovery: ${sessionId}`,
            ErrorCode.SESSION_READ_FAILED
          ),
        });

        return {
          success: true,
          sessionId,
        };
      }

      this.emitIngestionEvent({
        type: 'ingested',
        session,
        sessionId,
        timestamp: new Date(),
      });

      return {
        success: true,
        sessionId,
      };
    } catch (error) {
      const wrapped = error instanceof Error ? error : new SanjError(String(error), ErrorCode.SESSION_PARSE_ERROR);

      this.emitIngestionEvent({
        type: 'error',
        sessionId,
        timestamp: new Date(),
        error: wrapped,
      });

      this.emitError(wrapped);

      return {
        success: true,
        sessionId,
      };
    }
  }

  /**
   * Handle session closed event.
   *
   * @param sessionId - Session identifier
   * @returns Ingestion result
   */
  private async handleSessionClosed(sessionId: string): Promise<IngestionResult> {
    try {
      const sessions = await this.discovery.discoverSessions();
      const session = sessions.find(s => s.id === sessionId);

      if (!session) {
        return {
          success: true,
          sessionId,
        };
      }

      this.emitIngestionEvent({
        type: 'updated',
        session,
        sessionId,
        timestamp: new Date(),
      });

      return {
        success: true,
        sessionId,
      };
    } catch (error) {
      const wrapped = error instanceof Error ? error : new SanjError(String(error), ErrorCode.SESSION_PARSE_ERROR);

      this.emitError(wrapped);

      return {
        success: true,
        sessionId,
      };
    }
  }

  /**
   * Check if a session has already been ingested.
   *
   * @param sessionId - Session identifier
   * @returns true if session was already ingested
   */
  hasIngestedSession(sessionId: string): boolean {
    return this.ingestedSessions.has(sessionId);
  }

  /**
   * Get list of all ingested session IDs.
   *
   * @returns Array of ingested session IDs
   */
  getIngestedSessionIds(): string[] {
    return Array.from(this.ingestedSessions);
  }

  /**
   * Clear the ingested sessions cache.
   * Useful for testing or forcing re-ingestion.
   */
  clearIngestedCache(): void {
    this.ingestedSessions.clear();
  }

  /**
   * Subscribe to ingestion events.
   *
   * @param event - Event type ('ingested' or 'error')
   * @param listener - Callback function
   */
  on(event: 'ingested' | 'error', listener: IngestionListener | ErrorListener): void {
    if (event === 'ingested') {
      this.ingestionListeners.add(listener as IngestionListener);
    } else if (event === 'error') {
      this.errorListeners.add(listener as ErrorListener);
    }
  }

  /**
   * Unsubscribe from ingestion events.
   *
   * @param event - Event type
   * @param listener - Callback function to remove
   */
  off(event: 'ingested' | 'error', listener: IngestionListener | ErrorListener): void {
    if (event === 'ingested') {
      this.ingestionListeners.delete(listener as IngestionListener);
    } else if (event === 'error') {
      this.errorListeners.delete(listener as ErrorListener);
    }
  }

  /**
   * Emit ingestion event to all registered listeners.
   *
   * @param event - Ingestion event to emit
   */
  private emitIngestionEvent(event: IngestionEvent): void {
    this.ingestionListeners.forEach((listener) => {
      try {
        listener(event);
      } catch (error) {
        console.error('Error in ingestion event listener:', error);
      }
    });
  }

  /**
   * Emit error to all registered error listeners.
   *
   * @param error - Error to emit
   */
  private emitError(error: Error): void {
    this.errorListeners.forEach((listener) => {
      try {
        listener(error);
      } catch (err) {
        console.error('Error in error listener:', err);
      }
    });
  }
}

/**
 * Create a new SessionIngestionService instance.
 * Convenience function for creating a service.
 *
 * @param options - Optional ingestion options
 * @returns New SessionIngestionService instance
 *
 * @example
 * ```typescript
 * const ingestion = createSessionIngestionService({ skipExisting: true });
 * ```
 */
export function createSessionIngestionService(options?: IngestionOptions): SessionIngestionService {
  return new SessionIngestionService(options);
}
