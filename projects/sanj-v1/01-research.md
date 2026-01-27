# Research: sanj-v1

## Problem Statement

Coding sessions with AI assistants (Claude Code, OpenCode) generate valuable insights about user preferences, patterns, and workflows. These insights are scattered across many conversations and lost over time. Users manually maintain memory files (CLAUDE.md, AGENTS.md) but this requires constant attention and misses patterns that emerge across sessions.

**Sanj** (named after the Mahabharata character Sanjay who could observe everything) is a tool that:
- Monitors coding sessions across multiple AI tools
- Analyzes conversations to identify recurring patterns, preferences, and workflows
- Surfaces observations to the user for approval
- Maintains a hierarchical memory system that promotes important patterns over time

## Core Concept

### The Name
"Sanj" - a 4-character CLI command. Play on the Hindi word "Sanjay" (सञ्जय).

### Memory Hierarchy
```
Observations (raw patterns detected)
    ↓ [count threshold + LLM judgment]
Long-Term Memory (validated patterns)
    ↓ [frequency + time + LLM judgment]
Core Memory (CLAUDE.md / AGENTS.md)
```

### Human-in-the-Loop
All promotions require user approval via TUI. Sanj surfaces suggestions; user decides.

## Web Research Findings

### Session Storage

| Tool | Location | Format |
|------|----------|--------|
| Claude Code | `~/.claude/projects/{project-slug}/{session-id}.jsonl` | JSONL |
| OpenCode | `~/.local/share/opencode/storage/session/{projectHash}/{sessionID}.json` | JSON/SQLite |

### Headless LLM Execution

| Tool | Command |
|------|---------|
| Claude Code | `claude -p "<prompt>"` |
| OpenCode | `opencode run --model <provider/model> "<prompt>" -q` |

### Memory File Conventions

| Tool | File |
|------|------|
| Claude Code | CLAUDE.md |
| OpenCode | AGENTS.md |

### CLI Framework: CLERC

Full-featured CLI library designed for Node.js, Deno, and Bun with strong TypeScript support.

- **Package**: `clerc` (npm)
- **Docs**: https://clerc.js.org/
- **Key Features**:
  - Chainable API for composable command definitions
  - Subcommands via space-separated names (e.g., `"parent child"`)
  - Command aliases (single or multiple)
  - Flag types: String, Boolean, Array, Object, Choices, custom parsers
  - Plugin system (help, version, completions, error handling, etc.)
  - ESM-only, works natively with Bun

**Basic Pattern:**
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

### TUI Framework: OpenTUI

- Bun-native (requires Bun >= 1.2.0)
- React reconciler available (`@opentui/react`)
- Components: box, text, input, select, scrollbox
- Still in active development - expect some rough edges
- Gotchas: TMPDIR env var issues, Windows compatibility problems

### QMD (Knowledge Base)

Local hybrid search engine for markdown files (BM25 + vector + LLM re-ranking). Considered for deduplication but deemed overkill for v1. Can revisit if simple approach doesn't scale.

## Constraints

- **Personal tool first**: Optimize for single user, open-source later
- **No databases**: File-based storage only
- **CLI-first**: No mobile app, no Discord bot for v1
- **Bun + TypeScript**: Unless there's a strong reason otherwise
- **Human approval required**: Never auto-modify memory files

## Technical Decisions

### Architecture: Adapter Pattern

Cross-compatible design supporting multiple tools with swappable components:

**Session Adapters** (read conversation history)
- ClaudeCodeSessionAdapter
- OpenCodeSessionAdapter

**LLM Adapters** (run analysis)
- OpenCodeLLMAdapter (default: zai-coding-plan/glm-4.7)
- ClaudeCodeLLMAdapter (future)

**Long-Term Memory Adapters** (intermediate storage)
- GlobalMemoryAdapter (~/.sanj/long-term-memory.md)
- Per-project adapter (future scope)

**Core Memory Adapters** (final destination)
- ClaudeMdAdapter (writes to CLAUDE.md)
- AgentsMdAdapter (writes to AGENTS.md)

### CLI Commands

```
sanj init      # first-time setup, creates ~/.sanj/, sets up crontab
sanj analyze   # run analysis on recent sessions (called by cron)
sanj review    # open TUI to approve/deny pending suggestions
sanj status    # show pending suggestions count, last run, etc.
sanj config    # edit config (LLM, adapters, cron schedule)
```

### Automation

Crontab-based scheduling:
- Daily analysis (e.g., 8pm)
- Weekly promotion review (e.g., Sunday 10am)

`sanj init` sets up the crontab automatically.

### Storage Location

`~/.sanj/` for all sanj data:
- config.json (settings)
- observations with counts and session references
- pending suggestions
- long-term-memory.md

### Deduplication Strategy

LLM-based semantic similarity check when inserting new observations. If similar to existing, bump count instead of duplicating.

### Promotion Logic

- Observations → Long-Term: count threshold + LLM judgment
- Long-Term → Core: higher count + time in long-term + LLM judgment
- All promotions surfaced in TUI for user approval

### TUI Review Flow

Simple list interface:
- Show pending suggestions
- Include references to source sessions
- Approve / Deny / Skip actions
- No preview needed

## Open Questions

1. **Global AGENTS.md location**: Where does OpenCode expect the global AGENTS.md file?
2. **Session recency**: How far back should `sanj analyze` look? Last 24 hours? Since last run?
3. **Observation granularity**: What level of detail should observations capture?
4. **Config schema**: Exact structure TBD during implementation
5. **Error handling**: What happens if LLM call fails during cron job?

## Future Scope (Not v1)

- Per-project memory files
- Skills generation (suggest creating .claude/skills/ for recurring workflows)
- Mobile notifications (Discord bot, Telegram, push notifications)
- QMD integration for advanced deduplication
- Multiple LLM provider support beyond OpenCode/Claude Code
