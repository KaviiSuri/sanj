/**
 * File Interaction Tracker
 *
 * Analyzes file interaction patterns in coding sessions to identify:
 * - Frequently modified files (edited many times)
 * - File hotspots (files with >10 edits in a session)
 * - Read/Write/Edit operation distribution per file
 * - Most active files across a session
 *
 * Helps surface which files dominate a session and where effort is concentrated.
 */

import type { Message, Session, FileInteractionMetadata } from '../core/types';
import { ProgrammaticPatternAnalyzer } from './base';

/** Operations that constitute a "write" to a file */
const WRITE_OPERATIONS = new Set(['edit', 'write', 'Edit', 'Write']);

/** Operations that constitute a "read" of a file */
const READ_OPERATIONS = new Set(['read', 'Read']);

/** All file-related tool names (normalized to lowercase for matching) */
const FILE_TOOL_NAMES = new Set(['read', 'edit', 'write', 'bash']);

/** Threshold for declaring a file a "hotspot" */
const HOTSPOT_EDIT_THRESHOLD = 10;

/** Minimum edit count to generate a "frequently modified" observation */
const MIN_FREQUENT_EDITS = 3;

/** Maximum number of top files to report */
const MAX_TOP_FILES = 5;

interface FileStats {
  filePath: string;
  readCount: number;
  writeCount: number;
  editCount: number;
  totalInteractions: number;
}

/**
 * Analyzer for file interaction patterns.
 *
 * Extracts observations about:
 * - Which files are modified most often
 * - Files that qualify as "hotspots" (heavy editing concentration)
 * - Overall file operation distribution (read-heavy vs write-heavy sessions)
 */
export class FileInteractionTracker extends ProgrammaticPatternAnalyzer {
  name = 'file-interaction';

  async analyze(session: Session, messages: Message[]): Promise<import('../core/types').Observation[]> {
    const observations: import('../core/types').Observation[] = [];

    const fileStats = this.extractFileStats(messages);

    observations.push(...this.analyzeFrequentlyModified(fileStats, session.id));
    observations.push(...this.analyzeHotspots(fileStats, session.id));
    observations.push(...this.analyzeTopFiles(fileStats, session.id));

    return observations;
  }

  /**
   * Extract per-file interaction statistics from messages.
   *
   * Inspects tool_use blocks for file paths in common parameters:
   * - file_path, filePath, path (Read, Edit, Write tools)
   * - command output parsing for Bash (best-effort)
   */
  private extractFileStats(messages: Message[]): Map<string, FileStats> {
    const stats = new Map<string, FileStats>();

    for (const message of messages) {
      if (!message.toolUses || message.toolUses.length === 0) {
        continue;
      }

      for (const toolUse of message.toolUses) {
        const toolNameLower = toolUse.name.toLowerCase();

        if (!FILE_TOOL_NAMES.has(toolNameLower)) {
          continue;
        }

        // Extract file path from tool input
        const filePath = this.extractFilePath(toolUse.input);
        if (!filePath) {
          continue;
        }

        // Normalize the path
        const normalizedPath = this.normalizePath(filePath);

        let stat = stats.get(normalizedPath);
        if (!stat) {
          stat = {
            filePath: normalizedPath,
            readCount: 0,
            writeCount: 0,
            editCount: 0,
            totalInteractions: 0,
          };
          stats.set(normalizedPath, stat);
        }

        stat.totalInteractions += 1;

        if (READ_OPERATIONS.has(toolUse.name)) {
          stat.readCount += 1;
        } else if (WRITE_OPERATIONS.has(toolUse.name)) {
          stat.writeCount += 1;
          stat.editCount += 1;
        }
      }
    }

    return stats;
  }

  /**
   * Extract a file path from tool input parameters.
   *
   * Checks common parameter names used by coding tools:
   * - file_path (snake_case, common in Claude tools)
   * - filePath (camelCase)
   * - path (generic)
   * - command (for bash, extract file references best-effort)
   *
   * @returns Normalized file path string, or null if none found
   */
  private extractFilePath(input?: Record<string, unknown>): string | null {
    if (!input) {
      return null;
    }

    // Check common file path parameter names in order of specificity
    const pathKeys = ['file_path', 'filePath', 'path'];

    for (const key of pathKeys) {
      const value = input[key];
      if (typeof value === 'string' && value.trim().length > 0) {
        return value.trim();
      }
    }

    return null;
  }

