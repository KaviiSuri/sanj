# PRD: sanj-v1

## Overview

Sanj is a CLI tool that monitors AI coding assistant sessions (Claude Code, OpenCode), identifies recurring patterns and preferences, and maintains a hierarchical memory system. It surfaces observations for user approval and gradually promotes validated patterns to long-term memory and eventually to core memory files (CLAUDE.md, AGENTS.md).

Named after the Mahabharata character Sanjay who could observe everything on the battlefield and report it clearly.

## Goals

1. **Capture patterns from coding sessions** - Automatically analyze Claude Code and OpenCode session history to extract recurring preferences, workflows, and insights
2. **Store observations inspectably** - Keep captured patterns in a format that's easy to inspect and debug (JSON/markdown)
3. **Deduplicate and track frequency** - Identify semantically similar observations and bump counts instead of duplicating
4. **Promote based on frequency and judgment** - Use LLM judgment combined with occurrence counts to suggest promotions through the memory hierarchy
5. **Maintain human control** - Never modify memory files automatically; always surface suggestions for user approval
6. **Support multiple tools** - Work with both Claude Code and OpenCode, updating both CLAUDE.md and AGENTS.md

## Non-Goals

1. **Automatic memory updates** - Will never write to CLAUDE.md/AGENTS.md without explicit user approval
2. **Mobile/Discord/Telegram notifications** - CLI and TUI only for v1
3. **Database storage** - File-based only (JSON, markdown)
4. **Skills generation** - Not suggesting or creating .claude/skills/ in v1
5. **Windows support** - macOS/Linux only (OpenTUI limitation)

## Future Scope (Not v1, but architected for)

- Per-project memory files (in addition to global)
- Skills generation for recurring workflows
- Push notifications via mobile app or messaging platforms
- QMD integration for advanced semantic deduplication

## User Stories

### US-1: First-Time Setup

**As** someone using AI coding assistants,
**I want** to run a single command to set up Sanj,
**So that** it starts capturing patterns from my sessions automatically.

**Acceptance Criteria:**
- `sanj init` creates `~/.sanj/` directory with default config
- Prompts for preferred LLM adapter (OpenCode/Claude Code) and model
- Sets up crontab entries for daily analysis and weekly promotion
- Validates that required tools (opencode/claude) are available
- Shows confirmation of what was configured

### US-2: Analyze Sessions

**As** someone using AI coding assistants,
**I want** Sanj to analyze my recent coding sessions,
**So that** it captures patterns I might want to remember.

**Acceptance Criteria:**
- `sanj analyze` reads sessions from Claude Code and OpenCode
- Uses configured LLM to identify patterns, preferences, and recurring themes
- Stores observations with session references and timestamps
- Deduplicates against existing observations (bumps count if similar)
- Works as a cron job (no interactive input required)
- Handles missing/empty sessions gracefully

### US-3: Review Pending Suggestions

**As** someone using AI coding assistants,
**I want** to review what Sanj has observed,
**So that** I can approve or reject suggestions before they affect my memory files.

**Acceptance Criteria:**
- `sanj review` opens a TUI with pending suggestions
- Each suggestion shows the observation and source session references
- Can approve (move to next level), deny (discard), or skip (decide later)
- Approved observations move through the hierarchy:
  - Observations → Long-Term Memory
  - Long-Term Memory → Core Memory (CLAUDE.md/AGENTS.md)
- Changes to core memory files happen only after explicit approval in TUI

### US-4: Check Status

**As** someone using AI coding assistants,
**I want** to see a quick summary of Sanj's state,
**So that** I know if there are pending reviews or issues.

**Acceptance Criteria:**
- `sanj status` shows:
  - Number of pending observations
  - Number of items in long-term memory
  - Last analysis run timestamp
  - Next scheduled runs
- Non-interactive, suitable for scripting or quick checks

### US-5: Configure Settings

**As** someone using AI coding assistants,
**I want** to adjust Sanj's configuration,
**So that** I can change the LLM, schedule, or adapters.

**Acceptance Criteria:**
- `sanj config` allows viewing/editing configuration
- Can change LLM adapter and model
- Can adjust cron schedules
- Can enable/disable specific session adapters (Claude Code, OpenCode)
- Can enable/disable specific memory targets (CLAUDE.md, AGENTS.md)

## Priority Order

| Priority | Scope | Description |
|----------|-------|-------------|
| P0 | Capture | Read sessions, extract observations, store inspectably |
| P1 | Dedupe & Count | Semantic deduplication, frequency tracking, scheduled runs |
| P2 | Core Memory | Promote to CLAUDE.md/AGENTS.md with approval |
| P3 | TUI Polish | Full TUI experience for review flow |

## Success Metrics

- Patterns captured that user wouldn't have manually noted
- Reduction in time spent manually updating memory files
- Observations that make it to core memory and persist
