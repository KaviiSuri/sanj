/**
 * File system watcher for Claude Code sessions.
 *
 * Monitors ~/.claude directory for new session directories and conversation
 * file writes. Emits events that trigger session ingestion pipeline.
 */

import chokidar from 'chokidar';
import type { FSWatcher } from 'chokidar';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { SanjError, ErrorCode } from '../core/types';

/**
 * Session event types emitted by FileWatcher
 */
export type SessionEventType = 'newSession' | 'conversationUpdated' | 'sessionClosed';

/**
 * Session event payload
 */
export interface SessionEvent {
  type: SessionEventType;
  sessionPath: string;
  sessionId: string;
  timestamp: Date;
}

/**
 * File watcher options
 */
export interface FileWatcherOptions {
  /** Path to watch (defaults to ~/.claude) */
  watchPath?: string;

  /** Debounce delay for rapid writes in milliseconds (default: 1000ms) */
  debounceDelay?: number;

  /** Ignore initial scan results (default: false) */
  ignoreInitial?: boolean;

  /** Custom marker file to identify valid sessions (default: .claudesettings.local.json) */
  markerFile?: string;

  /** Conversation filename to watch (default: conversation.jsonl) */
  conversationFile?: string;
}

/**
 * File watcher event listener types
 */
export type FileWatcherListener = (event: SessionEvent) => void;
export type ErrorListener = (error: Error) => void;

/**
 * File watcher for Claude Code sessions.
 *
 * Monitors ~/.claude directory for new session directories and conversation
 * file updates. Emits events that trigger the session ingestion pipeline.
 *
 * @example
 * ```typescript
 * const watcher = new FileWatcher();
 *
 * watcher.on('session', (event) => {
 *   console.log(`New session detected: ${event.sessionId}`);
 * });
 *
 * watcher.on('error', (error) => {
 *   console.error('Watcher error:', error);
 * });
 *
 * await watcher.start();
 * ```
 */
export class FileWatcher {
  private watcher: FSWatcher | null = null;
  private readonly watchPath: string;
  private readonly markerFile: string;
  private readonly conversationFile: string;
  private readonly debounceDelay: number;
  private readonly ignoreInitial: boolean;
  private readonly sessionListeners: Set<FileWatcherListener> = new Set();
  private readonly errorListeners: Set<ErrorListener> = new Set();
  private readonly debounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private isWatchingFlag: boolean = false;

  /**
   * Create a new FileWatcher instance.
   *
   * @param options - Configuration options
   */
  constructor(options: FileWatcherOptions = {}) {
    this.watchPath = options.watchPath || join(homedir(), '.claude');
    this.markerFile = options.markerFile || '.claudesettings.local.json';
    this.conversationFile = options.conversationFile || 'conversation.jsonl';
    this.debounceDelay = options.debounceDelay ?? 1000;
    this.ignoreInitial = options.ignoreInitial ?? false;
  }

  /**
   * Register a listener for session events.
   *
   * @param event - Event type ('session')
   * @param listener - Callback function
   *
   * @example
   * ```typescript
   * watcher.on('session', (event) => {
   *   if (event.type === 'newSession') {
   *     console.log(`New session: ${event.sessionId}`);
   *   }
   * });
   * ```
   */
  on(event: 'session', listener: FileWatcherListener): void;
  on(event: 'error', listener: ErrorListener): void;
  on(event: 'session' | 'error', listener: FileWatcherListener | ErrorListener): void {
    if (event === 'session') {
      this.sessionListeners.add(listener as FileWatcherListener);
    } else if (event === 'error') {
      this.errorListeners.add(listener as ErrorListener);
    }
  }

  /**
   * Unregister a listener.
   *
   * @param event - Event type ('session' or 'error')
   * @param listener - Callback function to remove
   */
  off(event: 'session' | 'error', listener: FileWatcherListener | ErrorListener): void {
    if (event === 'session') {
      this.sessionListeners.delete(listener as FileWatcherListener);
    } else if (event === 'error') {
      this.errorListeners.delete(listener as ErrorListener);
    }
  }

