# Spec: Task 001-002 - Install CLERC and Create CLI Entry Point

## Task Identification

**Task ID**: 001-002
**JTBD**: 001 - CLI Foundation
**Title**: Install CLERC and create CLI entry point in src/cli/index.ts
**Dependency**: 001-001 (Initialize Bun project with package.json and tsconfig.json)
**Blocks**: 001-003, 001-004, 001-005, 002-003, 003-012, 004-014, 005-001, 006-001, 007-001, 007-002

---

## Purpose

This task establishes the foundational CLI infrastructure for Sanj using CLERC. It creates the main entry point that routes user commands to appropriate handlers and provides the base structure for all CLI functionality. This is the critical foundation that all other commands (init, analyze, review, status, config, cron) depend on.

---

## Scope

### In Scope

1. **Install CLERC dependency**
   - Add `clerc` package to package.json as a regular dependency
   - Verify installation works with Bun

2. **Create CLI entry point**
   - Create `/src/cli/index.ts` as the main CLERC application
   - Set script name to "sanj"
   - Set initial version to "1.0.0"
   - Configure chainable CLERC API for command definitions

3. **Implement command structure**
   - Establish routing for six main commands:
     - `sanj init` - First-time setup
     - `sanj analyze` - Run session analysis
     - `sanj review` - Open TUI for approval
     - `sanj status` - Show status summary
     - `sanj config` - View/edit configuration
     - `sanj cron` - Manage scheduling
   - Each command should have a basic handler that acknowledges the command
   - Commands can be stubs/placeholders (full implementation in later tasks)

4. **Export and invoke**
   - Make index.ts executable (using shebang or bun module)
   - Ensure `Cli().parse()` is called to process CLI arguments

### Out of Scope

1. **Command implementations** - Handlers will be stubs that print "Not yet implemented"
2. **Help/version plugins** - These are added in 001-003
3. **Error handling plugins** - Not-found handler is added in 001-004
4. **Global installation setup** - Configured in 001-005
5. **Subcommand structure** - Only single-level commands for now (not nested like `cron install`)
6. **Configuration defaults** - These are defined in 002-001 and 002-002

---

## Acceptance Criteria

### Verification Steps

1. **CLERC Installation**
   - [ ] `bun install` completes successfully
   - [ ] CLERC appears in package.json dependencies
   - [ ] CLERC types are available for TypeScript

2. **CLI Entry Point Created**
   - [ ] File exists at `/src/cli/index.ts`
   - [ ] File compiles with `bun build` without errors
   - [ ] File can be run with `bun run src/cli/index.ts`

3. **Command Routing Works**
   - [ ] `bun run src/cli/index.ts init` prints acknowledgment
   - [ ] `bun run src/cli/index.ts analyze` prints acknowledgment
   - [ ] `bun run src/cli/index.ts review` prints acknowledgment
   - [ ] `bun run src/cli/index.ts status` prints acknowledgment
   - [ ] `bun run src/cli/index.ts config` prints acknowledgment
   - [ ] `bun run src/cli/index.ts cron` prints acknowledgment

4. **Script Metadata**
   - [ ] Running with no args shows basic output (will be help in 001-003)
   - [ ] Script name shows "sanj" in any error messages
   - [ ] Version is set to "1.0.0" (will be displayed in 001-003)

5. **Exit Codes**
   - [ ] Successful command execution returns exit code 0
   - [ ] Unknown command returns non-zero exit code (will be 1 in 001-004)

6. **TypeScript Compilation**
   - [ ] No TypeScript errors with strict mode
   - [ ] Types imported correctly from CLERC
   - [ ] CLERC context types are properly inferred

---

## Implementation Notes

### Technical Guidance

#### CLERC Setup Pattern

From the research (01-research.md), the basic CLERC pattern is:

```typescript
import { Cli } from "clerc";

Cli()
  .scriptName("sanj")
  .version("1.0.0")
  .command("init", "Initialize sanj")
  .on("init", (ctx) => { /* handler */ })
  .command("analyze", "Analyze recent sessions")
  .on("analyze", (ctx) => { /* handler */ })
  .parse();
```

This will serve as the template for our entry point.

#### Command Handlers

