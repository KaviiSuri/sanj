# Spec: Add Default Config Generation to Init Command

**Task ID**: 002-005
**JTBD Reference**: 002 - First-Time Setup
**Dependencies**: 002-002 (config read/write functions), 002-004 (directory creation)

---

## Purpose

This task implements the core logic of the `sanj init` command to generate a default configuration file with sensible defaults. This ensures that after directory structure is created, users have a valid, functional config immediately available for subsequent customization.

---

## Scope

### In Scope

- Generate `~/.sanj/config.json` with complete default configuration
- Define all configurable parameters needed by Sanj v1
- Ensure config schema is backwards-compatible (set up migration-friendly structure)
- Validate config generation (file created, parseable as JSON, all required keys present)
- Handle idempotent behavior (running `sanj init` again doesn't break config if it already exists)

### Out of Scope

- Interactive prompts for LLM adapter/model selection (task 002-006)
- Tool availability validation (task 002-007)
- User confirmation output display (task 002-008)
- Config validation beyond basic JSON structure
- Dynamic config schema generation from adapters

---

## Acceptance Criteria

1. **Default Config Creation**
   - Running task creates `~/.sanj/config.json` if it doesn't exist
   - Config is valid JSON (parseable with `JSON.parse()`)
   - All required fields are present with sensible defaults

2. **Config Schema**
   - `version`: String (e.g., "1.0.0") for migration tracking
   - `llmAdapter`: String enum specifying which LLM adapter to use (default: `"opencode"`)
   - `llmModel`: String specifying model name (default: `"zai-coding-plan/glm-4.7"`)
   - `sessionAdapters`: Object with boolean flags
     - `claude_code`: boolean (default: `true`)
     - `opencode`: boolean (default: `true`)
   - `memoryTargets`: Object with boolean flags
     - `claude_md`: boolean (default: `true`)
     - `agents_md`: boolean (default: `false`, as location is unclear)
   - `analysis`: Object with analysis settings
     - `windowDays`: number (default: `30` - look back 30 days for sessions)
   - `promotion`: Object with promotion thresholds
     - `observationToLongTerm`: number (default: `3` - need 3 occurrences)
     - `longTermToCore`: number (default: `10` - need 10 in long-term)
     - `daysInLongTerm`: number (default: `7` - must spend 7 days in long-term)
   - `cron`: Object with scheduling configuration
     - `enabled`: boolean (default: `false` - user enables via `sanj cron install`)
     - `analysisSchedule`: string (default: `"0 20 * * *"` - 8pm daily, crontab format)
     - `promotionSchedule`: string (default: `"0 10 * * 0"` - 10am Sunday, crontab format)

3. **Idempotent Behavior**
   - If `~/.sanj/config.json` already exists, do NOT overwrite it
   - Return success status indicating config was already present
   - Allow user to explicitly reset config (stretch goal for future)

4. **Error Handling**
   - If config.json cannot be written, throw descriptive error indicating file system issues
   - If parent directory doesn't exist, error appropriately (directory creation handled in 002-004)
   - Provide clear error messages for disk space/permission issues

5. **Type Safety**
   - Use TypeScript interfaces to define Config shape
   - Default function returns Config object matching interface
   - Validation ensures runtime config matches expected shape

---

## Implementation Notes

### Technical Guidance

#### Config Type Definition

Define in `src/storage/config.ts`:

```typescript
export interface Config {
  version: string;
  llmAdapter: "opencode" | "claude";
  llmModel: string;
  sessionAdapters: {
    claude_code: boolean;
    opencode: boolean;
  };
  memoryTargets: {
    claude_md: boolean;
    agents_md: boolean;
  };
  analysis: {
    windowDays: number;
  };
  promotion: {
    observationToLongTerm: number;
    longTermToCore: number;
    daysInLongTerm: number;
  };
  cron: {
    enabled: boolean;
    analysisSchedule: string;
    promotionSchedule: string;
  };
}
```

#### Default Factory Function

Implement `createDefaultConfig()` function:

```typescript
export function createDefaultConfig(): Config {
  return {
    version: "1.0.0",
    llmAdapter: "opencode",
    llmModel: "zai-coding-plan/glm-4.7",
    sessionAdapters: {
      claude_code: true,
      opencode: true,
    },
    memoryTargets: {
      claude_md: true,
      agents_md: false,
    },
    analysis: {
      windowDays: 30,
    },
    promotion: {
      observationToLongTerm: 3,
      longTermToCore: 10,
      daysInLongTerm: 7,
    },
    cron: {
      enabled: false,
      analysisSchedule: "0 20 * * *",
      promotionSchedule: "0 10 * * 0",
    },
  };
}
```

#### Usage in Init Command

In `src/cli/commands/init.ts`, use storage layer:

```typescript
import { readConfig, writeConfig, configExists } from "../../storage/config";
import { createDefaultConfig } from "../../storage/config";

export async function handleInit(ctx: CommandContext) {
  // ...directory creation from 002-004...

  // Only write config if it doesn't already exist
  if (!await configExists()) {
    const defaultConfig = createDefaultConfig();
    await writeConfig(defaultConfig);
    // Return status that config was generated
  } else {
    // Return status that config already exists
  }

  // ...continue to prompts and validation...
}
```

#### Reading and Validation

Enhance `src/storage/config.ts` with helper for loading with validation:

```typescript
export async function loadConfig(): Promise<Config> {
  const data = await Deno.readTextFile(getConfigPath());
  const config = JSON.parse(data) as unknown;
  // Basic validation: check all required keys exist
  validateConfig(config);
  return config as Config;
}

function validateConfig(config: unknown): asserts config is Config {
  if (typeof config !== "object" || config === null) {
    throw new Error("Config is not an object");
  }
  const c = config as Record<string, unknown>;
  if (typeof c.version !== "string") {
    throw new Error("Config.version must be a string");
  }
  // Validate other required fields...
}
```

### Notes on Defaults

- **llmAdapter "opencode"**: Chosen as default because it's more readily available as cross-platform tool; Claude Code integration can follow
- **windowDays 30**: Reasonable default giving weekly analysis enough data without looking back too far
- **observationToLongTerm 3**: Low threshold (3 observations) to promote patterns early; user can adjust
- **longTermToCore 10**: Higher threshold (10 total) ensures only stable patterns reach core memory
- **daysInLongTerm 7**: One-week stability check before core promotion
- **agents_md false**: Default disabled because global AGENTS.md location is still uncertain (see research notes); user can enable once confirmed

### Future Considerations

- Config versioning field allows safe migrations if schema changes in v2
- All thresholds are intentionally configurable for advanced users (see task 006-002)
- Cron scheduling is opt-in (requires explicit `sanj cron install`)

---

## Dependencies

| Task | Blocks This | How |
|------|------------|-----|
| 002-002 | This task | Provides `readConfig()`, `writeConfig()`, `getConfigPath()` functions |
| 002-004 | This task | Ensures `~/.sanj/` directory exists before attempting to write config |
| This task | 002-006 | Config must exist before interactive prompts can read/update it |
| This task | 002-007 | Tool validation will query config to determine which adapters to validate |

### Blocking Tasks

- 002-006: Add interactive prompts for LLM adapter selection (depends on generated config)
- 002-007: Add tool availability validation (depends on config to know which tools to check)

---

## Testing Strategy

### Unit Tests

1. **Config Creation**
   - Test `createDefaultConfig()` returns valid Config object
   - Verify all required fields are present
   - Verify types match interface

2. **Config Persistence**
   - Test writing config to file
   - Test reading back produces identical object
   - Test config is valid JSON

3. **Idempotent Behavior**
   - Test writing config when file doesn't exist
   - Test writing config when file already exists (should not overwrite)
   - Test reading existing config returns correct values

4. **Validation**
   - Test partial/corrupted config files raise appropriate errors
   - Test missing required fields detected
   - Test invalid field types rejected

### Mock Strategy

Use in-memory mock file system or temporary directories for testing. Do not read/write actual `~/.sanj/` during tests.

---

## Success Criteria Checklist

- [ ] Config type interface defined in storage/config.ts
- [ ] `createDefaultConfig()` function implemented and exported
- [ ] `configExists()`, `readConfig()`, `writeConfig()` functions working in storage layer
- [ ] `handleInit()` generates config if missing, respects existing config
- [ ] Config file is valid JSON with all expected fields
- [ ] Idempotent behavior verified (running init twice doesn't corrupt config)
- [ ] TypeScript compilation succeeds with no errors
- [ ] Unit tests pass for config creation, reading, and validation