  /**
   * Normalize a file path for consistent comparison.
   *
   * - Removes trailing slashes
   * - Collapses multiple slashes
   * - Keeps the path as-is otherwise (relative paths stay relative)
   */
  private normalizePath(filePath: string): string {
    return filePath
      .replace(/\/+/g, '/')   // collapse multiple slashes
      .replace(/\/$/, '');     // remove trailing slash
  }

  /**
   * Create observations for files that are modified frequently (>= MIN_FREQUENT_EDITS).
   */
  private analyzeFrequentlyModified(
    fileStats: Map<string, FileStats>,
    sessionId: string
  ): import('../core/types').Observation[] {
    const observations: import('../core/types').Observation[] = [];

    for (const [, stat] of fileStats) {
      if (stat.editCount < MIN_FREQUENT_EDITS) {
        continue;
      }

      const text = `File "${stat.filePath}" modified ${stat.editCount} times in session`;
      const metadata: FileInteractionMetadata = {
        filePath: stat.filePath,
        readCount: stat.readCount,
        writeCount: stat.writeCount,
        editCount: stat.editCount,
        totalInteractions: stat.totalInteractions,
      };

      observations.push(
        this.createObservation(text, 'pattern', sessionId, metadata)
      );
    }

    return observations;
  }

  /**
   * Create observations for file hotspots (files with >= HOTSPOT_EDIT_THRESHOLD edits).
   */
  private analyzeHotspots(
    fileStats: Map<string, FileStats>,
    sessionId: string
  ): import('../core/types').Observation[] {
    const observations: import('../core/types').Observation[] = [];

    for (const [, stat] of fileStats) {
      if (stat.editCount < HOTSPOT_EDIT_THRESHOLD) {
        continue;
      }

      const text = `Hotspot detected: "${stat.filePath}" has ${stat.editCount} edits (heavily modified)`;
      const metadata: FileInteractionMetadata = {
        filePath: stat.filePath,
        readCount: stat.readCount,
        writeCount: stat.writeCount,
        editCount: stat.editCount,
        totalInteractions: stat.totalInteractions,
        isHotspot: true,
      };

      observations.push(
        this.createObservation(text, 'pattern', sessionId, metadata)
      );
    }

    return observations;
  }

  /**
   * Create observation for the top N most-interacted files in the session.
   * Only emits if there are multiple files to compare.
   */
  private analyzeTopFiles(
    fileStats: Map<string, FileStats>,
    sessionId: string
  ): import('../core/types').Observation[] {
    const observations: import('../core/types').Observation[] = [];

    if (fileStats.size < 2) {
      return observations;
    }

    // Sort by total interactions descending
    const sorted = Array.from(fileStats.values()).sort(
      (a, b) => b.totalInteractions - a.totalInteractions
    );

    const topFiles = sorted.slice(0, MAX_TOP_FILES);

    // Only report if top file has meaningful activity
    const topFile = topFiles[0];
    if (!topFile || topFile.totalInteractions < MIN_FREQUENT_EDITS) {
      return observations;
    }

    const fileList = topFiles
      .map((f) => `${f.filePath} (${f.totalInteractions})`)
      .join(', ');

    const text = `Most active files: ${fileList}`;
    const metadata: FileInteractionMetadata = {
      filePath: topFiles.map((f) => f.filePath).join(','),
      readCount: topFiles.reduce((sum, f) => sum + f.readCount, 0),
      writeCount: topFiles.reduce((sum, f) => sum + f.writeCount, 0),
      editCount: topFiles.reduce((sum, f) => sum + f.editCount, 0),
      totalInteractions: topFiles.reduce((sum, f) => sum + f.totalInteractions, 0),
      topFiles: topFiles.map((f) => ({
        path: f.filePath,
        interactions: f.totalInteractions,
        edits: f.editCount,
      })),
    };

    observations.push(
      this.createObservation(text, 'pattern', sessionId, metadata)
    );

    return observations;
  }
}
