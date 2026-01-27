# Task Breakdown: sanj-v1

## JTBD-001: CLI Foundation

| Task ID | Description | Depends On |
|---------|-------------|------------|
| 001-001 | Initialize Bun project with package.json and tsconfig.json | None |
| 001-002 | Install CLERC and create CLI entry point in src/cli/index.ts | 001-001 |
| 001-003 | Add help and version plugins to CLERC | 001-002 |
| 001-004 | Add not-found error handling for unknown commands | 001-002 |
| 001-005 | Configure package.json for global installation via bun | 001-002 |

---

## JTBD-002: First-Time Setup

| Task ID | Description | Depends On |
|---------|-------------|------------|
| 002-001 | Create storage/paths.ts with path constants for ~/.sanj/ | 001-001 |
| 002-002 | Create storage/config.ts with read/write functions | 002-001 |
| 002-003 | Implement init command skeleton in src/cli/commands/init.ts | 001-002 |
| 002-004 | Add directory creation logic to init command | 002-003 |
| 002-005 | Add default config generation to init command | 002-002, 002-004 |
| 002-006 | Add interactive prompts for LLM adapter selection | 002-005 |
| 002-007 | Add tool availability validation to init command | 002-005 |
| 002-008 | Add confirmation output showing what was created | 002-007 |

---

## JTBD-003: Session Analysis

| Task ID | Description | Depends On |
|---------|-------------|------------|
| 003-001 | Define core types in src/core/types.ts | 001-001 |
| 003-002 | Define SessionAdapter interface | 003-001 |
| 003-003 | Implement ClaudeCodeSessionAdapter | 003-002 |
| 003-004 | Implement OpenCodeSessionAdapter | 003-002 |
| 003-005 | Define LLMAdapter interface | 003-001 |
| 003-006 | Implement OpenCodeLLMAdapter with extractPatterns method | 003-005 |
| 003-007 | Add checkSimilarity method to OpenCodeLLMAdapter | 003-006 |
| 003-008 | Implement ObservationStore with CRUD operations | 003-001 |
| 003-009 | Add deduplication logic to ObservationStore using LLMAdapter | 003-008, 003-007 |
| 003-010 | Create storage/state.ts for tracking last run timestamp | 002-001 |
| 003-011 | Implement AnalysisEngine orchestrating the full flow | 003-003, 003-004, 003-009, 003-010 |
| 003-012 | Implement analyze command wiring AnalysisEngine | 003-011, 001-002 |
| 003-013 | Write unit tests for ObservationStore | 003-009 |
| 003-014 | Write unit tests for AnalysisEngine with mock adapters | 003-011 |

---

## JTBD-004: Review TUI

| Task ID | Description | Depends On |
|---------|-------------|------------|
| 004-001 | Install OpenTUI dependencies and configure React reconciler | 001-001 |
| 004-002 | Create TUI entry point in src/tui/index.ts | 004-001 |
| 004-003 | Create basic App.tsx shell with OpenTUI renderer | 004-002 |
| 004-004 | Create ObservationItem component displaying single observation | 004-003 |
| 004-005 | Create ObservationList component with scrollable list | 004-004 |
| 004-006 | Implement keyboard navigation in ObservationList | 004-005 |
| 004-007 | Create ActionBar component with approve/deny/skip buttons | 004-003 |
| 004-008 | Wire approve/deny/skip actions to ObservationStore | 004-007, 003-008 |
| 004-009 | Implement MemoryHierarchy with promotion logic | 003-001 |
| 004-010 | Define CoreMemoryAdapter interface | 003-001 |
| 004-011 | Implement ClaudeMdAdapter for writing to CLAUDE.md | 004-010 |
| 004-012 | Implement AgentsMdAdapter for writing to AGENTS.md | 004-010 |
| 004-013 | Create PromotionList view for long-term to core promotions | 004-009, 004-011, 004-012 |
| 004-014 | Implement review command that spawns TUI process | 004-013, 001-002 |
| 004-015 | Write unit tests for MemoryHierarchy | 004-009 |

---

## JTBD-005: Status Check

