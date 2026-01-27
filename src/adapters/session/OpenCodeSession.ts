/**
 * OpenCode Session Adapter
 *
 * Reads session data from OpenCode's local storage directory.
 * Sessions are stored as JSON files: ~/.local/share/opencode/storage/session/{projectHash}/{sessionID}.json
 *
 * This adapter:
 * - Scans session directories recursively for .json session files
 * - Parses OpenCode's JSON session format
 * - Extracts session metadata (timestamps, messages, etc.)
 * - Filters sessions by optional 'since' timestamp
 * - Handles errors gracefully (missing files, malformed JSON, permission errors)
 *
 * @module adapters/session/OpenCodeSession
 */

import { existsSync, readdirSync, readFileSync } from "fs";
import { join, basename } from "path";
import { homedir } from "os";
import type { SessionAdapter, Session } from "./SessionAdapter.ts";

/**
 * Default path to OpenCode's session storage directory.
 */
const DEFAULT_OPENCODE_SESSIONS_PATH = join(
  homedir(),
  ".local",
  "share",
  "opencode",
  "storage",
  "session"
);

/**
 * OpenCode session data structure from JSON file.
 */
interface OpenCodeSessionData {
  id?: string;
  messages?: Array<{
    role: "user" | "assistant";
    content: string;
    timestamp?: string;
  }>;
  createdAt?: string;
  modifiedAt?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Adapter for reading sessions from OpenCode.
 *
 * OpenCode stores sessions at:
 * ~/.local/share/opencode/storage/session/{projectHash}/{sessionID}.json
 *
 * Each .json file contains a full session with messages and metadata.
 */
export class OpenCodeSessionAdapter implements SessionAdapter {
  readonly name = "opencode";

  /**
   * Base path to OpenCode session storage directory.
   * Can be overridden for testing.
   */
  private readonly basePath: string;

  /**
   * Create a new OpenCodeSessionAdapter instance.
   *
   * @param basePath - Optional custom base path (for testing)
   */
  constructor(basePath?: string) {
    this.basePath = basePath || DEFAULT_OPENCODE_SESSIONS_PATH;
  }

  /**
   * Check if OpenCode is available on this system.
   * Returns true if ~/.local/share/opencode/storage/session/ directory exists.
   *
   * @returns true if OpenCode session directory exists, false otherwise
   */
  async isAvailable(): Promise<boolean> {
    try {
      return existsSync(this.basePath);
    } catch {
      return false;
    }
  }

  /**
   * Get all sessions from OpenCode, optionally filtered by recency.
   *
   * Scans ~/.local/share/opencode/storage/session/ recursively for .json session files.
   * Parses OpenCode's JSON session format.
   *
   * @param since - Only return sessions updated after this date (inclusive)
   * @returns Array of Session objects, empty if none found or unavailable
   */
  async getSessions(since?: Date): Promise<Session[]> {
    const sessions: Session[] = [];

    try {
      // Find all project hash directories
      const projectDirs = this.findProjectDirectories();

        for (const projectDir of projectDirs) {
          // Find all session files in this project directory
        const sessionFiles = this.findSessionFiles(projectDir);

        for (const sessionFile of sessionFiles) {
          try {
            // Extract session ID from filename (remove .json extension)
            const sessionId = basename(sessionFile, ".json");

            // Parse session JSON file
            const sessionData = this.parseSessionFile(sessionFile);

            if (!sessionData || !sessionData.messages || sessionData.messages.length === 0) {
              // Skip empty or malformed sessions
              continue;
            }

            // Extract timestamps
            const createdAt = sessionData.createdAt
              ? new Date(sessionData.createdAt)
              : new Date();
            const modifiedAt = sessionData.modifiedAt
              ? new Date(sessionData.modifiedAt)
              : createdAt;

            // Filter by 'since' timestamp if provided
            if (since && modifiedAt < since) {
              continue;
            }

            // Build content string from messages
            const content = this.buildContentString(sessionData.messages);

            // Build Session object for SessionAdapter interface
            const session: Session = {
              id: sessionId,
              toolName: this.name,
              projectPath: projectDir,
              timestamp: createdAt,
              content: content,
              filePath: sessionFile,
            };

            sessions.push(session);
          } catch (error) {
            // Log error but continue processing other sessions
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.warn(
              `[OpenCodeSessionAdapter] Failed to parse session file ${sessionFile}: ${errorMsg}`
            );
            continue;
          }
        }
      }
    } catch (error) {
      // Log top-level error but return empty array
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.warn(
        `[OpenCodeSessionAdapter] Error scanning sessions: ${errorMsg}`
      );
      return [];
    }

    // Sort by timestamp (newest first)
    sessions.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    return sessions;
  }

  /**
   * Parse a single OpenCode session JSON file.
   *
   * @param filePath - Path to session JSON file
   * @returns Parsed session data, or null if invalid
   */
  private parseSessionFile(filePath: string): OpenCodeSessionData | null {
    try {
      const content = readFileSync(filePath, "utf-8");
      const data = JSON.parse(content) as OpenCodeSessionData;
      return data;
    } catch (error) {
      // Log error and return null
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.warn(
        `[OpenCodeSessionAdapter] Failed to parse JSON in ${filePath}: ${errorMsg}`
      );
      return null;
    }
  }

  /**
   * Build content string from OpenCode messages.
   * Concatenates all messages with role labels.
   *
   * @param messages - Array of messages from session data
   * @returns Formatted string with all conversation content
   */
  private buildContentString(
    messages: Array<{ role: string; content: string; timestamp?: string }>
  ): string {
    return messages
      .map((msg) => {
        const role = msg.role === "user" ? "User" : "Assistant";
        return `[${role}]: ${msg.content}`;
      })
      .join("\n\n");
  }

  /**
   * Find all project hash directories under base path.
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
            // Check if this directory contains .json files
            const files = readdirSync(projectDir);
            const hasJsonFiles = files.some((file) => file.endsWith(".json"));

            if (hasJsonFiles) {
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
        `[OpenCodeSessionAdapter] Error finding project directories: ${errorMsg}`
      );
    }

    return projectDirs;
  }

  /**
   * Find all .json session files in a project directory.
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
        if (file.endsWith(".json") && !file.startsWith(".")) {
          sessionFiles.push(join(projectDir, file));
        }
      }
    } catch (error) {
      // Log error but continue
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.warn(
        `[OpenCodeSessionAdapter] Error finding session files in ${projectDir}: ${errorMsg}`
      );
    }

    return sessionFiles;
  }
}
