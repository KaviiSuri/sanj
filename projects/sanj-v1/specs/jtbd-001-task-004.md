# Spec: Task 001-004 - Add Not-Found Error Handling for Unknown Commands

**Task ID**: 001-004
**JTBD**: 001 - CLI Foundation
**Depends On**: 001-002
**Estimated Effort**: Low
**Priority**: Wave 3

---

## Purpose

Implement graceful error handling when users invoke unknown or misspelled commands on the Sanj CLI. This ensures that the CLI provides helpful feedback rather than cryptic errors, improving the user experience and making the tool feel polished and production-ready.

---

## Scope

### In Scope

- Add a not-found handler to the CLERC CLI that catches unknown commands
- Display a helpful error message that:
  - Clarifies that the command is unknown
  - Suggests the user run `sanj --help` or `sanj help` to see available commands
  - Optionally suggests similar commands based on the misspelled input (e.g., "Did you mean `sanj analyze`?")
- Ensure the exit code is non-zero (e.g., 1) to signal failure to scripting environments
- Apply consistent error formatting with other CLERC error outputs

### Out of Scope

- Fuzzy matching / advanced "did you mean" suggestions (keep it simple for v1)
- Custom error pages or interactive command selection
- Logging of unknown commands (use case TBD)

---

## Acceptance Criteria

1. **Unknown Command Handling**
   - Running `sanj unknown-command` displays an error message
   - Error message is clear and actionable
   - Exit code is non-zero (1)

2. **Helpful Error Output**
   - Error mentions that the command is unknown
   - Suggests running `sanj --help` to see available commands
   - Output is properly formatted (consistent with CLERC conventions)

3. **Consistent with Help/Version Plugins**
   - Integrates cleanly with existing CLERC help and version plugins
   - Does not conflict with task 001-003 (help/version)
   - All error cases use the same error-handling mechanism

4. **Exit Code Behavior**
   - `sanj` (no command) → exit 0 or 1 (TBD: current CLERC default)
   - `sanj unknown` → exit 1
   - `sanj --help` → exit 0
   - `sanj --version` → exit 0
   - `sanj valid-command` → exit 0 or 1 depending on command success

5. **Edge Cases Handled**
   - Typos in command names (e.g., `sanj analzye` → error message)
   - Subcommands that don't exist (e.g., `sanj config invalid-subcommand`)
   - Commands with invalid flags (existing CLERC behavior; no change needed)

---

## Implementation Notes

### Technical Approach

1. **CLERC API Integration**
   - Consult CLERC documentation for error handling hooks
   - CLERC likely provides a `.onNotFound()` or `.on404()` method or similar
   - Alternative: catch at the default handler level if CLERC doesn't expose explicit hooks

2. **Error Message Format**
   ```
   Error: Unknown command "unknown-command"

   Run "sanj --help" for available commands
   ```

   Or with optional suggestion:
   ```
   Error: Unknown command "analzye"

   Did you mean: analyze?

   Run "sanj --help" for available commands
   ```

3. **Integration with Existing Handlers**
   - Ensure this works cleanly with existing help and version plugins (001-003)
   - Place handler registration in `src/cli/index.ts`
   - Use consistent error styling/output format

4. **Testing Approach**
   - Manual CLI testing: `sanj unknown`
   - Verify exit code is 1: `sanj unknown; echo $?`
   - Verify exit code is 0 for valid commands: `sanj --help; echo $?`
   - No unit tests needed for v1 (CLI integration level)

### Code Location

- **File**: `src/cli/index.ts`
- **Related**: `src/cli/utils/output.ts` (if creating error formatting utilities)

### CLERC Configuration

- Review CLERC documentation for:
  - How to register a not-found handler
  - Recommended error message format
  - Exit code conventions

---

## Acceptance Verification Steps

1. **Setup**
   - Ensure project is initialized (task 001-001 complete)
   - Ensure CLERC is installed and CLI entry point created (task 001-002 complete)

2. **Functional Testing**
   - Run `sanj unknown-command` → Verify error is displayed
   - Run `sanj unknown-command; echo $?` → Verify exit code is 1
   - Run `sanj --help; echo $?` → Verify exit code is 0
   - Run `sanj analyze; echo $?` → Verify exit code is 0 (for valid command)

3. **Message Quality Check**
   - Error message is human-readable
   - Includes actionable next step (`--help` reference)
   - Output is consistent with CLERC conventions

4. **Integration Check**
   - Does not break existing help/version functionality (001-003)
   - Unknown command handler does not interfere with valid commands
   - No spurious errors on valid command invocations

---

## Dependencies

- **Blocks**: None (CLI layer feature, no dependent tasks)
- **Blocked By**:
  - 001-002: CLERC CLI entry point must exist
  - 001-001: Bun project must be initialized

---

## References

- JTBD-001: CLI Foundation (from 03-jtbd.md)
- Task Breakdown: 04-tasks.md
- HLD Error Handling: 05-hld.md
- CLERC Documentation: https://clerc.js.org/

---

## Notes

- This task is low-risk and can be implemented quickly once CLERC's API is familiar
- The not-found handler is a quality-of-life improvement; not critical for MVP but recommended
- Consider adding verbose error logging to `~/.sanj/logs/` for debugging (future enhancement)
- Potential future enhancement: collect unknown commands and suggest adding new subcommands based on patterns
