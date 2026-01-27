# Spec: 001-003 - Add help and version plugins to CLERC

## Task Reference

**Task ID**: 001-003
**JTBD**: 001 - CLI Foundation
**Task Name**: Add help and version plugins to CLERC
**Depends On**: 001-002 (Install CLERC and create CLI entry point)

---

## Purpose

This task implements CLERC's built-in help and version plugins to provide users with:
- Comprehensive help text for the CLI and all commands
- Version information display
- Proper formatting and discoverability

This accomplishes part of the CLI Foundation, making the tool user-friendly and discoverable by default.

---

## Scope

### In Scope

- Configure CLERC's help plugin with default behavior
- Configure CLERC's version plugin to display sanj version
- Ensure `sanj --help` displays detailed usage information
- Ensure `sanj -h` displays abbreviated help
- Ensure `sanj --version` displays version number
- Ensure `sanj -v` displays version number
- Ensure `sanj` (no command) displays help by default
- Add brief descriptions to all commands for help text
- Verify help text is properly formatted and readable

### Out of Scope

- Custom help formatting beyond CLERC defaults
- Command examples in help text (can be added in future)
- Interactive help features (help command subpages)
- Help text for flags/options (handled per-command)
- Version string generation logic (uses value from package.json)

---

## Acceptance Criteria

1. **Default Help Behavior**
   - `sanj` with no arguments displays help text
   - `sanj --help` displays detailed help
   - `sanj -h` displays abbreviated help
   - Help output is clear and readable

2. **Version Information**
   - `sanj --version` displays version number
   - `sanj -v` displays version number
   - Version is read from package.json or hardcoded in source
   - Version output is in format: "sanj x.y.z" or similar standard format

3. **Command Descriptions**
   - All commands are listed in help output
   - Each command has a brief 1-line description
   - Descriptions are accurate and helpful
   - Commands shown: init, analyze, review, status, config, cron

4. **Integration with Existing Code**
   - Plugins are enabled in src/cli/index.ts from task 001-002
   - No breaking changes to existing command structure
   - Help plugin doesn't interfere with command execution

5. **Testing (Manual)**
   - Run `sanj` and verify help appears
   - Run `sanj --help` and verify output
   - Run `sanj -h` and verify output
   - Run `sanj --version` and verify output
   - Run `sanj -v` and verify output
   - Unknown command shows helpful error message

---

## Implementation Notes

### CLERC Plugin System

CLERC provides two built-in plugins:

```typescript
import { helpPlugin, versionPlugin } from "clerc";

Cli()
  .use(helpPlugin())
  .use(versionPlugin("1.0.0"))
  .parse();
```

### Help Plugin Configuration

- Automatically discovers all registered commands
- Displays each command with its description
- Generates standard help output without customization needed

### Version Plugin Configuration

- Takes a string argument: the version number
- Can be hardcoded ("1.0.0") or read from package.json
- Displays when `--version` or `-v` is used

### Command Descriptions

Commands need descriptions registered during definition:

```typescript
Cli()
  .command("init", "Initialize sanj with default settings")
  .command("analyze", "Analyze recent coding sessions")
  .command("review", "Review and approve pending observations")
  .command("status", "Show current state and pending items")
  .command("config", "View or edit configuration settings")
  .command("cron", "Manage scheduled automation")
```

### Version String Handling

Two options:
1. **Hardcoded**: `versionPlugin("1.0.0")` in code
2. **From package.json**: Read version field and pass to plugin

Recommended: Read from package.json for DRY principle. Can use Node.js require() or async import.

### Integration with Task 001-002

In src/cli/index.ts (from task 001-002), add:

```typescript
import { Cli, helpPlugin, versionPlugin } from "clerc";

export async function createCli() {
  const pkg = await import("../package.json", { assert: { type: "json" } });

  return Cli()
    .scriptName("sanj")
    .use(helpPlugin())
    .use(versionPlugin(pkg.default.version))
    // ... commands ...
    .parse();
}
```

Or simpler with hardcoded version for initial implementation:

```typescript
return Cli()
  .scriptName("sanj")
  .use(helpPlugin())
  .use(versionPlugin("1.0.0"))
```

### Error Handling

- CLERC automatically handles unknown commands
- Help plugin should be enabled before all commands
- Version plugin should be enabled globally

---

## Dependencies

### External Dependencies
- **clerc**: CLI framework (already installed in 001-002)
- **package.json**: Source of version information

### Internal Dependencies
- src/cli/index.ts (from 001-002)

### File Changes
- **Modify**: /src/cli/index.ts - Add help and version plugins

---

## Technical Guidance

### CLERC Plugin API

Both plugins are imported from the `clerc` package:

```typescript
import { helpPlugin, versionPlugin } from "clerc";
```

### Plugin Installation Order

Plugins should be registered before commands are defined to ensure they apply globally:

```typescript
Cli()
  .scriptName("sanj")
  .use(helpPlugin())  // First
  .use(versionPlugin("1.0.0"))  // Second
  .command(...)  // Then commands
  .parse()
```

### Testing Help Output

Manually verify the output with:
```bash
$ bun run src/cli/index.ts --help
$ bun run src/cli/index.ts -v
```

Or if package.json bin is configured (task 001-005):
```bash
$ sanj --help
$ sanj --version
```

### Common Issues

1. **Version not updating**: If reading from package.json, ensure the import path is correct
2. **Help not appearing**: Ensure helpPlugin() is called (with parentheses) and registered with `.use()`
3. **Command descriptions missing**: Each command needs a description string parameter

---

## Success Indicators

✓ `sanj` displays help by default
✓ `sanj --help` shows detailed usage
✓ `sanj --version` shows version number
✓ All commands listed with descriptions in help output
✓ No errors when plugins are enabled
✓ Plugin integration doesn't break existing command structure
✓ Help output is readable and properly formatted

---

## Related Tasks

- **001-001**: Initialize Bun project (provides package.json)
- **001-002**: Install CLERC and create CLI entry point (provides base to extend)
- **001-004**: Add not-found error handling (complements help plugin)
- **001-005**: Configure global installation (uses help/version plugins)
