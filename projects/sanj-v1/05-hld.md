# High-Level Design: sanj-v1

## Overview

Sanj is a CLI tool built with Bun + TypeScript that monitors AI coding assistant sessions, extracts patterns, and manages a hierarchical memory system. The architecture uses an adapter pattern for extensibility while keeping v1 simple with hardcoded implementations.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                           CLI Layer                             │
│                          (CLERC)                                │
│  ┌─────┐ ┌─────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌──────┐ │
│  │init │ │ analyze │ │ review │ │ status │ │ config │ │ cron │ │
│  └─────┘ └─────────┘ └───┬────┘ └────────┘ └────────┘ └──────┘ │
└──────────────────────────┼──────────────────────────────────────┘
                           │ spawns
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                          TUI Layer                              │
│                        (OpenTUI)                                │
│  ┌──────────────────┐  ┌──────────────────┐                     │
│  │ ObservationList  │  │ PromotionList    │                     │
│  │ (pending review) │  │ (ready for core) │                     │
│  └──────────────────┘  └──────────────────┘                     │
└─────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Core Domain                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │ AnalysisEngine  │  │ ObservationStore│  │ MemoryHierarchy │  │
│  │                 │  │                 │  │                 │  │
│  │ - orchestrates  │  │ - CRUD          │  │ - promotion     │  │
│  │   analysis flow │  │ - deduplication │  │   logic         │  │
│  │                 │  │ - counting      │  │ - thresholds    │  │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘  │
└───────────┼────────────────────┼────────────────────┼───────────┘
            │                    │                    │
            ▼                    ▼                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Adapter Layer                            │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │ SessionAdapter  │  │   LLMAdapter    │  │CoreMemoryAdapter│  │
│  │ (interface)     │  │ (interface)     │  │ (interface)     │  │
│  ├─────────────────┤  ├─────────────────┤  ├─────────────────┤  │
│  │ ClaudeCode      │  │ OpenCodeLLM     │  │ ClaudeMd        │  │
│  │ OpenCode        │  │ (future:Claude) │  │ AgentsMd        │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Storage                                 │
│                       (~/.sanj/)                                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌────────┐  │
│  │ config.json │  │observations │  │ long-term-  │  │ logs/  │  │
│  │             │  │   .json     │  │ memory.md   │  │        │  │
│  └─────────────┘  └─────────────┘  └─────────────┘  └────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Components

### CLI Layer

**Technology**: CLERC

**Responsibility**: Entry point for all user interactions. Routes commands to appropriate handlers.

**Commands**:
| Command | Handler | Description |
|---------|---------|-------------|
| `sanj init` | InitHandler | First-time setup |
| `sanj analyze` | AnalyzeHandler | Run session analysis |
| `sanj review` | ReviewHandler | Spawn TUI |
| `sanj status` | StatusHandler | Show summary |
| `sanj config` | ConfigHandler | View/edit settings |
| `sanj cron` | CronHandler | Manage scheduling |

**Supports**: JTBD-001, JTBD-002, JTBD-005, JTBD-006, JTBD-007

---

### TUI Layer

**Technology**: OpenTUI with React reconciler (`@opentui/react`)

**Responsibility**: Interactive review interface. Spawned by CLI when `sanj review` is called.

**Views**:
- **ObservationReview**: List of pending observations with approve/deny/skip
- **PromotionReview**: Long-term memories ready for core memory promotion

**Supports**: JTBD-004

---

### Core Domain

#### AnalysisEngine

**Responsibility**: Orchestrates the analysis flow.

**Flow**:
1. Get list of sessions from all enabled SessionAdapters
2. Filter to sessions since last analysis
3. For each session, send to LLMAdapter for pattern extraction
4. Pass extracted observations to ObservationStore

#### ObservationStore

**Responsibility**: Manages observation lifecycle.

**Operations**:
- Create new observation
- Find similar observation (delegates to LLMAdapter for semantic comparison)
- Bump count on existing observation
- Mark as approved/denied
- Query pending observations