  /**
   * Start watching the configured directory.
   *
   * Initializes chokidar watcher and begins monitoring for changes.
   *
   * @throws SanjError if directory doesn't exist or isn't accessible
   *
   * @example
   * ```typescript
   * await watcher.start();
   * console.log('Watcher started');
   * ```
   */
  async start(): Promise<void> {
    if (this.isWatchingFlag) {
      return;
    }

    try {
      this.watcher = chokidar.watch(this.watchPath, {
        ignored: [
          'node_modules',
          '.DS_Store',
          '**/.swp',
          '**/.swo',
        ],
        persistent: true,
        ignoreInitial: this.ignoreInitial,
      });

      this.watcher
        .on('add', (path, stats) => this.handleFileAdd(path, stats))
        .on('change', (path, stats) => this.handleFileChange(path, stats))
        .on('unlink', (path) => this.handleFileUnlink(path))
        .on('error', (err) => this.handleWatcherError(err));

      await new Promise<void>((resolve) => {
        this.watcher!.on('ready', () => {
          this.isWatchingFlag = true;
          resolve();
        });
      });
    } catch (error) {
      const wrapped = new SanjError(
        `Failed to start file watcher: ${error instanceof Error ? error.message : String(error)}`,
        ErrorCode.WATCHER_START_FAILED
      );
      this.emitError(wrapped);
      throw wrapped;
    }
  }

  /**
   * Stop watching and cleanup resources.
   *
   * Removes all event listeners and closes the chokidar watcher.
   *
   * @example
   * ```typescript
   * await watcher.stop();
   * console.log('Watcher stopped');
   * ```
   */
  async stop(): Promise<void> {
    if (!this.isWatchingFlag || !this.watcher) {
      return;
    }

    try {
      await this.watcher.close();
    } catch (error) {
      const wrapped = new SanjError(
        `Error stopping file watcher: ${error instanceof Error ? error.message : String(error)}`,
        ErrorCode.WATCHER_STOP_FAILED
      );
      this.emitError(wrapped);
    } finally {
      this.watcher = null;
      this.isWatchingFlag = false;
      this.sessionListeners.clear();
      this.errorListeners.clear();
      this.debounceTimers.forEach((timer) => clearTimeout(timer));
      this.debounceTimers.clear();
    }
  }

  /**
   * Check if watcher is currently active.
   *
   * @returns true if watching, false otherwise
   */
  isWatching(): boolean {
    return this.isWatchingFlag;
  }

  /**
   * Handle file add events from chokidar.
   *
   * @param filePath - Path to added file
   * @param _stats - File stats from chokidar (unused)
   */
  private async handleFileAdd(filePath: string, _stats?: unknown): Promise<void> {
    const fileName = filePath.split('/').pop();

    if (fileName === this.markerFile) {
      await this.handleNewSession(filePath);
    } else if (fileName === this.conversationFile) {
      this.handleConversationUpdate(filePath, 'newSession');
    }
  }

  /**
   * Handle file change events from chokidar.
   *
   * @param filePath - Path to changed file
   * @param _stats - File stats from chokidar (unused)
   */
  private handleFileChange(filePath: string, _stats?: unknown): void {
    const fileName = filePath.split('/').pop();

    if (fileName === this.conversationFile) {
      this.handleConversationUpdate(filePath, 'conversationUpdated');
    }
  }

  /**
   * Handle file unlink events from chokidar.
   *
   * @param filePath - Path to removed file
   */
  private handleFileUnlink(filePath: string): void {
    const fileName = filePath.split('/').pop();

    if (fileName === this.markerFile) {
      this.handleSessionClosed(filePath);
    }
  }

  /**
   * Handle new session detection.
   *
   * @param markerFilePath - Path to marker file (.claudesettings.local.json)
   */
  private async handleNewSession(markerFilePath: string): Promise<void> {
    try {
      const sessionPath = markerFilePath.substring(0, markerFilePath.lastIndexOf('/'));
      const sessionId = this.extractSessionId(sessionPath);

      if (!sessionId) {
        return;
      }

      const event: SessionEvent = {
        type: 'newSession',
        sessionPath,
        sessionId,
        timestamp: new Date(),
      };

      this.emitSessionEvent(event);
    } catch (error) {
      const wrapped = new SanjError(
        `Error handling new session: ${error instanceof Error ? error.message : String(error)}`,
        ErrorCode.SESSION_PARSE_ERROR
      );
      this.emitError(wrapped);
    }
  }

