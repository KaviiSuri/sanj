# Task Spec: 006-002 - Implement config set subcommand for updating values

**JTBD**: 006 - Configuration Management
**Task ID**: 006-002
**Status**: Pending
**Dependencies**: 006-001 (config view command must exist first)

---

## Overview

Implement the `sanj config set <key> <value>` subcommand that allows users to update individual configuration values. This task extends the existing config command (006-001) with the ability to modify settings and persist changes to `~/.sanj/config.json`.

---

## Success Criteria

1. **Command syntax works**: `sanj config set <key> <value>` is recognized and parsed
2. **Values are updated**: Configuration changes are written to `~/.sanj/config.json`
3. **Validation is deferred**: Invalid values are caught and reported (see task 006-003)
4. **Feedback is clear**: User receives confirmation of what was changed
5. **Backwards compatible**: Existing config values remain untouched if not specified
6. **Persistent**: Changes survive across CLI invocations

---

## Implementation Details

### Command Interface

```bash
sanj config set <key> <value>
```

**Examples**:
```bash
sanj config set llm_adapter opencode
sanj config set model zai-coding-plan/glm-4.7
sanj config set analysis_window_days 7
sanj config set enable_claude_code true
sanj config set enable_agents_md false
```

### Configuration Keys

Based on the PRD and JTBD documentation, the following keys should be settable:

| Key | Type | Description | Default |
|-----|------|-------------|---------|
| `llm_adapter` | string | LLM provider (opencode / claude) | "opencode" |
| `model` | string | Model name/identifier | "zai-coding-plan/glm-4.7" |
| `analysis_window_days` | number | How far back to analyze sessions | 7 |
| `promotion_threshold_count` | number | Observation count needed for promotion | 3 |
| `promotion_threshold_days` | number | Days in long-term before core promotion | 14 |
| `enable_claude_code` | boolean | Analyze Claude Code sessions | true |
| `enable_opencode` | boolean | Analyze OpenCode sessions | true |
| `enable_claude_md` | boolean | Write to CLAUDE.md | true |
| `enable_agents_md` | boolean | Write to AGENTS.md | false |

### Output

**On success**:
```
✓ Updated config
  llm_adapter: opencode → claude
```

**On error** (handled by 006-003):
```
✗ Invalid value for llm_adapter
  Expected: opencode | claude
  Got: invalid_adapter
```

### Implementation Location

**Main file**: `/src/cli/commands/config.ts`

The existing `config` command (from 006-001) should be extended to handle the `set` subcommand. The structure should look like:

```typescript
// src/cli/commands/config.ts

export function setupConfigCommand(cli: Cli) {
  cli
    .command("config", "View or modify configuration")
    .command("config", "Show all settings")  // Default action
    .on("config", handleConfigView)

    .command("config set <key> <value>", "Update a configuration value")
    .on("config set", handleConfigSet);
}

async function handleConfigSet(ctx: Context) {
  const { key, value } = ctx.args;
  // Implementation here
}
```

### Core Logic

1. **Parse input**:
   - Extract `<key>` and `<value>` from command arguments
   - Both are strings initially (validation is 006-003)

2. **Load current config**:
   - Use `storage/config.ts` functions to read existing config
   - Handle case where config doesn't exist (should error—init must be run first)

3. **Type coercion**:
   - Attempt to coerce string value to expected type
   - `"true"` / `"false"` → boolean
   - Numeric strings → number
   - Everything else stays string
   - **Do not validate** if value is valid—that's 006-003

4. **Update config object**:
   - Apply the key/value change to the loaded config
   - Preserve all existing values

5. **Write to disk**:
   - Use `storage/config.ts` to write updated config
   - Ensure `~/.sanj/config.json` is updated atomically

6. **Provide feedback**:
   - Show old value → new value
   - Use clear, concise output

### Usage Examples

```bash
# Change LLM adapter
$ sanj config set llm_adapter claude
✓ Updated config
  llm_adapter: opencode → claude

# Change a boolean setting
$ sanj config set enable_agents_md true
✓ Updated config
  enable_agents_md: false → true

# Change a numeric setting
$ sanj config set analysis_window_days 14
✓ Updated config
  analysis_window_days: 7 → 14
```

### Error Handling (Deferred to 006-003)

The following errors should be caught by 006-003 (validation):
- Invalid key (doesn't exist in schema)
- Invalid value type or format (e.g., non-numeric string for `analysis_window_days`)
- Out of range values (e.g., negative days)

For now, this task just writes the value without validation. Invalid values will be caught on 006-003.

---

## Testing

**Unit tests** should cover:
1. Successfully updating a single config value
2. Preserving other config values when updating one
3. Type coercion (boolean parsing, number parsing)
4. Clear feedback message format
5. File persistence (value is read back on next read)
6. Handling missing config file (error)

**Test file**: `/tests/cli/commands/config.test.ts`

Example:
```typescript
describe("config set", () => {
  it("should update a config value", async () => {
    // Setup: create test config
    const config = { llm_adapter: "opencode", model: "glm-4.7" };
    // Run: update one value
    // Assert: new value written, old value preserved
  });

  it("should coerce boolean strings", async () => {
    // "true" should become true, "false" should become false
  });

  it("should preserve other config values", async () => {
    // Update one key, verify others unchanged
  });
});
```

---

## Dependencies

**Code Dependencies**:
- `storage/config.ts`: Read/write config (created in 002-002)
- `storage/paths.ts`: Config file path constant (created in 002-001)
- CLERC CLI framework (from 001-002)

**Task Dependencies**:
- 006-001: Config view command must exist
- 002-002: Config read/write utilities must exist
- 002-001: Storage paths must be defined

---

## Acceptance Criteria Checklist

- [ ] `sanj config set <key> <value>` command is recognized by CLERC
- [ ] Configuration values are loaded from `~/.sanj/config.json`
- [ ] Specified key/value is updated in the loaded config
- [ ] Type coercion is applied (boolean strings, numeric strings)
- [ ] Updated config is written back to disk atomically
- [ ] User receives confirmation showing before → after
- [ ] All other config values are preserved
- [ ] Missing config file causes helpful error
- [ ] Unit tests pass (at least 5 test cases)
- [ ] No validation of values happens (that's task 006-003)

---

## Related Files

**Files this task modifies**:
- `/src/cli/commands/config.ts` - Add set subcommand handler

**Files this task depends on**:
- `/src/storage/config.ts` - Read/write utilities
- `/src/storage/paths.ts` - Config file path
- `/src/core/types.ts` - Config type definition

**Files this task enables**:
- Task 006-003 (validation) builds on this

---

## Notes

- This task intentionally does NOT validate values. Invalid values are caught in 006-003.
- Type coercion should be lenient (parse what we can, let 006-003 be strict)
- Feedback should always show the change clearly (before → after format)
- Atomic writes are important to avoid corrupting config if process crashes mid-write
