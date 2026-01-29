/**
 * Memory Context Injector
 *
 * Injects Sanj memory context references into CLAUDE.md and AGENTS.md
 * so AI agents know where to find user preferences and patterns.
 *
 * Uses sentinel markers to ensure idempotent injection (only added once).
 *
 * @module setup/memory-context-injector
 */

import { existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { homedir } from "os";
import { LONG_TERM_MEMORY_PATH } from "../storage/paths.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SENTINEL_START = "<!-- sanj:memory-context -->";
const SENTINEL_END = "<!-- /sanj:memory-context -->";

const CLAUDE_MD_PATH = join(homedir(), ".claude", "CLAUDE.md");
const AGENTS_MD_PATH = join(homedir(), "AGENTS.md");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InjectionResult {
  claudeMd: { injected: boolean; path: string; alreadyPresent: boolean };
  agentsMd: { injected: boolean; path: string; alreadyPresent: boolean };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Builds the memory context section content
 */
function buildMemoryContextSection(): string {
  return `${SENTINEL_START}
## Sanj Long-Term Memory

User preferences and patterns learned from coding sessions are stored in:
\`${LONG_TERM_MEMORY_PATH}\`

Consult this file when making decisions about coding style, preferences, and workflows.
${SENTINEL_END}`;
}

/**
 * Checks if the sentinel markers are present in the content
 */
function hasSanjContext(content: string): boolean {
  return content.includes(SENTINEL_START);
}

/**
 * Injects the memory context section into a file
 */
async function injectIntoFile(
  filePath: string
): Promise<{ injected: boolean; alreadyPresent: boolean }> {
  // Ensure directory exists
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  // Read existing content or start fresh
  let existing = "";
  if (existsSync(filePath)) {
    const file = Bun.file(filePath);
    existing = await file.text();
  }

  // Check if already present
  if (hasSanjContext(existing)) {
    return { injected: false, alreadyPresent: true };
  }

  // Build new content
  const section = buildMemoryContextSection();
  const separator = existing.length > 0 && !existing.endsWith("\n") ? "\n\n" : existing.length > 0 ? "\n" : "";
  const newContent = existing + separator + section + "\n";

  // Write back
  await Bun.write(filePath, newContent);

  return { injected: true, alreadyPresent: false };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Injects Sanj memory context into both CLAUDE.md and AGENTS.md
 *
 * Idempotent - if context already exists, it won't be added again.
 */
export async function injectMemoryContext(options?: {
  claudeMdPath?: string;
  agentsMdPath?: string;
}): Promise<InjectionResult> {
  const claudePath = options?.claudeMdPath ?? CLAUDE_MD_PATH;
  const agentsPath = options?.agentsMdPath ?? AGENTS_MD_PATH;

  const [claudeResult, agentsResult] = await Promise.all([
    injectIntoFile(claudePath),
    injectIntoFile(agentsPath),
  ]);

  return {
    claudeMd: { ...claudeResult, path: claudePath },
    agentsMd: { ...agentsResult, path: agentsPath },
  };
}

/**
 * Ensures memory context is present (lazy check for promotion flow)
 * Returns true if any injection was needed
 */
export async function ensureMemoryContext(options?: {
  claudeMdPath?: string;
  agentsMdPath?: string;
}): Promise<boolean> {
  const result = await injectMemoryContext(options);
  return result.claudeMd.injected || result.agentsMd.injected;
}