#### MemoryHierarchy

**Responsibility**: Manages promotion between memory levels.

**Levels**:
1. **Observations** (pending) → stored in observations.json
2. **Long-Term Memory** → stored in long-term-memory.md
3. **Core Memory** → written to CLAUDE.md / AGENTS.md

**Promotion Logic**:
- Observation → Long-Term: user approval in TUI
- Long-Term → Core: count threshold + time threshold + user approval

**Supports**: JTBD-003, JTBD-004

---

### Adapter Layer

All adapters implement interfaces for testability and future extensibility. V1 uses hardcoded implementations.

#### SessionAdapter (interface)

```typescript
interface SessionAdapter {
  name: string;
  isAvailable(): Promise<boolean>;
  getSessions(since?: Date): Promise<Session[]>;
}
```

**Implementations**:
- `ClaudeCodeSessionAdapter`: Reads from `~/.claude/projects/`
- `OpenCodeSessionAdapter`: Reads from `~/.local/share/opencode/storage/`

#### LLMAdapter (interface)

```typescript
interface LLMAdapter {
  name: string;
  isAvailable(): Promise<boolean>;
  extractPatterns(session: Session): Promise<Observation[]>;
  checkSimilarity(a: Observation, b: Observation): Promise<boolean>;
}
```

**Implementations**:
- `OpenCodeLLMAdapter`: Uses `opencode run --model zai-coding-plan/glm-4.7 -q`
- `ClaudeCodeLLMAdapter`: (future) Uses `claude -p`

#### CoreMemoryAdapter (interface)

```typescript
interface CoreMemoryAdapter {
  name: string;
  getPath(): string;
  read(): Promise<string>;
  append(content: string): Promise<void>;
}
```

**Implementations**:
- `ClaudeMdAdapter`: Writes to `~/.claude/CLAUDE.md` (or project-level)
- `AgentsMdAdapter`: Writes to global AGENTS.md location

---

### Storage

All data stored in `~/.sanj/`:

| File | Format | Purpose |
|------|--------|---------|
| `config.json` | JSON | User configuration |
| `observations.json` | JSON | Pending and historical observations |
| `long-term-memory.md` | Markdown | Approved long-term memories |
| `logs/` | Text | Cron job logs, debug output |
| `state.json` | JSON | Last run timestamps, cursor positions |

---

## Data Flow

### Analysis Flow (sanj analyze)

```
1. CLI receives `analyze` command
2. AnalysisEngine.run()
   a. Load config to get enabled adapters
   b. For each SessionAdapter:
      - Check isAvailable()
      - Get sessions since last run
   c. For each session:
      - LLMAdapter.extractPatterns(session)
      - Returns list of Observation candidates
   d. For each candidate:
      - ObservationStore.findSimilar(candidate)
      - If similar found: bump count
      - If new: create with count=1
   e. Update state.json with lastAnalysisRun
3. Exit with success/failure code
```

### Review Flow (sanj review)

```
1. CLI receives `review` command
2. CLI spawns TUI process
3. TUI loads pending observations from ObservationStore
4. User navigates list:
   - Approve: MemoryHierarchy.promote(observation, 'long-term')
   - Deny: ObservationStore.markDenied(observation)
   - Skip: no action
5. TUI shows promotable long-term memories
6. User approves promotions:
   - MemoryHierarchy.promote(memory, 'core')
   - CoreMemoryAdapter.append(formatted content)
7. TUI exits, returns to CLI
```

---

## Folder Structure

