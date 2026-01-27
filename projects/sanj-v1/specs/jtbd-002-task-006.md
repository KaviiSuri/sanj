# Spec: Task 002-006 - Add Interactive Prompts for LLM Adapter Selection

**Task ID**: 002-006
**JTBD Reference**: 002 - First-Time Setup
**Dependency**: 002-005 (Add default config generation to init command)

---

## Purpose

Enable users to select their preferred LLM adapter (OpenCode or Claude Code) during the first-time setup (`sanj init`) with interactive prompts, allowing them to configure which AI tool will be used for pattern analysis.

This task completes the user-facing setup flow by replacing hardcoded defaults with user choice, ensuring the tool respects individual preferences from the start.

---

## Scope

### In Scope

- Interactive CLI prompt asking user to choose between OpenCode and Claude Code as the LLM adapter
- Follow-up prompt to select a specific model for the chosen adapter
  - For OpenCode: suggest `zai-coding-plan/glm-4.7` as default, allow custom input
  - For Claude Code: suggest `claude-3.5-sonnet` as default (or latest available), allow custom input
- Validation that selected values are reasonable (non-empty, valid format)
- Update config.json with user selections
- Graceful handling if user cancels (Ctrl+C) - should exit without making changes
- Clear, friendly prompts that guide the user

### Out of Scope

- Validating that the selected LLM is actually installed (that happens in task 002-007)
- Testing the LLM connection (no API calls in the prompts themselves)
- Storing model parameters or API keys (only model name goes in config)
- Supporting additional LLM adapters beyond OpenCode and Claude Code in v1
- Custom prompt engineering or model tuning

---

## Acceptance Criteria

### Functional Requirements

1. **LLM Adapter Selection Prompt**
   - [ ] When `sanj init` runs, after config directory is created and default config is generated, user sees: "Which LLM adapter would you like to use? (1) OpenCode (2) Claude Code"
   - [ ] User can enter 1 or 2 to select
   - [ ] Invalid input shows helpful error and re-prompts (max 3 attempts before failing)
   - [ ] Selection is stored in `config.json` under `config.llmAdapter` (value: "opencode" or "claude")

2. **Model Selection Prompt**
   - [ ] After LLM adapter is selected, user sees: "Which model for [selected adapter]? (default: [suggested model])"
   - [ ] User can press Enter to accept default or type a custom model name
   - [ ] Custom input is validated (non-empty, no special characters except `-` and `/`)
   - [ ] Selection is stored in `config.json` under `config.modelName`

3. **Config Persistence**
   - [ ] Both selections are written to `config.json` before command completes
   - [ ] Config structure matches expectations from task 002-005:
     ```json
     {
       "llmAdapter": "opencode",  // or "claude"
       "modelName": "zai-coding-plan/glm-4.7",  // or user selection
       "sessionAdapters": { ... },
       "memoryTargets": { ... },
       "analysisWindow": { ... },
       "promotionThresholds": { ... }
     }
     ```

4. **Error Handling**
   - [ ] If user cancels with Ctrl+C during prompts, command exits cleanly without partial config
   - [ ] If config.json becomes invalid during write, appropriate error is shown and user can re-run init
   - [ ] Helpful error messages if config file can't be written

### Verification Steps

1. Run `sanj init` in a fresh environment (or with `~/.sanj/` not yet initialized)
2. Verify first prompt appears asking for LLM adapter choice
3. Enter "1" for OpenCode - verify no error and next prompt appears
4. Verify model selection prompt suggests "zai-coding-plan/glm-4.7"
5. Press Enter to accept default - verify config.json is created with correct values
6. Check `~/.sanj/config.json` contains:
   ```json
   {
     "llmAdapter": "opencode",
     "modelName": "zai-coding-plan/glm-4.7",
     ...
   }
   ```
7. Run `sanj init` again - verify idempotency (command completes without breaking existing config)
8. Test with "2" for Claude Code - verify different default suggestion and correct storage
9. Test canceling with Ctrl+C during prompt - verify clean exit

---

## Implementation Notes

### Technical Guidance

#### Prompt Library

