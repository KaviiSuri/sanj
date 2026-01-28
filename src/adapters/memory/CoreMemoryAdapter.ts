/**
 * CoreMemoryAdapter Interface
 *
 * Abstracts writing to final memory destinations (CLAUDE.md and AGENTS.md).
 * Multiple implementations can write memory content to different formats
 * and locations while maintaining a consistent contract.
 *
 * @module adapters/memory/CoreMemoryAdapter
 */

export interface CoreMemoryAdapter {
  /** Human-readable name for logging and debugging */
  name: string;

  /** Return the absolute file path this adapter writes to */
  getPath(): string;

  /** Read current content of the memory file. Returns empty string if file doesn't exist. */
  read(): Promise<string>;

  /** Append formatted memory content to the file. Creates file if it doesn't exist. */
  append(content: string): Promise<void>;
}
