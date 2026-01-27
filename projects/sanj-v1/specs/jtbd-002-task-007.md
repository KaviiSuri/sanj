# Spec: Add Tool Availability Validation to Init Command

**Task ID**: 002-007
**JTBD Reference**: 002 - First-Time Setup
**Dependency**: 002-005 (Add default config generation to init command)
**Blocks**: 002-008 (Add confirmation output showing what was created)

---

## Purpose

Validate that required tools (Claude Code and/or OpenCode) are available in the user's PATH before completing the `sanj init` command. This prevents users from finishing setup only to discover they can't run analysis because necessary tools are missing.

**Key Goal**: Ensure that at least one LLM adapter is available on the system, and provide clear feedback about what's available vs. what's missing.

---

## Scope

### In Scope

- **SessionAdapter availability checks**: Verify Claude Code and OpenCode installations are discoverable
- **LLMAdapter availability checks**: Verify the selected LLM adapter tool is available
- **Clear error messaging**: Tell user which tools are missing and how to install them
- **Validation during init**: Run checks after config generation but before completion
- **Graceful handling**: Allow init to complete if at least one working adapter is available
- **Adapter-agnostic design**: Use existing adapter interface methods (e.g., `isAvailable()`)

### Out of Scope

- **Installing tools automatically**: We don't install Claude Code, OpenCode, or OpenAI CLI
- **Version checking**: We don't verify specific versions of tools
- **Path modification**: We don't modify PATH or environment variables
- **Conditional config generation**: Config is always generated; validation is separate
- **Blocking init on missing tools**: Init completes even if some tools are unavailable (but warns)

---

## Acceptance Criteria

### Validation Tests

1. **At least one SessionAdapter is available**
   - Check if Claude Code is installed (either `~/.claude/` directory exists OR `claude` command in PATH)
   - Check if OpenCode is installed (either `~/.local/share/opencode/` exists OR `opencode` command in PATH)
   - Warn if BOTH are missing, but allow init to continue
   - Record which session adapters are available in config

2. **Selected LLMAdapter is available**
   - If user selected "OpenCode" as LLM adapter, verify `opencode` command exists in PATH
   - If user selected "Claude Code" as LLM adapter, verify `claude` command exists in PATH
   - Require at least one available LLM adapter; fail init if none available
   - Show helpful error message with installation instructions

3. **Clear status output**
   - Display which tools were checked
   - Show which tools are available (✓)
   - Show which tools are missing (✗)
   - For missing tools, provide installation links or instructions

### Verification Steps

- Run `sanj init` and select OpenCode as LLM adapter with OpenCode installed → should succeed
- Run `sanj init` and select Claude Code as LLM adapter with Claude Code installed → should succeed
- Run `sanj init` with OpenCode selected but `opencode` not in PATH → should fail with clear error
- Run `sanj init` with both session tools unavailable → should warn but continue
- Config file should have fields indicating which adapters were available during init

---

## Implementation Notes

### Technical Approach

1. **Create validation utilities** (`src/utils/validation.ts` or similar):
   - `checkCommandExists(command: string): Promise<boolean>` - checks if command is in PATH
   - `checkPathExists(path: string): boolean` - checks if directory exists
   - `checkSessionAdaptersAvailable(): Promise<Map<string, boolean>>` - checks Claude Code and OpenCode
   - `checkLLMAdapterAvailable(adapter: string): Promise<boolean>` - checks selected LLM adapter

2. **Use existing adapter interfaces**:
   - SessionAdapters already have `isAvailable()` method defined in `SessionAdapter` interface
   - LLMAdapters already have `isAvailable()` method defined in `LLMAdapter` interface
   - Instantiate adapters and call their `isAvailable()` methods during validation

3. **Integration point in init command**:
   ```
   Init Flow:
   1. Create directories (from 002-004)
   2. Generate default config (from 002-005)
   3. Prompt for LLM adapter (from 002-006)
   4. [NEW] Validate tool availability
      - Get list of available session adapters
      - Validate selected LLM adapter is available
      - Store availability info in config
      - Display validation results to user
   5. Show confirmation output (to be implemented in 002-008)
   ```

4. **Config schema extension**:
   - Add `toolsAvailable` object to config tracking availability:
   ```json
   {
     "toolsAvailable": {
       "claudeCode": true/false,
       "openCode": true/false
     }
   }
   ```

5. **Error handling**:
   - If selected LLM adapter unavailable: show error and exit (code 1)
   - If no session adapters available: show warning but continue
   - Helpful error messages include:
     - What command/path was checked
     - How to install if missing (links to docs)
     - Which adapters could serve as fallback

6. **Command checking strategy**:
   - Use `which` command on Unix-like systems to check PATH
   - Handle Windows if needed (use `where` instead of `which`)
   - Suppress stderr to avoid ugly error messages
   - Cache results to avoid multiple checks

### Implementation Checklist

- [ ] Create validation utility functions for checking command/path existence
- [ ] Instantiate session adapters and call their `isAvailable()` methods
- [ ] Instantiate LLM adapter from user selection and call `isAvailable()`
- [ ] Update config schema to include `toolsAvailable` field
- [ ] Generate helpful error messages for missing tools
- [ ] Provide installation instructions for missing adapters
- [ ] Display validation results in readable format
- [ ] Fail init if selected LLM adapter unavailable
- [ ] Warn (but don't fail) if no session adapters available
- [ ] Test with various combinations of tools installed/not installed

### Dependencies & Interactions

- **Depends on**: 002-005 (config generation) - validation runs after config is created
- **Uses**: SessionAdapter.isAvailable() and LLMAdapter.isAvailable()
- **Uses**: Config read/write utilities from `storage/config.ts`
- **Affects**: Config file structure (adds `toolsAvailable` field)
- **Consumed by**: 002-008 (confirmation output will display validation results)

---

## Dependencies

| Dependency | Task ID | Description | Status |
|------------|---------|-------------|--------|
| Config generation | 002-005 | Default config must be generated first | Required |
| Storage setup | 002-004 | Directories must exist before validation | Required |
| Storage paths | 002-001 | Path constants for ~/.sanj/ | Required |
| CLI skeleton | 002-003 | Init command handler exists | Required |
| Session adapters | 003-003, 003-004 | SessionAdapter interface and implementations | Needed |
| LLM adapter | 003-006 | LLMAdapter interface and at least OpenCodeLLMAdapter | Needed |

---

## Notes

- This task ensures users have a working setup before completing init, preventing silent failures later
- Validation should be fast (just checking PATH and directories, not running tools)
- Error messages are critical for new users who may not have these tools installed
- The design allows graceful degradation if some adapters are missing, as long as one LLM adapter works