```
sanj/
├── src/
│   ├── cli/
│   │   ├── index.ts          # CLERC setup, command routing
│   │   ├── commands/
│   │   │   ├── init.ts
│   │   │   ├── analyze.ts
│   │   │   ├── review.ts
│   │   │   ├── status.ts
│   │   │   ├── config.ts
│   │   │   └── cron.ts
│   │   └── utils/
│   │       └── output.ts     # Formatting helpers
│   │
│   ├── tui/
│   │   ├── index.ts          # OpenTUI entry point
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── ObservationList.tsx
│   │   │   ├── ObservationItem.tsx
│   │   │   ├── PromotionList.tsx
│   │   │   └── ActionBar.tsx
│   │   └── hooks/
│   │       └── useObservations.ts
│   │
│   ├── core/
│   │   ├── AnalysisEngine.ts
│   │   ├── ObservationStore.ts
│   │   ├── MemoryHierarchy.ts
│   │   └── types.ts          # Shared domain types
│   │
│   ├── adapters/
│   │   ├── session/
│   │   │   ├── SessionAdapter.ts      # Interface
│   │   │   ├── ClaudeCodeSession.ts
│   │   │   └── OpenCodeSession.ts
│   │   ├── llm/
│   │   │   ├── LLMAdapter.ts          # Interface
│   │   │   └── OpenCodeLLM.ts
│   │   └── memory/
│   │       ├── CoreMemoryAdapter.ts   # Interface
│   │       ├── ClaudeMd.ts
│   │       └── AgentsMd.ts
│   │
│   └── storage/
│       ├── config.ts         # Config read/write
│       ├── state.ts          # State management
│       └── paths.ts          # Path constants
│
├── tests/
│   ├── core/
│   │   ├── AnalysisEngine.test.ts
│   │   ├── ObservationStore.test.ts
│   │   └── MemoryHierarchy.test.ts
│   ├── adapters/
│   │   └── ...
│   └── fixtures/
│       └── ...
│
├── package.json
├── tsconfig.json
├── bunfig.toml
└── README.md
```

---

## Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Runtime | Bun | Fast, native TypeScript, built-in test runner |
| CLI Framework | CLERC | TypeScript-first, works natively with Bun, chainable API |
| TUI Framework | OpenTUI | Bun-native, React reconciler for familiar patterns |
| Storage | JSON/Markdown files | No database dependency, human-readable, easy to debug |
| Adapter Loading | Hardcoded | Simpler for v1, can add dynamic loading later |
| LLM Default | OpenCode + zai-coding-plan/glm-4.7 | User preference, extensible via adapter |
| Testing | Bun test runner | Built-in, fast, no extra dependencies |

---

## Dependencies

| Package | Purpose |
|---------|---------|
| `clerc` | CLI framework |
| `@opentui/core` | TUI rendering |
| `@opentui/react` | React reconciler for TUI |
| `react` | Component model for TUI |

Dev dependencies:
| Package | Purpose |
|---------|---------|
| `typescript` | Type checking |
| `@types/react` | React types |

---

## Testing Strategy

- **Unit tests**: Core domain logic (AnalysisEngine, ObservationStore, MemoryHierarchy)
- **Mock adapters**: For testing without real Claude Code/OpenCode installations
- **Integration tests**: Full flows with mock file system
- **No E2E tests for v1**: Manual testing of TUI sufficient initially

Priority:
1. ObservationStore (deduplication, counting logic)
2. MemoryHierarchy (promotion logic)
3. AnalysisEngine (orchestration)

---

## Open Questions

1. **Global AGENTS.md location**: Need to confirm where OpenCode expects this
2. **Session parsing**: JSONL/JSON format details need investigation during implementation
3. **LLM prompt engineering**: Exact prompts for pattern extraction and similarity checking TBD
4. **Error recovery**: How to handle partial failures during analysis (some sessions fail, others succeed)

---

## JTBD Mapping

| Component | Supports JTBDs |
|-----------|----------------|
| CLI Layer | 001, 002, 005, 006, 007 |
| TUI Layer | 004 |
| AnalysisEngine | 003 |
| ObservationStore | 003, 004 |
| MemoryHierarchy | 003, 004 |
| SessionAdapters | 003 |
| LLMAdapter | 003 |
| CoreMemoryAdapters | 004 |
