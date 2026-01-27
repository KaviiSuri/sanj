# Jobs to Be Done: sanj-v1

## JTBD-001: CLI Foundation

**Job Statement**: "When I install Sanj, I want a working CLI entry point, so that I can discover and run commands."

**Context**:
- Built with CLERC on Bun + TypeScript
- Entry point for all other functionality
- Must be installable globally (`bun install -g`)

**What This Involves**:
- CLERC setup with command routing
- Help text generation for all commands
- Version display
- Error handling for unknown commands
- Proper exit codes for scripting

**Success Criteria**:
- `sanj` shows help
- `sanj --help` shows detailed usage
- `sanj --version` shows version
- Unknown commands show helpful error
- Exit codes are correct (0 success, 1 error)

---

## JTBD-002: First-Time Setup

**Job Statement**: "When I first use Sanj, I want to initialize it with sensible defaults, so that it's ready to capture patterns."

**Context**:
- One-time setup, idempotent (safe to run again)
- Creates all necessary directories and files
- Validates environment (are Claude Code / OpenCode installed?)

**What This Involves**:
- Create `~/.sanj/` directory structure
- Generate default `config.json`
- Prompt for LLM adapter preference (OpenCode vs Claude Code)
- Prompt for model selection
- Validate that selected tools are available in PATH
- Initialize empty observations store
- Show confirmation of what was created

**Success Criteria**:
- `~/.sanj/` exists with valid config
- Config has sensible defaults
- User knows what was set up
- Running again doesn't break anything

---

## JTBD-003: Session Analysis & Pattern Capture

**Job Statement**: "When I've been coding with AI assistants, I want to extract patterns from those sessions, so that recurring preferences are captured."

**Context**:
- Core value proposition of Sanj
- Runs non-interactively (suitable for cron)
- Must handle both Claude Code and OpenCode sessions

**What This Involves**:

### Session Ingestion
- Read Claude Code sessions from `~/.claude/projects/`
- Read OpenCode sessions from `~/.local/share/opencode/storage/`
- Filter to sessions since last analysis (or configurable window)
- Parse JSONL/JSON formats

### Pattern Extraction
- Send session content to configured LLM
- Prompt LLM to identify: preferences, recurring patterns, workflow habits, tool choices, coding style decisions
- Structure output as discrete observations

### Observation Storage
- Compare new observations against existing ones
- Use LLM to check semantic similarity
- If similar: bump count on existing observation
- If new: create new observation with count=1
- Track which sessions each observation came from
- Track timestamps (first seen, last seen)

### Logging
- Record when analysis ran
- Record how many sessions processed
- Record how many observations created/updated

**Success Criteria**:
- Sessions from both tools are read
- Patterns are extracted and stored
- Duplicates are detected and merged
- Counts accurately reflect frequency
- Works silently for cron (no interactive prompts)
- Handles empty/missing sessions gracefully

---

## JTBD-004: Review & Approve Observations (TUI)

**Job Statement**: "When patterns have been captured, I want to review them interactively, so that I control what becomes memory."

**Context**:
- Built with OpenTUI
- Only place where observations get promoted
- Human-in-the-loop is mandatory

**What This Involves**:

### TUI Layout
- List of pending observations
- Each item shows: observation text, count, source session references
- Keyboard navigation (up/down/enter)
- Action buttons: Approve, Deny, Skip

### Observation → Long-Term Memory
- Approved observations move to long-term-memory.md
- Denied observations are marked as rejected (don't show again)
- Skipped observations stay pending

### Long-Term → Core Memory
- Separate view for promoting long-term memories
- Shows memories that meet promotion threshold (count + time)
- Approved items written to CLAUDE.md and/or AGENTS.md
- User sees exactly what will be written

### Session References
- Can see which sessions an observation came from
- Helps user judge if pattern is real

**Success Criteria**:
- TUI launches and is navigable
- Observations are displayed clearly
- Approve/Deny/Skip work correctly
- Promotions only happen on explicit approval
- Core memory files are updated correctly

---

## JTBD-005: Status Check

**Job Statement**: "When I want a quick glance at Sanj's state, I want a summary, so that I know if action is needed."

**Context**:
- Non-interactive, scriptable
- Quick to run
- Useful for checking if there are pending reviews

**What This Involves**:
- Count of pending observations (awaiting review)
- Count of items in long-term memory
- Count of items ready for core memory promotion
- Last analysis timestamp
- Next scheduled analysis (if cron is set up)
- Any errors from last run

**Success Criteria**:
- Output is clear and concise
- Shows actionable info (e.g., "5 observations pending review")
- Exit code reflects state (0 = ok, 1 = needs attention?)

---

## JTBD-006: Configuration Management

**Job Statement**: "When I want to adjust Sanj's behavior, I want to update settings, so that it works how I prefer."

**Context**:
- View and edit config
- Changes take effect on next run

**What This Involves**:

### View Config
- `sanj config` shows current settings

### Edit Config
- `sanj config set <key> <value>` or open in editor

### Configurable Settings
- LLM adapter (opencode / claude)
- Model name
- Session adapters enabled (claude_code: true/false, opencode: true/false)
- Memory targets enabled (claude_md: true/false, agents_md: true/false)
- Analysis window (how far back to look)
- Promotion thresholds (count required, time required)

**Success Criteria**:
- Can view all settings
- Can modify settings
- Invalid values are rejected with helpful error
- Changes persist to config.json

---

## JTBD-007: Scheduled Automation

**Job Statement**: "When I want Sanj to run automatically, I want to set up scheduling, so that analysis happens without manual triggers."

**Context**:
- Uses system crontab
- Should be easy to set up and tear down
- User controls the schedule

**What This Involves**:

### Setup
- `sanj cron install` or part of `sanj init`
- Add crontab entry for `sanj analyze`
- Default: daily at configurable time
- Optionally: weekly promotion reminder

### View
- `sanj cron status`
- Show current cron entries
- Show next scheduled runs

### Remove
- `sanj cron uninstall`
- Remove Sanj entries from crontab

### Logging
- Cron output goes to `~/.sanj/logs/`
- Easy to debug if something fails

**Success Criteria**:
- Crontab entries are created correctly
- Analysis runs on schedule
- Logs are accessible
- Can remove scheduling cleanly

---

## JTBD Summary

| ID | Job | Primary Command |
|----|-----|-----------------|
| 001 | CLI Foundation | `sanj`, `sanj --help` |
| 002 | First-Time Setup | `sanj init` |
| 003 | Session Analysis | `sanj analyze` |
| 004 | Review & Approve (TUI) | `sanj review` |
| 005 | Status Check | `sanj status` |
| 006 | Configuration | `sanj config` |
| 007 | Scheduled Automation | `sanj cron` |