| Task ID | Description | Depends On |
|---------|-------------|------------|
| 005-001 | Implement status command skeleton | 001-002 |
| 005-002 | Add pending observations count to status output | 005-001, 003-008 |
| 005-003 | Add long-term memory count to status output | 005-001, 004-009 |
| 005-004 | Add last analysis timestamp to status output | 005-001, 003-010 |
| 005-005 | Add cron schedule info to status output | 005-001, 007-002 |

---

## JTBD-006: Configuration

| Task ID | Description | Depends On |
|---------|-------------|------------|
| 006-001 | Implement config command showing current settings | 001-002, 002-002 |
| 006-002 | Implement config set subcommand for updating values | 006-001 |
| 006-003 | Add validation for config values with helpful errors | 006-002 |

---

## JTBD-007: Scheduled Automation

| Task ID | Description | Depends On |
|---------|-------------|------------|
| 007-001 | Implement cron install subcommand adding crontab entry | 001-002, 003-012 |
| 007-002 | Implement cron status subcommand showing current schedule | 001-002 |
| 007-003 | Implement cron uninstall subcommand removing entries | 007-001 |
| 007-004 | Set up logging directory and log rotation for cron runs | 002-001 |

---

## Dependency Graph

```
                                    ┌─────────┐
                                    │ 001-001 │ (Bun project init)
                                    └────┬────┘
                    ┌───────────────────┬┴───────────────────┬───────────────────┐
                    ▼                   ▼                    ▼                   ▼
              ┌─────────┐         ┌─────────┐          ┌─────────┐         ┌─────────┐
              │ 001-002 │         │ 002-001 │          │ 003-001 │         │ 004-001 │
              │ (CLERC) │         │ (paths) │          │ (types) │         │(OpenTUI)│
              └────┬────┘         └────┬────┘          └────┬────┘         └────┬────┘
        ┌─────┬────┼────┬─────┐       │           ┌────────┼────────┐          │
        ▼     ▼    ▼    ▼     ▼       ▼           ▼        ▼        ▼          ▼
    001-003 001-004 001-005 002-003 002-002    003-002  003-005  003-008    004-002
    005-001 006-001 007-002         003-010    004-009  004-010              │
        │                              │          │        │        │          ▼
        └──────────────────────────────┼──────────┼────────┼────────┼───── 004-003
                                       ▼          ▼        ▼        ▼          │
                                    002-004    003-003  003-006  (CRUD)    ┌───┴───┐
                                       │       003-004     │               ▼       ▼
                                       ▼          │        ▼           004-004 004-007
                                    002-005       │     003-007            │       │
                                       │          │        │               ▼       │
                                    ┌──┴──┐       │        ▼           004-005     │
                                    ▼     ▼       │     003-009            │       │
                                 002-006 002-007  │        │               ▼       │
                                          │       └────────┼───────────004-006     │
                                          ▼                ▼               │       │
                                       002-008          003-011            │       │
                                                           │               │       │
                                                           ▼               │       │
                                                        003-012            │       │
                                                           │               │       │
                                    ┌──────────────────────┤               │       │
                                    ▼                      │               │       ▼
                                 007-001                   │               │   004-008
                                    │                      ▼               │       │
                                    ▼                   003-013            │       │
                                 007-003                003-014            │       │
                                                                           │       │
                                                                           ▼       ▼
                                                      004-009 ─────────> 004-013 <─┘
                                                      004-011 ──────────────┘
                                                      004-012 ──────────────┘
                                                                           │
                                                                           ▼
                                                                        004-014
                                                                        004-015
```

---

## Dependency Matrix

