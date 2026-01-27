# Task Spec: 006-003 - Add validation for config values with helpful errors

**JTBD**: 006 - Configuration Management
**Task ID**: 006-003
**Status**: Not Started
**Dependencies**: 006-002 (Implement config set subcommand for updating values)
**Blocks**: None

---

## Overview

Implement comprehensive validation for configuration values with clear, actionable error messages. When users attempt to set invalid config values via `sanj config set`, the system should reject them with helpful guidance on valid options and format requirements.

---

## Context

From the PRD and HLD, the `sanj config` command allows users to adjust Sanj's behavior:

```typescript
sanj config set <key> <value>
```

Current implementation (006-002) allows setting any value without validation. This task adds validation to:
- Prevent invalid configurations that would break functionality
- Guide users toward valid options
- Provide clear error messages that explain what went wrong

### Configurable Settings (from JTBD-006)

| Key | Type | Valid Values | Default |
|-----|------|--------------|---------|
| `llm_adapter` | enum | `opencode`, `claude` | `opencode` |
| `llm_model` | string | Adapter-specific | `zai-coding-plan/glm-4.7` |
| `session_adapters.claude_code` | boolean | `true`, `false` | `true` |
| `session_adapters.opencode` | boolean | `true`, `false` | `true` |
| `memory_targets.claude_md` | boolean | `true`, `false` | `true` |
| `memory_targets.agents_md` | boolean | `true`, `false` | `true` |
| `analysis_window_hours` | number | Integer >= 1 | `24` |
| `promotion_count_threshold` | number | Integer >= 1 | `3` |
| `promotion_time_threshold_days` | number | Integer >= 1 | `7` |

---

## Acceptance Criteria

### AC1: Enum Validation
- Setting `llm_adapter` to `opencode` or `claude` succeeds
- Setting `llm_adapter` to invalid value (e.g., `gpt4`, `deepseek`) shows error with valid options
- Error message format: `Error: Invalid value for llm_adapter. Must be one of: opencode, claude`

### AC2: Boolean Validation
- Setting boolean fields (session_adapters.*, memory_targets.*) with `true`/`false`/`yes`/`no`/`1`/`0` succeeds
- Setting with invalid value (e.g., `maybe`, `True`) shows error
- Error message format: `Error: Invalid value for memory_targets.claude_md. Must be a boolean (true/false).`

### AC3: Numeric Validation
- Setting threshold values with positive integers (>= 1) succeeds
- Setting with zero, negative, or decimal values fails
- Setting with non-numeric strings fails
- Error message format: `Error: Invalid value for analysis_window_hours. Must be an integer >= 1.`

### AC4: Model Validation
- When `llm_adapter` is `opencode`, `llm_model` values are not heavily validated (user may specify custom models)
- When setting `llm_model` to empty string, shows warning/error
- Error message format: `Error: Invalid value for llm_model. Model name cannot be empty.`

### AC5: At-Least-One-Adapter Rule
- Prevents disabling all session adapters (must have at least one enabled)
- Prevents disabling all memory targets (must have at least one enabled)
- Error message format: `Error: Cannot disable all session adapters. At least one must be enabled.`

### AC6: Nested Key Validation
- Validates nested keys like `session_adapters.claude_code`
- Rejects keys like `session_adapters.nonexistent`
- Error message format: `Error: Unknown config key: session_adapters.nonexistent`

### AC7: Helpful Error Context
- When validation fails, show which command succeeded last or which keys are currently set
- For enum fields, always list valid options
- For numeric fields, always state the constraint
- Example output:
  ```
  Error: Invalid value for llm_adapter. Must be one of: opencode, claude

  Current setting: opencode
  ```

---

## Implementation Details

### Validation Function Signature

```typescript
// src/storage/config.ts

interface ValidationError {
  key: string;
  value: unknown;
  message: string;
  suggestion?: string;
}

/**
 * Validates a config key-value pair
 * @param key The config key (e.g., 'llm_adapter', 'session_adapters.claude_code')
 * @param value The value to set
 * @param currentConfig The current full config (for context-aware validation)
 * @returns { valid: true } or { valid: false, error: ValidationError }
 */
function validateConfigValue(
  key: string,
  value: unknown,
  currentConfig: Config
): { valid: true } | { valid: false; error: ValidationError };
```

