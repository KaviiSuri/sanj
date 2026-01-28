/**
 * ClaudeMdAdapter — CoreMemoryAdapter writing to CLAUDE.md
 *
 * Handles path resolution, safe file operations, and content formatting
 * for Claude Code's global memory file.
 *
 * @module adapters/memory/ClaudeMd
 */

import { existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";
import type { CoreMemoryAdapter } from "./CoreMemoryAdapter.ts";

export class ClaudeMdAdapter implements CoreMemoryAdapter {
  readonly name = "claude-md";
  private readonly path: string;

  constructor(path?: string) {
    this.path = path ?? join(homedir(), ".claude", "CLAUDE.md");
  }

  getPath(): string {
    return this.path;
  }

  async read(): Promise<string> {
    try {
      if (!existsSync(this.path)) {
        return "";
      }
      const file = Bun.file(this.path);
      return await file.text();
    } catch {
      return "";
    }
  }

  async append(content: string): Promise<void> {
    const dir = dirname(this.path);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const existing = await this.read();
    const separator = existing.length > 0 && !existing.endsWith("\n") ? "\n\n" : existing.length > 0 ? "\n" : "";
    const newContent = separator + content;
    await Bun.write(this.path, existing + newContent);
  }
}
