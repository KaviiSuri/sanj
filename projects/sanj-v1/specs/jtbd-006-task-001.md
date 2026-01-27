# Specification: 006-001 - Implement config command showing current settings

## Overview

Implement the `sanj config` subcommand that displays the current configuration settings to the user. This is the view-only portion of configuration management, showing what settings are currently in place.

**Task ID**: 006-001
**JTBD**: 006 - Configuration Management
**Depends On**: 001-002 (CLERC CLI entry point), 002-002 (config.ts storage module)
**Blocks**: 006-002 (config set subcommand)

---

## Context

Sanj is a CLI tool that monitors AI coding assistant sessions and manages a hierarchical memory system. Users need to be able to view their current configuration to understand what LLM they're using, which session adapters are enabled, and other key settings. This task implements the read-only view of configuration.

**Related Components**:
- CLI Layer: CLERC-based command routing
- Storage Layer: `src/storage/config.ts` module that handles reading/writing config.json
- Config file location: `~/.sanj/config.json`

---

## Requirements

### Functional Requirements

1. **View Current Configuration**
   - `sanj config` displays all current settings
   - Output is human-readable and clearly formatted
   - Shows the file path where config is stored

2. **Configuration Fields to Display**
   - LLM adapter (opencode or claude)
   - LLM model name
   - Enabled session adapters (claude_code: true/false, opencode: true/false)
   - Enabled memory targets (claude_md: true/false, agents_md: true/false)
   - Analysis window (how far back to look in sessions)
   - Promotion thresholds:
     - Count required for observation → long-term
     - Count required for long-term → core
     - Time required in long-term before core promotion (in days)
   - Last analysis timestamp (if available)

3. **Error Handling**
   - If config file doesn't exist, show helpful error: "Config not found. Run `sanj init` first."
   - If config file is corrupted, show error and suggest re-running init
   - Non-zero exit code (1) on error

4. **Success Case**
   - Display all settings in organized sections
   - Exit code 0 on successful display

### Non-Functional Requirements

1. **Performance**
   - Command should execute instantly (< 100ms)
   - No network calls
   - Only reads from local filesystem

2. **Usability**
   - Output should be scannable (use section headers)
   - One setting per line or grouped logically
   - Use consistent formatting (e.g., "Key: value" pattern)

3. **Consistency**
   - Follow Sanj's CLI output conventions
   - Match styling with other commands (status, etc.)

---

## Implementation Details

### Command Structure

```bash
sanj config
```

No subcommands or flags for this task (those come in 006-002).

### Output Format

```
Config Location: ~/.sanj/config.json

LLM Configuration
  Adapter: opencode
  Model: zai-coding-plan/glm-4.7

Session Adapters
  Claude Code: true
  OpenCode: true

Memory Targets
  CLAUDE.md: true
  AGENTS.md: true

Analysis Settings
  Analysis Window: 7 days

Promotion Thresholds
  Observation → Long-Term: 3 occurrences
  Long-Term → Core: 5 occurrences
  Time in Long-Term: 7 days

Last Analysis Run: 2025-01-25 14:32:00 UTC
```

Alternative: Display as JSON for machine-readability if needed (can be added as flag in 006-002).

### Implementation Steps

1. **Create command handler** in `src/cli/commands/config.ts`
   - Accept no arguments or flags
   - Load config using config.ts module
   - Format and display output
   - Handle errors appropriately

2. **Update CLI routing** in `src/cli/index.ts`
   - Register the `config` command with CLERC
   - Wire it to the config handler

3. **Output formatting** in `src/cli/utils/output.ts` (if file exists)
   - Create helper function for displaying structured settings
   - Use consistent spacing and section headers

4. **Error messages**
   - Missing config: "Config not found. Run `sanj init` first."
   - Invalid JSON: "Config file is corrupted. Run `sanj init` to reset."
   - Other file errors: Show appropriate system error with suggestion

### Code Structure

```typescript
// src/cli/commands/config.ts

import { Cli } from "clerc";
import { readConfig } from "../../storage/config";

export const configCommand = (cli: Cli) => {
  cli
    .command("config", "Show current configuration")
    .on("config", async (ctx) => {
      try {
        const config = await readConfig();
        displayConfig(config);
        process.exit(0);
      } catch (error) {
        console.error("Error reading config:", error.message);
        console.error("Tip: Run `sanj init` to initialize configuration");
        process.exit(1);
      }
    });
};

function displayConfig(config: any): void {
  // Implement formatting logic here
  // Display config structure as shown above
}
```

### Integration Points

1. **Depends on**: `src/storage/config.ts`
   - Must export `readConfig(): Promise<Config>`
   - Config interface defined in `src/core/types.ts`

2. **Depends on**: `src/cli/index.ts`
   - Must wire command into CLERC setup

3. **Output utils**: Optional use of formatting helpers from `src/cli/utils/output.ts`

---

## Testing Strategy

### Unit Tests

1. **Config display with valid config**
   - Load sample config.json
   - Verify all fields are displayed
   - Check output formatting

2. **Config not found error**
   - Test with missing config file
   - Verify error message and exit code 1

3. **Corrupted config file**
   - Test with invalid JSON
   - Verify error message suggests re-initialization

4. **Partial/missing fields in config**
   - Test with minimal config (ensure defaults are used)
   - Verify graceful degradation

### Manual Testing

1. Run `sanj config` after `sanj init` and verify output is readable
2. Run `sanj config` before initialization and verify helpful error
3. Manually corrupt config.json and test error handling

---

## Acceptance Criteria

- [ ] `sanj config` command is registered in CLERC
- [ ] Command displays all configuration fields
- [ ] Output is formatted clearly with sections and headers
- [ ] File path to config is shown at top of output
- [ ] Error message shown if config doesn't exist
- [ ] Error message shown if config is corrupted
- [ ] Exit code is 0 on success, 1 on error
- [ ] Command runs instantly (no unnecessary delays)
- [ ] Output matches Sanj's style guidelines
- [ ] Unit tests cover happy path and error cases

---

## Dependencies & Blockers

**Must be completed before**:
- 006-002: Implement config set subcommand

**Depends on**:
- 001-002: CLERC CLI entry point must exist
- 002-002: Config storage module must be implemented

---

## Future Enhancements (Not in v1)

- Add `--json` flag to output as JSON for scripting
- Add `--only <section>` flag to show just one section
- Interactive config editor mode (`sanj config edit`)
- Config validation and suggestions for invalid values
