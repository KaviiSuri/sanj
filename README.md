<h1 align="center">
  <br>
  sanj
  <br>
</h1>

<h4 align="center">Your AI coding assistant's memory, observed and curated.</h4>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#installation">Installation</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#commands">Commands</a> •
  <a href="#how-it-works">How It Works</a> •
  <a href="#configuration">Configuration</a>
</p>

---

**sanj** (सञ्जय) monitors your AI coding sessions, extracts recurring patterns, and promotes them to your memory files—with your approval.

Named after **Sanjay** from the Mahabharata, who could observe everything happening on the battlefield and report it clearly to the blind king Dhritarashtra. Sanj does the same for your coding sessions.

```
┌─────────────────────────────────────────────────────────────┐
│  $ sanj review                                              │
│                                                             │
│  Pending Observations (3)                     [a]pprove     │
│  ─────────────────────────────────────────    [d]eny        │
│  › Prefers TypeScript strict mode          ×5 [s]kip        │
│    Uses functional patterns over classes   ×3               │
│    Writes tests before implementation      ×2               │
│                                                             │
│  ↑↓ navigate • a/d/s action • q quit                        │
└─────────────────────────────────────────────────────────────┘
```

## The Problem

You use AI coding assistants daily. Each session generates valuable insights about your preferences, workflows, and coding style. But these insights are scattered across hundreds of conversations and lost over time.

You *could* manually update your `CLAUDE.md` or `AGENTS.md` files. But who has time to review every session and extract what matters?

## The Solution

Sanj automatically:

1. **Observes** your Claude Code and OpenCode sessions
2. **Extracts** patterns using LLM analysis
3. **Deduplicates** similar observations (bumps count instead of duplicating)
4. **Surfaces** suggestions for your review
5. **Promotes** approved patterns through a memory hierarchy
6. **Writes** to your `CLAUDE.md` / `AGENTS.md`—only with your approval

**You stay in control.** Sanj never modifies your files without explicit approval.

## Features

- **Multi-tool support** — Works with both Claude Code and OpenCode sessions
- **Smart analysis** — LLM-powered pattern extraction with semantic deduplication
- **Semantic deduplication** — Similar observations get merged, counts get bumped
- **Hierarchical memory** — Observations → Long-term Memory → Core Memory (CLAUDE.md/AGENTS.md)
- **Interactive TUI** — Review and approve observations with keyboard shortcuts
- **Cron automation** — Schedule daily analysis runs
- **Health diagnostics** — `sanj doctor` checks your setup and suggests fixes
- **File-based storage** — No database, just JSON and markdown in `~/.sanj/`

## Installation

### Prerequisites

