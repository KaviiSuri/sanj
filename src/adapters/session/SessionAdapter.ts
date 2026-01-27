/**
 * Adapter interface for reading conversation history from different AI coding assistant tools.
 * Implementations abstract away tool-specific file locations, formats, and APIs.
 */

/**
 * Represents a single session/conversation with an AI assistant.
 */
export interface Session {
  /**
   * Unique identifier for this session.
   * Format depends on tool (e.g., UUID for Claude Code, hash for OpenCode).
   */
  id: string;

  /**
   * Name of tool that generated this session.
   * Should match to SessionAdapter's name property.
   */
  toolName: string;

  /**
   * Path to project this session was created in, if applicable.
   * May be undefined for sessions not tied to a specific project.
   */
  projectPath?: string;

  /**
   * When this session occurred (usually when it was created or last modified).
   */
  timestamp: Date;

  /**
   * The complete conversation content as a single string.
   * For JSONL files, this should be be concatenated content of all messages.
   * For JSON files, extract and format the conversation appropriately.
   */
  content: string;

  /**
   * File path where this session is stored.
   * Useful for debugging and maintaining references back to the source.
   */
  filePath: string;
}

/**
 * Adapter interface for reading conversation history from different AI coding assistant tools.
 * Implementations abstract away tool-specific file locations, formats, and APIs.
 */
export interface SessionAdapter {
  /**
   * Human-readable name of adapter (e.g., "Claude Code", "OpenCode").
   */
  name: string;

  /**
   * Check if this adapter's tool is available on system.
   *
   * @returns true if to tool is installed and accessible, false otherwise
   */
  isAvailable(): Promise<boolean>;

  /**
   * Retrieve sessions from this tool.
   *
   * @param since - Optional date filter. If provided, only return sessions after this timestamp.
   * @returns Array of Session objects. Empty array if no sessions found or tool unavailable.
   */
  getSessions(since?: Date): Promise<Session[]>;
}