### Validation Rules Implementation

Each validation rule should:
1. Check type/format
2. Check constraints (enum, range, pattern)
3. Check cross-key constraints (at least one adapter/target enabled)
4. Build clear error message with suggestions

```typescript
// Example structure in validation module
const validationRules: Record<string, ValidationRule> = {
  llm_adapter: {
    type: 'enum',
    values: ['opencode', 'claude'],
    validate: (value) => {
      if (!['opencode', 'claude'].includes(String(value))) {
        return {
          valid: false,
          message: `Must be one of: opencode, claude`,
        };
      }
      return { valid: true };
    },
  },
  // ... more rules
};
```

### Config Set Command Integration

Update `sanj config set` handler to:

```typescript
// src/cli/commands/config.ts

async function handleConfigSet(key: string, value: string) {
  // Parse value based on expected type
  const parsedValue = parseConfigValue(key, value);

  // Validate
  const config = await loadConfig();
  const validation = validateConfigValue(key, parsedValue, config);

  if (!validation.valid) {
    console.error(`Error: Invalid value for ${validation.error.key}.`);
    console.error(`  ${validation.error.message}`);
    if (validation.error.suggestion) {
      console.error(`  ${validation.error.suggestion}`);
    }
    process.exit(1);
  }

  // Update and save
  const updated = setNestedKey(config, key, parsedValue);
  await saveConfig(updated);
  console.log(`✓ Updated ${key} = ${JSON.stringify(parsedValue)}`);
}
```

### Value Parsing

Parse user input strings to appropriate types:

```typescript
function parseConfigValue(key: string, value: string): unknown {
  // Booleans: recognize 'true', 'false', 'yes', 'no', '1', '0'
  if (key.includes('session_adapters.') || key.includes('memory_targets.')) {
    if (['true', 'yes', '1'].includes(value.toLowerCase())) return true;
    if (['false', 'no', '0'].includes(value.toLowerCase())) return false;
  }

  // Numbers: parse integers
  if (key.includes('_hours') || key.includes('_threshold') || key.includes('_days')) {
    const num = parseInt(value, 10);
    if (!isNaN(num)) return num;
  }

  // Default: treat as string
  return value;
}
```

### Cross-Key Validation

After individual validation, check constraints that span multiple keys:

```typescript
function validateConfigConsistency(
  updatedConfig: Config,
  changedKey: string
): ValidationError | null {
  // Rule: At least one session adapter must be enabled
  const sessionAdapters = updatedConfig.session_adapters;
  if (!sessionAdapters.claude_code && !sessionAdapters.opencode) {
    return {
      key: changedKey,
      value: updatedConfig[changedKey],
      message: 'Cannot disable all session adapters. At least one must be enabled.',
    };
  }

  // Rule: At least one memory target must be enabled
  const memoryTargets = updatedConfig.memory_targets;
  if (!memoryTargets.claude_md && !memoryTargets.agents_md) {
    return {
      key: changedKey,
      value: updatedConfig[changedKey],
      message: 'Cannot disable all memory targets. At least one must be enabled.',
    };
  }

  return null;
}
```

---

## Testing

### Unit Tests (tests/storage/config.test.ts)