Each command handler receives a `ctx` parameter from CLERC. The context object provides:
- `args`: Positional arguments (Array<string>)
- `flags`: Parsed flags object
- `raw`: Original raw arguments

For now, handlers should be minimal, e.g.:

```typescript
.on("init", (ctx) => {
  console.log("sanj init - Not yet implemented");
})
```

#### File Structure

Create only what's needed for this task:
- `/src/cli/index.ts` - Main CLERC application
- Update `/package.json` - Add CLERC dependency
- No need to create `/src/cli/commands/` yet (that's for later tasks)

#### Import/Export Considerations

- CLERC is ESM-only, which is compatible with Bun
- Use `import { Cli } from "clerc"`
- For now, just ensure the code runs with `bun run src/cli/index.ts`
- Global installation shebang will be added in 001-005

#### Error Handling for Unknown Commands

Keep this minimal for now:
- Unknown commands will produce natural CLERC errors
- Proper not-found handling with custom message will be added in 001-004
- For now, just let CLERC's default behavior occur

#### Chainable API Order

CLERC uses a chainable API. The recommended order is:
1. `.scriptName()` - Set the script name
2. `.version()` - Set version (though won't be displayed until 001-003 adds plugin)
3. `.command()` and `.on()` pairs - Define all commands
4. `.parse()` - Process arguments

Ensure all commands are defined before calling `.parse()`.

---

## Dependencies

### Upstream Dependencies
- **001-001**: Must have a Bun project initialized with package.json and tsconfig.json
  - package.json with basic metadata
  - TypeScript configured (tsconfig.json)
  - src/ directory exists

### External Dependencies
- **CLERC v1.0.0+**: CLI framework for Node.js, Deno, Bun
  - Should be added to regular dependencies (not devDependencies)
  - TypeScript types are built-in

### Downstream Dependencies (Tasks Blocked by This)
- **001-003**: Add help and version plugins (depends on working CLI entry point)
- **001-004**: Add not-found error handler (depends on working CLI entry point)
- **001-005**: Configure global installation (depends on working CLI entry point)
- **002-003**: Implement init command skeleton (depends on CLI routing)
- **003-012**: Implement analyze command (depends on CLI routing)
- **004-014**: Implement review command (depends on CLI routing)
- **005-001**: Implement status command (depends on CLI routing)
- **006-001**: Implement config command (depends on CLI routing)
- **007-001, 007-002**: Implement cron commands (depends on CLI routing)

---

## Implementation Checklist

- [ ] Install CLERC: `bun add clerc`
- [ ] Create `/src/cli/index.ts`
- [ ] Set up Cli() with scriptName("sanj") and version("1.0.0")
- [ ] Define all 6 commands with basic descriptions
- [ ] Implement placeholder handlers for each command
- [ ] Call .parse() to process arguments
- [ ] Test with `bun run src/cli/index.ts <command>`
- [ ] Verify exit codes work correctly
- [ ] Verify TypeScript compiles cleanly

---

## Testing Approach

### Manual Testing

No unit tests needed at this stage (testing strategy focuses on core domain later).

Test each command:
```bash
# Should print something
bun run src/cli/index.ts init
bun run src/cli/index.ts analyze
bun run src/cli/index.ts review
bun run src/cli/index.ts status
bun run src/cli/index.ts config
bun run src/cli/index.ts cron

# Should show error/help (before 001-003/001-004 are done)
bun run src/cli/index.ts
bun run src/cli/index.ts unknown-command
```

### Success Indicators

- All commands acknowledge receipt without crashing
- Exit code is 0 for implemented commands
- Exit code is non-zero for unknown commands
- No TypeScript compilation errors

---

## Related Tasks

**Previous Task**: 001-001 - Initialize Bun project
**Next Tasks**: 001-003, 001-004, 001-005 (all depend on this)

---

## Notes for Implementation

1. Keep handlers simple - they're just stubs for now
2. The CLERC API is chainable, so order matters
3. ESM-only imports are fine - Bun handles them natively
4. Don't worry about global installation yet (001-005 handles that)
5. Help and version output will be properly formatted in 001-003
6. Error messages for unknown commands will be improved in 001-004