| Task ID | Description | Depends On | Blocks |
|---------|-------------|------------|--------|
| 001-001 | Initialize Bun project | None | 001-002, 002-001, 003-001, 004-001 |
| 001-002 | Install CLERC and create CLI entry point | 001-001 | 001-003, 001-004, 001-005, 002-003, 003-012, 004-014, 005-001, 006-001, 007-001, 007-002 |
| 001-003 | Add help and version plugins | 001-002 | None |
| 001-004 | Add not-found error handling | 001-002 | None |
| 001-005 | Configure global installation | 001-002 | None |
| 002-001 | Create storage/paths.ts | 001-001 | 002-002, 003-010, 007-004 |
| 002-002 | Create storage/config.ts | 002-001 | 002-005, 006-001 |
| 002-003 | Implement init command skeleton | 001-002 | 002-004 |
| 002-004 | Add directory creation to init | 002-003 | 002-005 |
| 002-005 | Add default config generation | 002-002, 002-004 | 002-006, 002-007 |
| 002-006 | Add LLM adapter prompts | 002-005 | None |
| 002-007 | Add tool availability validation | 002-005 | 002-008 |
| 002-008 | Add confirmation output | 002-007 | None |
| 003-001 | Define core types | 001-001 | 003-002, 003-005, 003-008, 004-009, 004-010 |
| 003-002 | Define SessionAdapter interface | 003-001 | 003-003, 003-004 |
| 003-003 | Implement ClaudeCodeSessionAdapter | 003-002 | 003-011 |
| 003-004 | Implement OpenCodeSessionAdapter | 003-002 | 003-011 |
| 003-005 | Define LLMAdapter interface | 003-001 | 003-006 |
| 003-006 | Implement OpenCodeLLMAdapter extractPatterns | 003-005 | 003-007 |
| 003-007 | Add checkSimilarity to OpenCodeLLMAdapter | 003-006 | 003-009 |
| 003-008 | Implement ObservationStore CRUD | 003-001 | 003-009, 004-008, 005-002 |
| 003-009 | Add deduplication to ObservationStore | 003-008, 003-007 | 003-011, 003-013 |
| 003-010 | Create storage/state.ts | 002-001 | 003-011, 005-004 |
| 003-011 | Implement AnalysisEngine | 003-003, 003-004, 003-009, 003-010 | 003-012, 003-014 |
| 003-012 | Implement analyze command | 003-011, 001-002 | 007-001 |
| 003-013 | Write ObservationStore tests | 003-009 | None |
| 003-014 | Write AnalysisEngine tests | 003-011 | None |
| 004-001 | Install OpenTUI dependencies | 001-001 | 004-002 |
| 004-002 | Create TUI entry point | 004-001 | 004-003 |
| 004-003 | Create App.tsx shell | 004-002 | 004-004, 004-007 |
| 004-004 | Create ObservationItem component | 004-003 | 004-005 |
| 004-005 | Create ObservationList component | 004-004 | 004-006 |
| 004-006 | Implement keyboard navigation | 004-005 | None |
| 004-007 | Create ActionBar component | 004-003 | 004-008 |
| 004-008 | Wire actions to ObservationStore | 004-007, 003-008 | 004-013 |
| 004-009 | Implement MemoryHierarchy | 003-001 | 004-013, 004-015, 005-003 |
| 004-010 | Define CoreMemoryAdapter interface | 003-001 | 004-011, 004-012 |
| 004-011 | Implement ClaudeMdAdapter | 004-010 | 004-013 |
| 004-012 | Implement AgentsMdAdapter | 004-010 | 004-013 |
| 004-013 | Create PromotionList view | 004-009, 004-011, 004-012, 004-008 | 004-014 |
| 004-014 | Implement review command | 004-013, 001-002 | None |
| 004-015 | Write MemoryHierarchy tests | 004-009 | None |
| 005-001 | Implement status command skeleton | 001-002 | 005-002, 005-003, 005-004, 005-005 |
| 005-002 | Add pending observations count | 005-001, 003-008 | None |
| 005-003 | Add long-term memory count | 005-001, 004-009 | None |
| 005-004 | Add last analysis timestamp | 005-001, 003-010 | None |
| 005-005 | Add cron schedule info | 005-001, 007-002 | None |
| 006-001 | Implement config view command | 001-002, 002-002 | 006-002 |
| 006-002 | Implement config set subcommand | 006-001 | 006-003 |
| 006-003 | Add config validation | 006-002 | None |
| 007-001 | Implement cron install | 001-002, 003-012 | 007-003 |
| 007-002 | Implement cron status | 001-002 | 005-005 |
| 007-003 | Implement cron uninstall | 007-001 | None |
| 007-004 | Set up logging for cron | 002-001 | None |