Use a simple prompt library (built-in Bun/Node APIs or a lightweight package) to handle interactive input. Options:
- **Built-in approach**: Use `readline` from Node.js stdlib (works in Bun)
- **Lightweight package**: Consider `prompts` or `enquirer` if they work well with Bun

Keep implementation minimal - just need to read lines from stdin and write to stdout.

#### Suggested Defaults

```typescript
const adapterDefaults = {
  opencode: "zai-coding-plan/glm-4.7",
  claude: "claude-3.5-sonnet"  // or dynamically query available models
};
```

Update these if newer stable versions become recommended.

#### Prompt Flow

```
┌─ sanj init
│  ├─ Create ~/.sanj/ and directories (task 002-004)
│  ├─ Generate default config (task 002-005)
│  ├─ [NEW] Prompt for LLM adapter selection
│  │  └─ User selects: 1 (OpenCode) or 2 (Claude Code)
│  ├─ [NEW] Prompt for model selection
│  │  └─ User enters model name or accepts default
│  ├─ Save config.json with selections (task 002-005 writes defaults, this updates)
│  ├─ Validate tool availability (task 002-007)
│  └─ Show confirmation (task 002-008)
```

#### Code Organization

The prompts should live in `src/cli/commands/init.ts` as helper functions:

```typescript
async function promptForAdapter(): Promise<"opencode" | "claude"> {
  // Read from stdin, validate, return selection
}

async function promptForModel(adapter: "opencode" | "claude"): Promise<string> {
  // Show default, read from stdin, validate, return model name
}
```

These get called after default config generation and before tool validation.

#### Idempotency Consideration

Since `sanj init` is idempotent (safe to run again), we have two options:
1. **Skip prompts if config already exists** - Safer, but user can't change LLM adapter without editing config manually
2. **Always prompt** - More interactive, but might annoy users who run init again

**Recommendation**: Skip prompts if config already has valid `llmAdapter` and `modelName` set. Show a message: "sanj is already initialized. Run `sanj config` to change settings."

#### Cancellation Handling

If user presses Ctrl+C:
- Catch SIGINT or readline closure
- Do NOT save partial config
- Exit with code 1 and message: "Setup cancelled."

#### Input Validation Examples

```typescript
// Adapter validation
const validAdapters = ["1", "2"];
if (!validAdapters.includes(input)) {
  throw new Error("Please enter 1 or 2");
}

// Model name validation
const modelRegex = /^[a-zA-Z0-9._\-/]+$/;
if (!modelRegex.test(modelName)) {
  throw new Error("Model name can only contain letters, numbers, hyphens, slashes, dots, and underscores");
}
```

### Dependencies

- **Existing**: `src/storage/config.ts` (from task 002-002) for writing config
- **New**: Readline or lightweight prompt library
- **Related tasks**: 002-005 (default config), 002-007 (tool validation), 002-008 (confirmation)

### Testing Considerations

- Mock stdin for unit tests
- Test each prompt independently (adapter selection, model selection)
- Test invalid inputs and retry logic
- Test Ctrl+C cancellation
- Test idempotency (running init when config already exists)
- Test with both adapters (OpenCode and Claude)

---

## Dependencies

**Depends On**:
- 002-005: Add default config generation (must exist before we can update it)

**Blocked By**:
- None (independent implementation once 002-005 completes)

**Blocks**:
- 002-007: Tool availability validation (needs this prompt to know which adapter to validate)
- 002-008: Confirmation output (shows what was configured, including selections made here)

---

## Related Files

**Will Modify**:
- `/src/cli/commands/init.ts` - Add prompt functions and call them in sequence

**Will Read**:
- `/src/storage/config.ts` - Use config write/read functions

**Will Create**:
- None (implementation fits within existing init command)

---

## Notes

- Keep prompts concise and friendly
- Use clear numbering (1, 2) for multiple choice to avoid confusion
- Display the default suggestion in parentheses so users know they can press Enter
- Error messages should be specific: "Please enter 1 or 2" rather than "Invalid input"
- Consider adding a `--non-interactive` flag for scripting in future (not v1)