  /**
   * Handle conversation file updates with debouncing.
   *
   * @param conversationFilePath - Path to conversation.jsonl
   * @param eventType - Type of event ('newSession' or 'conversationUpdated')
   */
  private handleConversationUpdate(conversationFilePath: string, eventType: SessionEventType): void {
    try {
      const sessionPath = conversationFilePath.substring(0, conversationFilePath.lastIndexOf('/'));
      const sessionId = this.extractSessionId(sessionPath);

      if (!sessionId) {
        return;
      }

      const existingTimer = this.debounceTimers.get(sessionId);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      const timer = setTimeout(() => {
        const event: SessionEvent = {
          type: eventType,
          sessionPath,
          sessionId,
          timestamp: new Date(),
        };

        this.emitSessionEvent(event);
        this.debounceTimers.delete(sessionId);
      }, this.debounceDelay);

      this.debounceTimers.set(sessionId, timer);
    } catch (error) {
      const wrapped = new SanjError(
        `Error handling conversation update: ${error instanceof Error ? error.message : String(error)}`,
        ErrorCode.SESSION_PARSE_ERROR
      );
      this.emitError(wrapped);
    }
  }

  /**
   * Handle session closed (marker file removed).
   *
   * @param markerFilePath - Path to marker file that was removed
   */
  private handleSessionClosed(markerFilePath: string): void {
    try {
      const sessionPath = markerFilePath.substring(0, markerFilePath.lastIndexOf('/'));
      const sessionId = this.extractSessionId(sessionPath);

      if (!sessionId) {
        return;
      }

      const event: SessionEvent = {
        type: 'sessionClosed',
        sessionPath,
        sessionId,
        timestamp: new Date(),
      };

      this.emitSessionEvent(event);
    } catch (error) {
      const wrapped = new SanjError(
        `Error handling session closed: ${error instanceof Error ? error.message : String(error)}`,
        ErrorCode.SESSION_PARSE_ERROR
      );
      this.emitError(wrapped);
    }
  }

  /**
   * Handle chokidar watcher errors.
   *
   * @param err - Error from chokidar
   */
  private handleWatcherError(err: unknown): void {
    const error = err instanceof Error ? err : new SanjError(String(err), ErrorCode.WATCHER_ERROR);
    const wrapped = new SanjError(
      `File watcher error: ${error.message}`,
      ErrorCode.WATCHER_ERROR
    );
    this.emitError(wrapped);
  }

  /**
   * Extract session ID from session path.
   *
   * @param sessionPath - Full path to session directory
   * @returns Session ID or null if not extractable
   */
  private extractSessionId(sessionPath: string): string | null {
    const parts = sessionPath.split('/');

    if (parts.length === 0) {
      return null;
    }

    const lastPart = parts[parts.length - 1];

    if (!lastPart || lastPart === '') {
      return null;
    }

    return lastPart;
  }

  /**
   * Emit session event to all registered listeners.
   *
   * @param event - Session event to emit
   */
  private emitSessionEvent(event: SessionEvent): void {
    this.sessionListeners.forEach((listener) => {
      try {
        listener(event);
      } catch (error) {
        const wrapped = new SanjError(
          `Error in session event listener: ${error instanceof Error ? error.message : String(error)}`,
          ErrorCode.EVENT_LISTENER_ERROR
        );
        this.emitError(wrapped);
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
 * Create a new FileWatcher instance.
 * Convenience function for creating a watcher with default options.
 *
 * @param options - Optional configuration options
 * @returns New FileWatcher instance
 *
 * @example
 * ```typescript
 * const watcher = createFileWatcher({ watchPath: '/custom/path' });
 * await watcher.start();
 * ```
 */
export function createFileWatcher(options?: FileWatcherOptions): FileWatcher {
  return new FileWatcher(options);
}