- [Bun](https://bun.sh) >= 1.2.0
- [Claude Code](https://claude.ai/code) and/or [OpenCode](https://github.com/opencode-ai/opencode) installed

### Install

```bash
# Clone and install
git clone https://github.com/KaviiSuri/sanj.git
cd sanj
bun install

# Build
bun run build

# Link globally
bun link
```

### Verify

```bash
sanj --version
```

## Quick Start

```bash
# 1. Initialize (creates ~/.sanj/ with default config)
sanj init

# 2. Run your first analysis
sanj analyze

# 3. Review what was found
sanj review

# 4. Check status anytime
sanj status
```

## Commands

### `sanj init`

First-time setup. Creates `~/.sanj/` directory with default configuration.

```bash
sanj init
```

### `sanj analyze`

Analyze recent coding sessions and extract patterns.

```bash
sanj analyze              # Analyze sessions since last run
sanj analyze --verbose    # Show detailed progress
sanj analyze --since 7d   # Analyze last 7 days
```

### `sanj review`

Open interactive TUI to review pending observations.

```bash
sanj review
```

**Keyboard shortcuts:**
- `↑/↓` — Navigate observations
- `a` — Approve (promote to next level)
- `d` — Deny (mark as rejected)
- `s` — Skip (decide later)
- `Tab` — Switch between views
- `q` — Quit

### `sanj status`

Show current state at a glance.

```bash
sanj status           # Quick summary
sanj status --verbose # Detailed metrics
```

**Output:**
```
Observations:  12 pending, 5 approved, 3 denied
Long-term:     5 memories
Last analysis: 2 hours ago
Cron:          Daily at 8:00 PM (enabled)
```

### `sanj config`

View and modify configuration.

```bash
sanj config list                           # Show all settings
sanj config get llmAdapter.type            # Get specific value
sanj config set analysis.windowDays 14     # Update setting
```

### `sanj automate`

Manage scheduled automation via cron.

```bash
sanj automate status    # Check current schedule
sanj automate enable    # Enable daily analysis at 8 PM
sanj automate disable   # Remove cron entries
```

### `sanj doctor`

Run health diagnostics and get fix suggestions.

```bash
sanj doctor
```

**Checks:**
- Initialization status
- Config validity
- Adapter availability (Claude Code, OpenCode)
- File permissions
- Common issues

## How It Works

### Memory Hierarchy

```
┌─────────────────────────────────────────────────────────────┐
│                     Your Coding Sessions                     │
│              (Claude Code, OpenCode, etc.)                   │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              ▼ sanj analyze
┌─────────────────────────────────────────────────────────────┐
│                      Observations                            │
│         Raw patterns with counts and session refs            │
│                   (~/.sanj/observations.json)                │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              ▼ sanj review (approve)
┌─────────────────────────────────────────────────────────────┐
│                    Long-Term Memory                          │
│         Validated patterns, aging over time                  │
│                (~/.sanj/long-term-memory.md)                 │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              ▼ sanj review (promote)
┌─────────────────────────────────────────────────────────────┐
│                      Core Memory                             │
│            Your persistent preferences                       │
│              (CLAUDE.md / AGENTS.md)                         │
└─────────────────────────────────────────────────────────────┘
```

### Promotion Thresholds

- **Observation → Long-Term:** Count >= 2 + your approval
- **Long-Term → Core:** Count >= 3, in long-term >= 7 days + your approval

### What Gets Extracted

Sanj uses LLM-based semantic extraction to identify:

- **Preferences** — Coding style choices, tool preferences, naming conventions
- **Workflows** — Common sequences and patterns in how you work
- **Insights** — Recurring themes and habits across your sessions

Similar observations are automatically deduplicated (count gets bumped instead of creating duplicates).

## Configuration

Config lives at `~/.sanj/config.json`:

```json
{
  "llmAdapter": {
    "type": "opencode",
    "model": "zai-coding-plan/glm-4.7"
  },
  "sessionAdapters": {
    "claudeCode": true,
    "opencode": true
  },
  "memoryTargets": {
    "claudeMd": true,
    "agentsMd": false
  },
  "analysis": {
    "windowDays": 7
  },
  "promotion": {
    "observationCountThreshold": 2,
    "longTermDaysThreshold": 7
  }
}
```

### Key Settings

| Setting | Description | Default |
|---------|-------------|---------|
| `llmAdapter.type` | LLM to use for analysis | `opencode` |
| `sessionAdapters.claudeCode` | Read Claude Code sessions | `true` |
| `sessionAdapters.opencode` | Read OpenCode sessions | `true` |
| `memoryTargets.claudeMd` | Write to CLAUDE.md | `true` |
| `memoryTargets.agentsMd` | Write to AGENTS.md | `false` |
| `analysis.windowDays` | How far back to analyze | `7` |
| `promotion.observationCountThreshold` | Min count for promotion | `2` |

## Why Use Sanj?

**Good for you if:**
- You use AI coding assistants (Claude Code, OpenCode) daily
- You want your assistants to remember your preferences
- You don't have time to manually curate memory files
- You want human oversight over what gets saved

**Maybe not for you if:**
- You're on Windows (OpenTUI limitation)
- You want fully automatic memory updates (Sanj requires approval)
- You rarely use AI coding assistants

## Storage

All data lives in `~/.sanj/`:

```
~/.sanj/
├── config.json           # Your settings
├── observations.json     # Pending and historical observations
├── long-term-memory.md   # Approved long-term memories
├── state.json            # Last run timestamps
└── logs/                 # Analysis logs
```

## Tech Stack

- **Runtime:** [Bun](https://bun.sh)
- **Language:** TypeScript
- **CLI Framework:** [CLERC](https://clerc.js.org/)
- **TUI Framework:** [OpenTUI](https://github.com/open-tui/open-tui) with React

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

```bash
# Run tests
bun test

# Run in development
bun run dev
```

## License

MIT

## Credits

Named after **Sanjay** (सञ्जय) from the Mahabharata—the narrator who had the divine gift of seeing everything happening on the battlefield of Kurukshetra and reporting it to the blind king Dhritarashtra. Just as Sanjay observed and reported the great war, this tool observes your coding sessions and reports patterns worth remembering.

---

<p align="center">
  Built with Bun, TypeScript, and a love for AI-assisted coding.
</p>
