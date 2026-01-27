# Spec: Task 002-008 - Add Confirmation Output Showing What Was Created

## Task Identity

**Task ID**: 002-008
**JTBD**: 002 - First-Time Setup
**Epic**: Initialize Sanj with sensible defaults and confirm setup completion
**Component**: CLI Commands (`src/cli/commands/init.ts`)

---

## Purpose

This task adds comprehensive confirmation output to the `sanj init` command, providing users with clear visibility into what was created during the first-time setup process. Users need to know exactly what directories, files, and configurations were generated so they can verify the setup succeeded and understand where their data will be stored.

**Success Statement**: After running `sanj init`, users see a clear summary of all created artifacts (directories, config, cron entries) before the command exits.

---

## Scope

### In Scope

1. **Directory Creation Confirmation**: Display `~/.sanj/` and subdirectories created (observations, long-term-memory, logs)
2. **Config File Confirmation**: Show that `config.json` was created with selected settings (LLM adapter, model, enabled tools)
3. **Crontab Confirmation**: Display cron entries that were added for daily analysis and weekly promotion review
4. **Paths Summary**: Show absolute paths to key files for reference
5. **Next Steps**: Brief guidance on what to do next (`sanj analyze`, `sanj review`, etc.)
6. **Formatting**: Clear, readable output (not machine-parseable JSON)

### Out of Scope

1. **Config File Contents Dump**: Don't print entire JSON file contents
2. **Validation Prompts**: Already handled in task 002-007
3. **Interactive Follow-up**: Don't prompt user to take immediate action
4. **Error Handling Detail**: Errors already handled in previous tasks

---

## Acceptance Criteria

### Verification Steps

1. **Directory Confirmation**
   - [ ] Output confirms `~/.sanj/` directory was created
   - [ ] Lists subdirectories: `observations/`, `long-term-memory/`, `logs/`
   - [ ] Shows absolute paths for clarity

2. **Config Confirmation**
   - [ ] Output shows `config.json` created
   - [ ] Displays selected LLM adapter (e.g., "OpenCode")
   - [ ] Displays selected model (e.g., "zai-coding-plan/glm-4.7")
   - [ ] Shows enabled session adapters (Claude Code, OpenCode)
   - [ ] Shows enabled memory targets (CLAUDE.md, AGENTS.md)

3. **Crontab Confirmation**
   - [ ] Output confirms cron entries were added
   - [ ] Shows what was scheduled (daily analysis, weekly promotion)
   - [ ] Displays timing (e.g., "Daily at 8:00 PM")

4. **Output Format**
   - [ ] Uses clear section headers
   - [ ] Output is readable and not overwhelming
   - [ ] Uses appropriate formatting (bullet points, indentation)
   - [ ] Suitable for terminal display (works with various terminal widths)

5. **Accuracy**
   - [ ] All paths displayed are actual paths created
   - [ ] All config values displayed match what's in config.json
   - [ ] All cron entries displayed match actual crontab additions

6. **Integration**
   - [ ] Displays at end of `sanj init` after all setup complete
   - [ ] Doesn't interfere with existing validation output from 002-007
   - [ ] Returns success exit code (0)

---

## Implementation Notes

### Technical Guidance

#### Output Structure

```
✓ Sanj initialized successfully!

Setup Summary:
  Directory:  ~/.sanj/
  Subdirs:    - ~/.sanj/observations
              - ~/.sanj/long-term-memory
              - ~/.sanj/logs

Configuration:
  Config File:  ~/.sanj/config.json
  LLM Adapter:  OpenCode
  Model:        zai-coding-plan/glm-4.7
  Session Sources:  Claude Code, OpenCode
  Memory Targets:   CLAUDE.md, AGENTS.md

Scheduling:
  Daily Analysis:   Every day at 8:00 PM
  Weekly Review:    Every Sunday at 10:00 AM
  (Cron entries added to your system crontab)

Next Steps:
  1. Run your first analysis: sanj analyze
  2. Review observations: sanj review
  3. View status anytime: sanj status
  4. Adjust settings: sanj config
```

#### Implementation Steps

1. **Collect State**: At end of init handler, gather:
   - Directories created (from paths.ts)
   - Config values (from what was written)
   - Cron entries added (from crontab output)

2. **Build Output Sections**:
   - Success header with checkmark (✓)
   - Directory section (use paths.ts constants)
   - Config section (read from config.json to confirm)
   - Scheduling section (query actual crontab entries)
   - Next steps section (brief guidance)

3. **Format Output**:
   - Use consistent indentation (2-4 spaces)
   - Use bullet points or dashes for lists
   - Use clear labels for each value
   - Consider using color for headers if terminal supports it (optional enhancement)

4. **Display Logic**:
   ```typescript
   // In init handler, after all setup complete
   const summaryConfig = readConfig();
   const cronEntries = queryCrontab();

   console.log(formatInitConfirmation({
     config: summaryConfig,
     cron: cronEntries,
     paths: {
       root: SANJ_HOME,
       observations: OBSERVATIONS_DIR,
       longTermMemory: LONG_TERM_MEMORY_PATH,
       logs: LOGS_DIR
     }
   }));
   ```

#### Key Considerations

1. **Idempotency**: If init runs again on existing setup, confirm what already exists (no changes)
2. **Conditional Display**: Only show cron entries if they were successfully added
3. **Path Clarity**: Always use absolute paths (`~/.sanj/` not just `.sanj/`)
4. **Error Cases**: If setup partially failed, show what succeeded and what failed (already handled in 002-007, but coordinate output)

#### Output Utility Function

Create or enhance `src/cli/utils/output.ts`:

```typescript
interface InitConfirmationData {
  config: Config;
  cron: CronEntry[];
  paths: {
    root: string;
    observations: string;
    longTermMemory: string;
    logs: string;
  };
}

export function formatInitConfirmation(data: InitConfirmationData): string {
  // Implementation to format all sections
}
```

#### Related Functions (Dependencies)

- `readConfig()`: Already exists from 002-002
- `queryCrontab()`: May need to add to check actual cron entries
- Path constants: From `src/storage/paths.ts`

---

## Dependencies

### Blocks

None - this is final task in JTBD-002 setup chain.

### Blocked By

- **002-007**: Tool availability validation must complete first
- **002-006**: LLM adapter prompts must have completed
- **002-005**: Default config generation must exist

### Related Tasks

- 002-001: Storage paths definition
- 002-002: Config read/write functions
- 002-003: Init command skeleton
- 002-004: Directory creation
- 002-005: Config generation
- 002-006: LLM adapter prompts
- 002-007: Tool validation

---

## Testing Strategy

### Unit Tests

- Test confirmation output formatting with various config combinations
- Test path formatting for cross-platform compatibility
- Test cron entry display parsing

### Integration Tests

- Run full init flow and verify confirmation output matches actual created state
- Verify confirmation shows on both first run and idempotent re-run

### Manual Testing

- Run `sanj init` and verify all displayed information is accurate
- Check that output is readable on different terminal widths
- Verify relative paths are converted to absolute paths correctly

---

## Success Metrics

1. **User Clarity**: Users can immediately understand what was created
2. **Confidence**: Users trust that setup completed correctly based on confirmation output
3. **Reference**: Users can use paths in confirmation for troubleshooting
4. **Discoverability**: Next steps guidance helps users know what to do next

---

## Notes

- Coordinate output timing with any existing output from tasks 002-006 and 002-007
- Keep output concise but complete (aim for ~15-20 lines max)
- Consider accessibility: use text formatting instead of just colors
- This is the final user-facing output of the init flow, so it should feel polished
