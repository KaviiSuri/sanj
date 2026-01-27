# Spec: Task 002-002 - Create storage/config.ts

## Task Identification

**Task ID**: 002-002
**JTBD**: 002 - First-Time Setup
**Job Statement**: "When I first use Sanj, I want to initialize it with sensible defaults, so that it's ready to capture patterns."

---

## Purpose

This task implements the configuration storage layer for Sanj. The `storage/config.ts` module provides type-safe read and write functions for the application's configuration file (`~/.sanj/config.json`). This module enables all other initialization and configuration-related tasks to persist user preferences and settings across runs.

**What This Accomplishes**:
- Provides a centralized interface for reading and writing configuration
- Ensures configuration is stored in a predictable, inspectable JSON format
- Enables other tasks (init command, config command) to manage settings
- Establishes the contract for config structure used throughout the application

---

## Scope

### In Scope

1. **Config file location**: Use `~/.sanj/config.json` (via paths from 002-001)
2. **Read function**: Load and parse config.json into a typed Config object
3. **Write function**: Serialize and persist Config object to config.json
4. **Default config**: Generate sensible defaults when config doesn't exist
5. **Type definitions**: Define TypeScript interfaces for the config structure
6. **Error handling**: Graceful handling of missing/invalid config files
7. **Atomic writes**: Use safe file operations to prevent corruption

### Out of Scope

1. **Interactive config editing**: (handled by 006-002 in config command)
2. **Validation of config values**: (handled by 006-003)
3. **Cron scheduling setup**: (handled by 007-001)
4. **Config migration**: (future scope)

---

## Acceptance Criteria

### Reading Configuration

- [ ] `readConfig()` successfully reads valid config.json and returns typed Config object
- [ ] `readConfig()` returns default config if file doesn't exist (no error thrown)
- [ ] `readConfig()` handles malformed JSON gracefully with helpful error message
- [ ] `readConfig()` respects environment variable overrides if needed (e.g., for testing)

### Writing Configuration

- [ ] `writeConfig(config)` persists config object to config.json
- [ ] `writeConfig()` creates config.json if it doesn't exist
- [ ] `writeConfig()` uses atomic write (temp file + rename) to prevent corruption
- [ ] `writeConfig()` preserves JSON formatting for human readability (2-space indent)
- [ ] `writeConfig()` throws helpful error if directory doesn't exist

### Default Configuration

- [ ] Default config includes all required fields with sensible values
- [ ] Default config specifies an LLM adapter (e.g., "opencode" with model "zai-coding-plan/glm-4.7")
- [ ] Default config enables both Claude Code and OpenCode session adapters
- [ ] Default config enables writing to both CLAUDE.md and AGENTS.md
- [ ] Default config includes analysis window (e.g., 24 hours)
- [ ] Default config includes promotion thresholds (count and time)

### Type Safety

- [ ] Config object is fully typed with TypeScript interfaces
- [ ] All config keys are documented with JSDoc comments
- [ ] Type definitions match actual usage in other modules

### Integration Points

- [ ] Imports paths from `storage/paths.ts` (002-001)
- [ ] No circular dependencies with other modules
- [ ] Can be used by init command (002-003+)
- [ ] Can be used by config command (006-001+)
- [ ] Can be used by analyze command via AnalysisEngine

---

## Implementation Notes

### Config Structure

Based on the PRD, HLD, and JTBD documents, the config structure should include:

```typescript
interface Config {
  // LLM Configuration
  llm: {
    adapter: 'opencode' | 'claude'; // Which LLM adapter to use
    model: string; // Model name (e.g., "zai-coding-plan/glm-4.7" for OpenCode)
  };

  // Session Adapters (which tools to monitor)
  sessionAdapters: {
    claude_code: boolean; // Monitor Claude Code sessions
    opencode: boolean; // Monitor OpenCode sessions
  };

  // Memory Targets (where to write approved observations)
  memoryTargets: {
    claude_md: boolean; // Write to CLAUDE.md
    agents_md: boolean; // Write to AGENTS.md
  };

  // Analysis Configuration
  analysis: {
    window_hours: number; // How far back to analyze (e.g., 24)
  };

  // Promotion Thresholds
  promotion: {
    observation_to_longterm_count: number; // Min observation count (e.g., 3)
    longterm_to_core_count: number; // Min long-term count (e.g., 5)
    longterm_to_core_days: number; // Min days in long-term memory (e.g., 7)
  };

  // Version (for future migrations)
  version: string;
}
```

### Implementation Approach

1. **Imports**:
   - Import `Bun.file()` for file operations (Bun native API)
   - Import path constants from `storage/paths.ts`
   - Use `JSON.parse()` and `JSON.stringify()` for serialization

2. **Functions**:

   ```typescript
   // Read config from disk, return default if doesn't exist
   export async function readConfig(): Promise<Config>

   // Write config to disk (atomic)
   export async function writeConfig(config: Config): Promise<void>

   // Get default config
   export function getDefaultConfig(): Config
   ```

3. **Error Handling**:
   - Use try/catch for JSON parsing errors
   - Provide context in error messages (e.g., "Failed to parse config.json: ...")
   - Log to stderr but don't crash for missing config (return defaults)

4. **Atomic Writes**:
   - Write to temp file first: `${configPath}.tmp`
   - Use `Bun.file().text()` or similar for writing
   - Rename temp to actual path (atomic on most systems)
   - Clean up temp file if operation fails

### Dependencies

- **Dependency**: `storage/paths.ts` (002-001)
  - Use `getSanjConfigPath()` to get `~/.sanj/config.json` path
- **Depended on by**:
  - Init command (002-003+)
  - Config command (006-001+)
  - Any module that needs to read settings

### Testing

Verify the following in tests (written separately, not part of this task):

1. Reading valid config returns correct object
2. Reading missing config returns defaults
3. Reading malformed JSON throws helpful error
4. Writing creates file correctly
5. Writing overwrites existing file
6. Atomic write prevents corruption
7. Default config has all required fields

---

## Success Criteria Summary

- [ ] Module exports `readConfig()`, `writeConfig()`, and `getDefaultConfig()`
- [ ] All functions are async where needed (for file I/O)
- [ ] Config structure matches types defined in the module
- [ ] Can read from and write to `~/.sanj/config.json`
- [ ] Handles edge cases gracefully (missing files, malformed JSON)
- [ ] Properly integrates with `storage/paths.ts`
- [ ] Well-documented with JSDoc comments
- [ ] No console.log statements (use proper logging or error handling)
- [ ] Typed with TypeScript (strict mode compatible)

