/**
 * Claude Code Session Adapter
 *
 * Reads session data from Claude Code's storage directory at ~/.claude/projects/.
 * Each session is stored as a JSONL file: ~/.claude/projects/{project-slug}/{session-id}.jsonl
 *
 * This adapter:
 * - Scans project directories recursively for .jsonl session files
 * - Parses conversation.jsonl format using existing conversation parser
 * - Extracts session metadata (timestamps, message count, etc.)
 * - Filters sessions by optional 'since' timestamp
 * - Handles errors gracefully (missing files, malformed JSON, permission errors)
 *
 * @module adapters/session/ClaudeCodeSession
 */

import { existsSync, readdirSync } from "fs";
import { join, basename } from "path";
import { homedir } from "os";
import { parseConversationFile, buildRawContent } from "../../parsers/conversation.ts";
import type { SessionAdapter, Session } from "./SessionAdapter.ts";

/**
 * Default path to Claude Code's project directory.
 */
const DEFAULT_CLAUDE_PROJECTS_PATH = join(homedir(), ".claude", "projects");

/**
 * Adapter for reading sessions from Claude Code.
 *
 * Claude Code stores sessions at:
 * ~/.claude/projects/{project-slug}/{session-id}.jsonl
 *
 * Each .jsonl file contains a conversation in JSONL format.
 */
export class ClaudeCodeSessionAdapter implements SessionAdapter {
  readonly name = "claude-code";

  /**
   * Base path to Claude Code projects directory.
   * Can be overridden for testing.
   */
  private readonly basePath: string;

  /**
   * Create a new ClaudeCodeSessionAdapter instance.
   *
   * @param basePath - Optional custom base path (for testing)
   */
  constructor(basePath?: string) {
    this.basePath = basePath || DEFAULT_CLAUDE_PROJECTS_PATH;
  }

  /**
   * Check if Claude Code is available on this system.
   * Returns true if ~/.claude/projects/ directory exists.
   *
   * @returns true if Claude Code projects directory exists, false otherwise
   */
  async isAvailable(): Promise<boolean> {
    try {
      return existsSync(this.basePath);
    } catch {
      return false;
    }
  }

  /**
   * Get all sessions from Claude Code, optionally filtered by recency.
   *
   * Scans ~/.claude/projects/ recursively for .jsonl session files.
   * Uses conversation parser to extract messages and metadata.
   *
   * @param since - Only return sessions updated after this date (inclusive)
   * @returns Array of Session objects, empty if none found or unavailable
   */
  async getSessions(since?: Date): Promise<Session[]> {
    const sessions: Session[] = [];

    try {
      // Find all project directories
      const projectDirs = this.findProjectDirectories();

      for (const projectDir of projectDirs) {
        // Find all session files in this project directory
        const sessionFiles = this.findSessionFiles(projectDir);

        for (const sessionFile of sessionFiles) {
          try {
            // Extract session ID from filename (remove .jsonl extension)
            const sessionId = basename(sessionFile, ".jsonl");

            // Parse conversation file
            const parsed = await parseConversationFile(sessionFile);

            if (!parsed || parsed.messages.length === 0) {
              // Skip empty or malformed sessions
              continue;
            }

            // Extract timestamps from parsed conversation
            const createdAt = parsed.createdAt || new Date();
            const modifiedAt = parsed.modifiedAt || createdAt;

            // Filter by 'since' timestamp if provided
            if (since && modifiedAt < since) {
              continue;
            }

            // Build Session object for SessionAdapter interface
            const session: Session = {
              id: sessionId,
              toolName: this.name,
              projectPath: parsed.cwd,
              timestamp: createdAt,
              content: buildRawContent(parsed.messages),
              filePath: sessionFile,
            };

            sessions.push(session);
          } catch (error) {
            // Log error but continue processing other sessions
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.warn(
              `[ClaudeCodeSessionAdapter] Failed to parse session file ${sessionFile}: ${errorMsg}`
            );
            continue;
          }
        }
      }
    } catch (error) {
      // Log top-level error but return empty array
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.warn(
        `[ClaudeCodeSessionAdapter] Error scanning sessions: ${errorMsg}`
      );
      return [];
    }

    // Sort by timestamp (newest first)
    sessions.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    return sessions;
  }

  /**
   * Find all project directories under base path.
   * Project directories are those that contain .jsonl session files.
   *
   * @returns Array of project directory paths
   */
  private findProjectDirectories(): string[] {
    const projectDirs: string[] = [];

    try {
      // Check if base path exists
      if (!existsSync(this.basePath)) {
        return projectDirs;
      }

      // Read base directory
      const entries = readdirSync(this.basePath, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith(".")) {
          const projectDir = join(this.basePath, entry.name);

          try {
            // Check if this directory contains .jsonl files
            const files = readdirSync(projectDir);
            const hasJsonlFiles = files.some((file) => file.endsWith(".jsonl"));

            if (hasJsonlFiles) {
              projectDirs.push(projectDir);
            }
          } catch {
            // Skip directories we can't read
            continue;
          }
        }
      }
    } catch (error) {
      // Log error but continue
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.warn(
        `[ClaudeCodeSessionAdapter] Error finding project directories: ${errorMsg}`
      );
    }

    return projectDirs;
  }

  /**
   * Find all .jsonl session files in a project directory.
   * Only looks in the immediate directory (not recursive within project).
   *
   * @param projectDir - Path to project directory
   * @returns Array of session file paths
   */
  private findSessionFiles(projectDir: string): string[] {
    const sessionFiles: string[] = [];

    try {
      const files = readdirSync(projectDir);

      for (const file of files) {
        if (file.endsWith(".jsonl") && !file.startsWith(".")) {
          sessionFiles.push(join(projectDir, file));
        }
      }
    } catch (error) {
      // Log error but continue
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.warn(
        `[ClaudeCodeSessionAdapter] Error finding session files in ${projectDir}: ${errorMsg}`
      );
    }

    return sessionFiles;
  }
}
