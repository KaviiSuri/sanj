/**
 * Session discovery service.
 *
 * Scans the ~/.claude directory to discover and index all valid Claude Code sessions.
 * A valid session is identified by the presence of .claudesettings.local.json file.
 */

import type { Session } from '../core/types';
import { parseConversationFile } from '../parsers/conversation';
import { extractSessionMetadata } from '../parsers/session-metadata';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

/**
 * Options for session discovery
 */
export interface DiscoveryOptions {
  /** Only discover sessions modified since this date (optional) */
  since?: Date;

  /** Custom Claude directory path (defaults to ~/.claude) */
  claudeDir?: string;
}

/**
 * Session discovery service.
 * Scans ~/.claude directory recursively for valid sessions.
 */
export class SessionDiscoveryService {
  private claudeDir: string;

  /**
   * Create a new SessionDiscoveryService.
   *
   * @param claudeDir - Path to Claude directory (defaults to ~/.claude)
   */
  constructor(claudeDir?: string) {
    this.claudeDir = claudeDir || join(homedir(), '.claude');
  }

  /**
   * Discover all valid sessions in the Claude directory.
   *
   * A valid session directory must contain:
   * - .claudesettings.local.json (marker file)
   * - conversation.jsonl (conversation file)
   *
   * @param options - Discovery options (optional)
   * @returns Array of discovered sessions with metadata
   *
   * @example
   * ```typescript
   * const service = new SessionDiscoveryService();
   * const sessions = await service.discoverSessions();
   * console.log(`Found ${sessions.length} sessions`);
   * ```
   */
  async discoverSessions(options?: DiscoveryOptions): Promise<Session[]> {
    const sessions: Session[] = [];

    try {
      // Find all valid session directories
      const sessionDirs = await this.findValidSessionDirectories(this.claudeDir);

      // Process each session directory
      for (const sessionDir of sessionDirs) {
        try {
          const session = await this.processSessionDirectory(sessionDir, options);
          if (session) {
            sessions.push(session);
          }
        } catch (error) {
          // Gracefully skip sessions that can't be processed
          // In production, could log warning: console.warn(`Failed to process ${sessionDir}:`, error);
          continue;
        }
      }
    } catch (error) {
      // Gracefully handle directory scan errors
      // In production, could log error: console.error('Failed to scan Claude directory:', error);
      return [];
    }

    return sessions;
  }

  /**
   * Find all directories containing .claudesettings.local.json (valid session marker).
   *
   * @param rootDir - Root directory to scan
   * @returns Array of valid session directory paths
   */
  private async findValidSessionDirectories(rootDir: string): Promise<string[]> {
    const validDirs: string[] = [];

    try {
      await this.scanDirectory(rootDir, validDirs);
    } catch (error) {
      // Return empty array if root directory doesn't exist or can't be read
      return [];
    }

    return validDirs;
  }

  /**
   * Recursively scan directory for valid session directories.
   *
   * @param dir - Directory to scan
   * @param validDirs - Array to accumulate valid directories
   */
  private async scanDirectory(dir: string, validDirs: string[]): Promise<void> {
    try {
      const entries = await readdir(dir, { withFileTypes: true });

      // Check if this directory is a valid session
      const hasMarker = entries.some(
        entry => entry.isFile() && entry.name === '.claudesettings.local.json'
      );

      if (hasMarker) {
        validDirs.push(dir);
        // Don't recurse into valid session directories
        return;
      }

      // Recurse into subdirectories
      for (const entry of entries) {
        if (entry.isDirectory()) {
          // Skip hidden directories except .claude itself
          if (entry.name.startsWith('.') && entry.name !== '.claude') {
            continue;
          }

          const subDir = join(dir, entry.name);
          await this.scanDirectory(subDir, validDirs);
        }
      }
    } catch (error) {
      // Gracefully skip directories that can't be read
      return;
    }
  }

  /**
   * Process a single session directory and extract session metadata.
   *
   * @param sessionDir - Path to session directory
   * @param options - Discovery options (optional)
   * @returns Session object if valid, null otherwise
   */
  private async processSessionDirectory(
    sessionDir: string,
    options?: DiscoveryOptions
  ): Promise<Session | null> {
    // Look for conversation.jsonl file
    const conversationPath = join(sessionDir, 'conversation.jsonl');

    try {
      // Check if conversation file exists
      const stats = await stat(conversationPath);

      // Filter by modification date if 'since' option provided
      if (options?.since && stats.mtime < options.since) {
        return null;
      }

      // Parse conversation file
      const conversation = await parseConversationFile(conversationPath);

      // Skip if no messages found
      if (conversation.messages.length === 0) {
        return null;
      }

      // Extract session metadata
      const session = extractSessionMetadata({
        filePath: conversationPath,
        conversation,
        tool: 'claude-code',
      });

      return session;
    } catch (error) {
      // Return null if conversation file doesn't exist or can't be read
      return null;
    }
  }

  /**
   * Get the Claude directory path being used.
   *
   * @returns Path to Claude directory
   */
  getClaudeDirectory(): string {
    return this.claudeDir;
  }

  /**
   * Check if the Claude directory exists and is accessible.
   *
   * @returns True if directory exists and is accessible
   */
  async isClaudeDirectoryAccessible(): Promise<boolean> {
    try {
      const stats = await stat(this.claudeDir);
      return stats.isDirectory();
    } catch (error) {
      return false;
    }
  }

  /**
   * Count total valid sessions without loading full metadata.
   * More efficient than discoverSessions() for just counting.
   *
   * @returns Number of valid sessions found
   */
  async countSessions(): Promise<number> {
    try {
      const sessionDirs = await this.findValidSessionDirectories(this.claudeDir);
      return sessionDirs.length;
    } catch (error) {
      return 0;
    }
  }
}

/**
 * Create a new SessionDiscoveryService instance.
 * Convenience function for creating the service.
 *
 * @param claudeDir - Optional custom Claude directory path
 * @returns New SessionDiscoveryService instance
 *
 * @example
 * ```typescript
 * const service = createSessionDiscoveryService();
 * const sessions = await service.discoverSessions();
 * ```
 */
export function createSessionDiscoveryService(claudeDir?: string): SessionDiscoveryService {
  return new SessionDiscoveryService(claudeDir);
}