```typescript
describe('validateConfigValue', () => {
  describe('llm_adapter validation', () => {
    test('accepts valid enum values', () => {
      expect(validateConfigValue('llm_adapter', 'opencode', config).valid).toBe(true);
      expect(validateConfigValue('llm_adapter', 'claude', config).valid).toBe(true);
    });

    test('rejects invalid enum values', () => {
      const result = validateConfigValue('llm_adapter', 'gpt4', config);
      expect(result.valid).toBe(false);
      expect(result.error.message).toContain('opencode');
      expect(result.error.message).toContain('claude');
    });
  });

  describe('boolean validation', () => {
    test('accepts boolean variations', () => {
      for (const val of ['true', 'True', 'TRUE', '1', 'yes', 'YES']) {
        const parsed = parseConfigValue('session_adapters.claude_code', val);
        const result = validateConfigValue('session_adapters.claude_code', parsed, config);
        expect(result.valid).toBe(true);
      }
    });

    test('rejects invalid boolean values', () => {
      const result = validateConfigValue('session_adapters.claude_code', 'maybe', config);
      expect(result.valid).toBe(false);
      expect(result.error.message).toContain('boolean');
    });
  });

  describe('numeric validation', () => {
    test('accepts positive integers', () => {
      expect(validateConfigValue('analysis_window_hours', 24, config).valid).toBe(true);
      expect(validateConfigValue('analysis_window_hours', 1, config).valid).toBe(true);
    });

    test('rejects zero and negative values', () => {
      let result = validateConfigValue('analysis_window_hours', 0, config);
      expect(result.valid).toBe(false);

      result = validateConfigValue('analysis_window_hours', -5, config);
      expect(result.valid).toBe(false);
    });

    test('rejects decimal values', () => {
      const result = validateConfigValue('analysis_window_hours', 24.5, config);
      expect(result.valid).toBe(false);
    });
  });

  describe('cross-key validation', () => {
    test('prevents disabling all session adapters', () => {
      const cfg = { ...config, session_adapters: { claude_code: false, opencode: false } };
      const error = validateConfigConsistency(cfg, 'session_adapters.opencode');
      expect(error).not.toBeNull();
      expect(error.message).toContain('at least one');
    });

    test('prevents disabling all memory targets', () => {
      const cfg = { ...config, memory_targets: { claude_md: false, agents_md: false } };
      const error = validateConfigConsistency(cfg, 'memory_targets.agents_md');
      expect(error).not.toBeNull();
      expect(error.message).toContain('at least one');
    });
  });
});
```

---

## Error Message Examples

### Example 1: Invalid Enum
```
$ sanj config set llm_adapter deepseek
Error: Invalid value for llm_adapter.
  Must be one of: opencode, claude
  Current setting: opencode
```

### Example 2: Invalid Boolean
```
$ sanj config set session_adapters.claude_code maybe
Error: Invalid value for session_adapters.claude_code.
  Must be a boolean (true/false, yes/no, 1/0)
  Current setting: true
```

### Example 3: Invalid Number (Out of Range)
```
$ sanj config set analysis_window_hours 0
Error: Invalid value for analysis_window_hours.
  Must be an integer >= 1
  Current setting: 24
```

### Example 4: Cross-Key Validation
```
$ sanj config set session_adapters.opencode false
Error: Cannot disable all session adapters.
  At least one of the following must be enabled:
    - session_adapters.claude_code
    - session_adapters.opencode
  Current settings:
    - session_adapters.claude_code: false
    - session_adapters.opencode: true
```

### Example 5: Unknown Key
```
$ sanj config set invalid_key value
Error: Unknown config key: invalid_key
  Valid keys are:
    - llm_adapter
    - llm_model
    - session_adapters.claude_code
    - session_adapters.opencode
    - memory_targets.claude_md
    - memory_targets.agents_md
    - analysis_window_hours
    - promotion_count_threshold
    - promotion_time_threshold_days
```

---

## Implementation Order

1. **Create validation rules map** with all validation functions
2. **Implement parseConfigValue** for type coercion
3. **Implement validateConfigValue** for individual field validation
4. **Implement validateConfigConsistency** for cross-key constraints
5. **Integrate validation into config set handler** (from task 006-002)
6. **Write unit tests** covering all validation scenarios
7. **Add manual testing** via CLI

---

## Deliverables

1. `src/storage/config.ts` - Enhanced with validation functions
2. `tests/storage/config.test.ts` - Comprehensive validation tests
3. Updated `src/cli/commands/config.ts` - Integration with error handling
4. Documentation in command help text about valid config values

---

## Success Criteria

- All AC1-AC7 acceptance criteria are met
- Error messages are clear and helpful
- At least 80% test coverage for validation logic
- No valid configurations are rejected
- Invalid configurations are caught before being saved
- Users can understand and fix config errors from the error message alone

---

## Notes

- Validation should be strict but user-friendly
- Error messages should always provide enough context to fix the issue
- Consider adding a `sanj config validate` command in future to check config without changing it
- Validation rules should be easy to extend for future config keys
