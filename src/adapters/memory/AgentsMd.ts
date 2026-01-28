/**
 * AgentsMdAdapter — CoreMemoryAdapter writing to AGENTS.md
 *
 * Handles path resolution, safe file operations, and content formatting
 * for OpenCode's global memory file.
 *
 * @module adapters/memory/AgentsMd
 */

import { existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";
import type { CoreMemoryAdapter } from "./CoreMemoryAdapter.ts";

export class AgentsMdAdapter implements CoreMemoryAdapter {
  readonly name = "agents-md";
  private readonly path: string;

  constructor(path?: string) {
    this.path = path ?? join(homedir(), "AGENTS.md");
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
