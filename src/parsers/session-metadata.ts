/**
 * Session metadata extractor.
 *
 * Extracts session metadata from parsed conversation data and file paths.
 * Builds Session objects suitable for storage and querying.
 */

import type { Session } from '../core/types';
import type { ParsedConversation } from './conversation';
import path from 'node:path';

/**
 * Options for extracting session metadata
 */
export interface ExtractMetadataOptions {
  /** Path to the conversation file */
  filePath: string;

  /** Parsed conversation data */
  conversation: ParsedConversation;

  /** Tool source (auto-detected if not provided) */
  tool?: 'claude-code' | 'opencode';
}

/**
 * Extract session metadata from a parsed conversation and file path.
 *
 * @param options - Extraction options including file path and parsed conversation
 * @returns Session object with complete metadata
 *
 * @example
 * ```typescript
 * const conversation = await parseConversationFile(filePath);
 * const session = extractSessionMetadata({
 *   filePath: '~/.claude/projects/my-project/abc123.jsonl',
 *   conversation
 * });
 * console.log(`Session ${session.id} has ${session.messageCount} messages`);
 * ```
 */
export function extractSessionMetadata(options: ExtractMetadataOptions): Session {
  const { filePath, conversation, tool } = options;

  // Extract session ID from file path or use conversation sessionId
  const sessionId = extractSessionId(filePath, conversation.sessionId);

  // Detect tool from file path if not provided
  const detectedTool = tool || detectToolFromPath(filePath);

  // Extract project slug from file path (optional)
  const projectSlug = extractProjectSlug(filePath);

  // Determine timestamps
  const createdAt = conversation.createdAt || new Date();
  const modifiedAt = conversation.modifiedAt || createdAt;

  // Calculate message count
  const messageCount = conversation.messages.length;

  return {
    id: sessionId,
    tool: detectedTool,
    projectSlug,
    createdAt,
    modifiedAt,
    path: filePath,
    messageCount,
  };
}

/**
 * Extract session ID from file path or conversation metadata.
 *
 * Priority:
 * 1. Use sessionId from conversation if available
 * 2. Extract from file path basename (without extension)
 * 3. Use full file path as fallback
 *
 * @param filePath - Path to conversation file
 * @param conversationSessionId - Session ID from parsed conversation (if available)
 * @returns Extracted session ID
 */
function extractSessionId(filePath: string, conversationSessionId?: string): string {
  // Priority 1: Use conversation sessionId if available
  if (conversationSessionId) {
    return conversationSessionId;
  }

  // Priority 2: Extract from file path
  const basename = path.basename(filePath);
  const sessionId = basename.replace(/\.(jsonl?|json)$/i, '');

  // Priority 3: Use full path if basename is generic
  if (sessionId === 'conversation' || sessionId === 'session') {
    return filePath;
  }

  return sessionId;
}

/**
 * Detect tool type from file path.
 *
 * Claude Code sessions: ~/.claude/...
 * OpenCode sessions: ~/.local/share/opencode/...
 *
 * @param filePath - Path to conversation file
 * @returns Detected tool type
 */
function detectToolFromPath(filePath: string): 'claude-code' | 'opencode' {
  const normalizedPath = filePath.toLowerCase();

  if (normalizedPath.includes('/.claude/') || normalizedPath.includes('\\.claude\\')) {
    return 'claude-code';
  }

  if (normalizedPath.includes('/opencode/') || normalizedPath.includes('\\opencode\\')) {
    return 'opencode';
  }

  // Default to claude-code if unable to detect
  return 'claude-code';
}

/**
 * Extract project slug from file path (optional).
 *
 * Claude Code format: ~/.claude/projects/{projectSlug}/{sessionId}.jsonl
 * OpenCode format: varies
 *
 * @param filePath - Path to conversation file
 * @returns Project slug if found, undefined otherwise
 */
function extractProjectSlug(filePath: string): string | undefined {
  // Try to extract from Claude Code projects path
  const claudeMatch = filePath.match(/\/\.claude\/projects\/([^/]+)\//);
  if (claudeMatch) {
    return claudeMatch[1];
  }

  // Try to extract from OpenCode path (if format is known)
  const opencodeMatch = filePath.match(/\/opencode\/projects\/([^/]+)\//);
  if (opencodeMatch) {
    return opencodeMatch[1];
  }

  // No project slug found
  return undefined;
}

/**
 * Calculate session duration in milliseconds.
 *
 * @param session - Session object with createdAt and modifiedAt
 * @returns Duration in milliseconds
 */
export function calculateSessionDuration(session: Session): number {
  return session.modifiedAt.getTime() - session.createdAt.getTime();
}

/**
 * Format session duration as human-readable string.
 *
 * @param durationMs - Duration in milliseconds
 * @returns Human-readable duration string (e.g., "2h 15m", "45m", "30s")
 */
export function formatDuration(durationMs: number): string {
  const seconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  }

  if (minutes > 0) {
    return `${minutes}m`;
  }

  return `${seconds}s`;
}

/**
 * Extract working directory from parsed conversation.
 *
 * Uses the cwd field from conversation metadata.
 *
 * @param conversation - Parsed conversation
 * @returns Working directory if available, undefined otherwise
 */
export function extractWorkingDirectory(conversation: ParsedConversation): string | undefined {
  return conversation.cwd;
}

/**
 * Check if session has any messages.
 *
 * @param session - Session object
 * @returns True if session has at least one message
 */
export function hasMessages(session: Session): boolean {
  return session.messageCount > 0;
}

/**
 * Validate session metadata.
 *
 * Checks that required fields are present and valid.
 *
 * @param session - Session object to validate
 * @returns Validation result with error messages if any
 */
export function validateSession(session: Session): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!session.id || session.id.trim() === '') {
    errors.push('Session ID is required');
  }

  if (!session.path || session.path.trim() === '') {
    errors.push('Session path is required');
  }

  if (!session.tool) {
    errors.push('Session tool is required');
  }

  if (!(session.createdAt instanceof Date) || isNaN(session.createdAt.getTime())) {
    errors.push('Valid createdAt timestamp is required');
  }

  if (!(session.modifiedAt instanceof Date) || isNaN(session.modifiedAt.getTime())) {
    errors.push('Valid modifiedAt timestamp is required');
  }

  if (session.messageCount < 0) {
    errors.push('Message count cannot be negative');
  }

  if (session.createdAt && session.modifiedAt && session.modifiedAt < session.createdAt) {
    errors.push('modifiedAt cannot be before createdAt');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