---

## Linearized Implementation Order

### Wave 1 (No dependencies - can start immediately)
```
001-001  Initialize Bun project with package.json and tsconfig.json
```

### Wave 2 (Depends on Wave 1)
```
001-002  Install CLERC and create CLI entry point
002-001  Create storage/paths.ts with path constants
003-001  Define core types in src/core/types.ts
004-001  Install OpenTUI dependencies and configure React reconciler
```

### Wave 3 (Depends on Wave 2)
```
001-003  Add help and version plugins to CLERC
001-004  Add not-found error handling for unknown commands
001-005  Configure package.json for global installation
002-002  Create storage/config.ts with read/write functions
002-003  Implement init command skeleton
003-002  Define SessionAdapter interface
003-005  Define LLMAdapter interface
003-008  Implement ObservationStore with CRUD operations
003-010  Create storage/state.ts for tracking last run timestamp
004-002  Create TUI entry point in src/tui/index.ts
004-009  Implement MemoryHierarchy with promotion logic
004-010  Define CoreMemoryAdapter interface
007-004  Set up logging directory for cron runs
```

### Wave 4 (Depends on Wave 3)
```
002-004  Add directory creation logic to init command
003-003  Implement ClaudeCodeSessionAdapter
003-004  Implement OpenCodeSessionAdapter
003-006  Implement OpenCodeLLMAdapter with extractPatterns
004-003  Create basic App.tsx shell with OpenTUI renderer
004-011  Implement ClaudeMdAdapter
004-012  Implement AgentsMdAdapter
004-015  Write unit tests for MemoryHierarchy
005-001  Implement status command skeleton
006-001  Implement config command showing current settings
007-002  Implement cron status subcommand
```

### Wave 5 (Depends on Wave 4)
```
002-005  Add default config generation to init command
003-007  Add checkSimilarity method to OpenCodeLLMAdapter
004-004  Create ObservationItem component
004-007  Create ActionBar component
005-004  Add last analysis timestamp to status output
006-002  Implement config set subcommand
```

### Wave 6 (Depends on Wave 5)
```
002-006  Add interactive prompts for LLM adapter selection
002-007  Add tool availability validation to init command
003-009  Add deduplication logic to ObservationStore
004-005  Create ObservationList component with scrollable list
004-008  Wire approve/deny/skip actions to ObservationStore
005-002  Add pending observations count to status output
005-003  Add long-term memory count to status output
005-005  Add cron schedule info to status output
006-003  Add validation for config values
```

### Wave 7 (Depends on Wave 6)
```
002-008  Add confirmation output showing what was created
003-011  Implement AnalysisEngine orchestrating the full flow
003-013  Write unit tests for ObservationStore
004-006  Implement keyboard navigation in ObservationList
004-013  Create PromotionList view for long-term to core promotions
```

### Wave 8 (Depends on Wave 7)
```
003-012  Implement analyze command wiring AnalysisEngine
003-014  Write unit tests for AnalysisEngine with mock adapters
004-014  Implement review command that spawns TUI process
```

### Wave 9 (Depends on Wave 8)
```
007-001  Implement cron install subcommand adding crontab entry
```

### Wave 10 (Depends on Wave 9)
```
007-003  Implement cron uninstall subcommand removing entries
```

---

## Summary

| JTBD | Tasks | First Wave | Last Wave |
|------|-------|------------|-----------|
| 001 - CLI Foundation | 5 | Wave 1 | Wave 3 |
| 002 - First-Time Setup | 8 | Wave 2 | Wave 7 |
| 003 - Session Analysis | 14 | Wave 2 | Wave 8 |
| 004 - Review TUI | 15 | Wave 2 | Wave 8 |
| 005 - Status Check | 5 | Wave 4 | Wave 6 |
| 006 - Configuration | 3 | Wave 4 | Wave 6 |
| 007 - Scheduled Automation | 4 | Wave 3 | Wave 10 |

**Total: 47 tasks across 10 waves**
