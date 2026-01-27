# Sanj Implementation Plan

## Project Overview

**Status**: Pre-implementation (Greenfield Project)
**Progress**: 1/54 tasks completed (2%)
**Current Focus**: Wave 1 - Foundation Setup
**Next Steps**: Begin with TASK-001 (Project scaffolding) and TASK-002 (Error handling framework)

## Summary

Sanj is a CLI tool that monitors AI coding assistant sessions, identifies patterns, and maintains a hierarchical memory system. The implementation is organized into 10 waves, with each wave building upon the previous ones. This plan tracks all 54 tasks across 7 Jobs to Be Done (JTBDs).

**Technology Stack**:
- Language: TypeScript
- CLI Framework: CLERC
- TUI Framework: OpenTUI
- Storage: File-based JSON
- Package Manager: pnpm

---

## Wave 1: Foundation (Tasks 1-3)

**Objective**: Establish project structure, error handling, and basic domain entities

### JTBD-001: CLI Foundation

- [x] **TASK-001**: Project scaffolding and TypeScript configuration
  - **Dependencies**: None (entry point)
  - **Deliverables**:
    - Initialize pnpm workspace with TypeScript
    - Configure tsconfig.json (strict mode, ESM)
    - Set up build tooling (tsup/esbuild)
    - Create src/ directory structure
  - **Acceptance Criteria**:
    - Project compiles without errors
    - pnpm build succeeds
    - ESM output verified
  - **Files**: package.json, tsconfig.json, src/index.ts

- [ ] **TASK-002**: Core error handling framework
  - **Dependencies**: TASK-001
  - **Deliverables**:
    - Create AppError base class with error codes
    - Implement ValidationError, ConfigError, StorageError
    - Add error serialization for logging
    - Create ErrorBoundary utility
  - **Acceptance Criteria**:
    - Error hierarchy works with instanceof checks
    - Error codes map correctly
    - Stack traces preserved
  - **Files**: src/lib/errors.ts

- [ ] **TASK-003**: Core domain models (Pattern, Session, Memory)
  - **Dependencies**: TASK-002
  - **Deliverables**:
    - Define Pattern type (id, type, description, count, etc.)
    - Define Session type (id, sessionPath, cwd, etc.)
    - Define Memory hierarchy types (Global, Project, Session)
    - Add TypeScript interfaces/types
  - **Acceptance Criteria**:
    - Types compile without errors
    - All fields match spec
    - Enums for MemoryLevel work correctly
  - **Files**: src/domain/types.ts

---

## Wave 2: Storage Foundation (Tasks 4-8)

**Objective**: Build file-based storage layer with configuration management

### JTBD-002: First-Time Setup & JTBD-006: Configuration

- [ ] **TASK-004**: Config schema and default values
  - **Dependencies**: TASK-003
  - **Deliverables**:
    - Define SanjConfig interface
    - Create default configuration object
    - Add configDir and memoryDir path resolution
    - Define analysis thresholds
  - **Acceptance Criteria**:
    - Config structure matches spec
    - Defaults validated
    - Path expansion works
  - **Files**: src/config/schema.ts

- [ ] **TASK-005**: Config file operations (read/write)
  - **Dependencies**: TASK-004
  - **Deliverables**:
    - Implement loadConfig() with validation
    - Implement saveConfig() with atomic writes
    - Add config file watching (optional)
    - Handle missing/malformed configs
  - **Acceptance Criteria**:
    - Config loads from ~/.sanj/config.json
    - Validation catches invalid configs
    - Write is atomic
  - **Files**: src/config/io.ts

- [ ] **TASK-006**: Storage interface definitions
  - **Dependencies**: TASK-003
  - **Deliverables**:
    - Define ISessionStore interface
    - Define IMemoryStore interface
    - Define IPatternStore interface
    - Add common storage types (Query, Filter)
  - **Acceptance Criteria**:
    - Interfaces complete per spec
    - No implementation yet (just contracts)
  - **Files**: src/storage/interfaces.ts

- [ ] **TASK-007**: File-based storage implementation
  - **Dependencies**: TASK-006
  - **Deliverables**:
    - Implement FileSessionStore
    - Implement FileMemoryStore
    - Implement FilePatternStore
    - Add atomic write operations
    - Handle file locking/concurrency
  - **Acceptance Criteria**:
    - All store methods work
    - Concurrent writes safe
    - Data persists correctly
  - **Files**: src/storage/file-store.ts

- [ ] **TASK-008**: First-time initialization logic
  - **Dependencies**: TASK-005, TASK-007
  - **Deliverables**:
    - Create initializeProject() function
    - Generate default config.json
    - Create directory structure (~/.sanj, memories/, sessions/)
    - Add welcome message logic
  - **Acceptance Criteria**:
    - Directories created if missing
    - Config file initialized
    - Idempotent (safe to run multiple times)
  - **Files**: src/setup/init.ts

---

## Wave 3: CLI Commands Structure (Tasks 9-13)

**Objective**: Set up CLERC-based CLI with basic commands

### JTBD-001: CLI Foundation

- [ ] **TASK-009**: CLERC integration and command registry
  - **Dependencies**: TASK-001
  - **Deliverables**:
    - Install and configure CLERC
    - Create CommandRegistry
    - Define base Command interface
    - Set up command discovery/registration
  - **Acceptance Criteria**:
    - CLERC initializes correctly
    - Commands can be registered
    - Help text generates
  - **Files**: src/cli/registry.ts, src/cli/types.ts

- [ ] **TASK-010**: sanj init command
  - **Dependencies**: TASK-008, TASK-009
  - **Deliverables**:
    - Create InitCommand class
    - Wire up to initializeProject()
    - Add prompts for user confirmation
    - Display success/error messages
  - **Acceptance Criteria**:
    - `sanj init` runs successfully
    - Creates config and directories
    - Shows helpful output
  - **Files**: src/commands/init.ts

- [ ] **TASK-011**: sanj config command
  - **Dependencies**: TASK-005, TASK-009
  - **Deliverables**:
    - Create ConfigCommand with subcommands
    - Implement `sanj config get <key>`
    - Implement `sanj config set <key> <value>`
    - Implement `sanj config list`
    - Add validation for config updates
  - **Acceptance Criteria**:
    - All subcommands work
    - Invalid keys rejected
    - Config persists after set
  - **Files**: src/commands/config.ts

- [ ] **TASK-012**: Global CLI setup (bin entry point)
  - **Dependencies**: TASK-009
  - **Deliverables**:
    - Create bin/sanj.ts entry point
    - Add shebang for Unix
    - Configure package.json bin field
    - Add --version and --help flags
  - **Acceptance Criteria**:
    - `sanj --version` shows version
    - `sanj --help` shows commands
    - Executable globally after install
  - **Files**: bin/sanj.ts, package.json

- [ ] **TASK-013**: CLI output formatting utilities
  - **Dependencies**: TASK-002
  - **Deliverables**:
    - Create Formatter class with colors
    - Add success/error/info/warning methods
    - Implement table formatting
    - Add spinner/progress utilities
  - **Acceptance Criteria**:
    - Colors work in terminals
    - Output is readable
    - No-color mode works
  - **Files**: src/cli/formatter.ts

---

## Wave 4: Session Discovery (Tasks 14-19)

**Objective**: Implement session detection and file monitoring

### JTBD-003: Session Analysis

- [ ] **TASK-014**: Conversation file parser
  - **Dependencies**: TASK-003
  - **Deliverables**:
    - Parse conversation.jsonl format
    - Extract messages, timestamps, model
    - Handle malformed/incomplete files
    - Build ConversationMessage type
  - **Acceptance Criteria**:
    - Valid JSONL parses correctly
    - Malformed lines skipped gracefully
    - Message sequence preserved
  - **Files**: src/parsers/conversation.ts

- [ ] **TASK-015**: Session metadata extractor
  - **Dependencies**: TASK-014
  - **Deliverables**:
    - Extract sessionId from path
    - Determine startTime and endTime
    - Calculate duration and messageCount
    - Extract cwd from messages
  - **Acceptance Criteria**:
    - Metadata complete and accurate
    - Handles missing fields gracefully
  - **Files**: src/parsers/session-metadata.ts

- [ ] **TASK-016**: Session discovery service
  - **Dependencies**: TASK-015, TASK-007
  - **Deliverables**:
    - Create SessionDiscoveryService
    - Scan ~/.claude directory for sessions
    - Filter by .claudesettings.local.json presence
    - Index all conversation.jsonl files
  - **Acceptance Criteria**:
    - Finds all valid sessions
    - Ignores invalid directories
    - Returns Session[] array
  - **Files**: src/services/session-discovery.ts

- [ ] **TASK-017**: File system watcher for new sessions
  - **Dependencies**: TASK-016
  - **Deliverables**:
    - Implement FileWatcher using chokidar
    - Watch ~/.claude for new directories
    - Detect new conversation.jsonl writes
    - Emit events for new sessions
  - **Acceptance Criteria**:
    - Detects new sessions in real-time
    - Handles file system errors
    - Can be stopped gracefully
  - **Files**: src/services/file-watcher.ts

- [ ] **TASK-018**: Session ingestion pipeline
  - **Dependencies**: TASK-017
  - **Deliverables**:
    - Create SessionIngestionService
    - Orchestrate discovery → parsing → storage
    - Handle duplicate sessions (idempotency)
    - Add ingestion logging
  - **Acceptance Criteria**:
    - New sessions stored correctly
    - Duplicates skipped
    - Errors logged but don't crash
  - **Files**: src/services/session-ingestion.ts

- [ ] **TASK-019**: Session indexing and querying
  - **Dependencies**: TASK-018
  - **Deliverables**:
    - Add indexed queries to FileSessionStore
    - Support filters (date range, cwd, status)
    - Implement sorting (by date, duration)
    - Add pagination support
  - **Acceptance Criteria**:
    - Queries return correct results
    - Filters work independently and combined
    - Performance acceptable (<100ms for 1000 sessions)
  - **Files**: src/storage/session-index.ts

---

## Wave 5: Pattern Detection (Tasks 20-26)

**Objective**: Analyze sessions and extract patterns

### JTBD-003: Session Analysis

- [ ] **TASK-020**: Tool usage analyzer
  - **Dependencies**: TASK-014
  - **Deliverables**:
    - Extract tool calls from conversation
    - Count frequency per tool
    - Track sequences (e.g., Read → Edit → Bash)
    - Calculate tool success rates
  - **Acceptance Criteria**:
    - All tool calls identified
    - Counts accurate
    - Sequences detected
  - **Files**: src/analyzers/tool-usage.ts

- [ ] **TASK-021**: Error pattern detector
  - **Dependencies**: TASK-014
  - **Deliverables**:
    - Identify error messages in output
    - Categorize errors (syntax, runtime, test failures)
    - Extract error context (file, line, message)
    - Track recurring errors
  - **Acceptance Criteria**:
    - Common errors detected
    - Categorization accurate
    - Context extracted correctly
  - **Files**: src/analyzers/error-detector.ts

- [ ] **TASK-022**: File interaction tracker
  - **Dependencies**: TASK-020
  - **Deliverables**:
    - Track Read/Write/Edit operations
    - Identify frequently modified files
    - Detect file hotspots (>10 edits)
    - Extract file paths correctly
  - **Acceptance Criteria**:
    - All file operations tracked
    - Paths normalized
    - Hotspots identified correctly
  - **Files**: src/analyzers/file-tracker.ts

- [ ] **TASK-023**: Workflow sequence detector
  - **Dependencies**: TASK-020
  - **Deliverables**:
    - Identify common action sequences
    - Detect patterns (e.g., test → fix → test)
    - Use sliding window for sequence detection
    - Score patterns by frequency
  - **Acceptance Criteria**:
    - Common workflows detected
    - Minimum 3-action sequences
    - Frequency counts accurate
  - **Files**: src/analyzers/workflow-detector.ts

- [ ] **TASK-024**: Pattern aggregation service
  - **Dependencies**: TASK-020, TASK-021, TASK-022, TASK-023
  - **Deliverables**:
    - Create PatternAggregationService
    - Merge patterns from all analyzers
    - Deduplicate similar patterns
    - Rank by significance (frequency, recency)
  - **Acceptance Criteria**:
    - All analyzer outputs combined
    - Deduplication works
    - Ranking sensible
  - **Files**: src/services/pattern-aggregation.ts

- [ ] **TASK-025**: Pattern storage and retrieval
  - **Dependencies**: TASK-024, TASK-007
  - **Deliverables**:
    - Implement FilePatternStore.save()
    - Implement FilePatternStore.query()
    - Support pattern filtering by type
    - Add pattern expiration (30 days default)
  - **Acceptance Criteria**:
    - Patterns persist correctly
    - Queries work with filters
    - Expiration logic correct
  - **Files**: src/storage/pattern-store.ts

- [ ] **TASK-026**: Session analysis orchestration
  - **Dependencies**: TASK-025
  - **Deliverables**:
    - Create SessionAnalysisService
    - Orchestrate: load session → analyze → extract patterns → store
    - Add analysis status tracking
    - Support batch analysis
  - **Acceptance Criteria**:
    - Single session analysis works
    - Batch analysis efficient
    - Status tracked correctly
  - **Files**: src/services/session-analysis.ts

---

## Wave 6: Memory System (Tasks 27-33)

**Objective**: Implement hierarchical memory (Global, Project, Session)

### JTBD-003: Session Analysis

- [ ] **TASK-027**: Memory hierarchy design
  - **Dependencies**: TASK-003
  - **Deliverables**:
    - Define Memory base class
    - Create GlobalMemory, ProjectMemory, SessionMemory subclasses
    - Implement inheritance chain (Session → Project → Global)
    - Add scoping rules
  - **Acceptance Criteria**:
    - Hierarchy structure correct
    - Inheritance works
    - Scoping logic defined
  - **Files**: src/domain/memory.ts

- [ ] **TASK-028**: Memory creation from patterns
  - **Dependencies**: TASK-027, TASK-025
  - **Deliverables**:
    - Create MemoryFactory
    - Convert patterns to memories
    - Apply significance thresholds
    - Assign correct memory level
  - **Acceptance Criteria**:
    - Patterns → memories conversion works
    - Thresholds applied correctly
    - Levels assigned properly
  - **Files**: src/services/memory-factory.ts

- [ ] **TASK-029**: Memory storage layer
  - **Dependencies**: TASK-028, TASK-007
  - **Deliverables**:
    - Implement FileMemoryStore.save()
    - Implement FileMemoryStore.load()
    - Support hierarchical queries
    - Add memory versioning
  - **Acceptance Criteria**:
    - Memories persist correctly
    - Hierarchical queries work
    - Versioning functional
  - **Files**: src/storage/memory-store.ts

- [ ] **TASK-030**: Memory promotion logic
  - **Dependencies**: TASK-029
  - **Deliverables**:
    - Implement promotion rules (e.g., 5+ sessions → Project)
    - Create MemoryPromotionService
    - Add promotion triggers
    - Log promotion events
  - **Acceptance Criteria**:
    - Promotion rules work
    - Memories move up hierarchy
    - Logs show promotions
  - **Files**: src/services/memory-promotion.ts

- [ ] **TASK-031**: Memory querying with inheritance
  - **Dependencies**: TASK-030
  - **Deliverables**:
    - Implement MemoryQueryService
    - Support context-aware queries (include parent levels)
    - Add filtering by type, level, recency
    - Implement relevance scoring
  - **Acceptance Criteria**:
    - Queries respect hierarchy
    - Filters work correctly
    - Relevance scores sensible
  - **Files**: src/services/memory-query.ts

- [ ] **TASK-032**: Memory pruning and expiration
  - **Dependencies**: TASK-031
  - **Deliverables**:
    - Implement MemoryPruningService
    - Remove stale memories (>90 days, configurable)
    - Prune low-significance memories
    - Add manual prune command
  - **Acceptance Criteria**:
    - Old memories removed
    - Low-significance pruned
    - Manual prune works
  - **Files**: src/services/memory-pruning.ts

- [ ] **TASK-033**: Memory-to-context pipeline
  - **Dependencies**: TASK-032
  - **Deliverables**:
    - Create ContextGeneratorService
    - Format memories for Claude context
    - Add relevance filtering
    - Support markdown output
  - **Acceptance Criteria**:
    - Context formatted correctly
    - Relevant memories included
    - Output is valid markdown
  - **Files**: src/services/context-generator.ts

---

## Wave 7: Review TUI - Foundation (Tasks 34-40)

**Objective**: Build OpenTUI-based interface for reviewing sessions

### JTBD-004: Review TUI

- [ ] **TASK-034**: OpenTUI integration and layout
  - **Dependencies**: TASK-001
  - **Deliverables**:
    - Install and configure OpenTUI
    - Create base TUI layout (header, sidebar, main, footer)
    - Set up component mounting
    - Configure keyboard shortcuts
  - **Acceptance Criteria**:
    - TUI renders in terminal
    - Layout responsive
    - Keyboard nav works
  - **Files**: src/tui/app.ts, src/tui/layout.ts

- [ ] **TASK-035**: Session list view component
  - **Dependencies**: TASK-034, TASK-019
  - **Deliverables**:
    - Create SessionListView component
    - Display sessions in table (date, cwd, duration, status)
    - Support sorting and filtering
    - Add keyboard navigation (j/k)
  - **Acceptance Criteria**:
    - Sessions display correctly
    - Sorting works
    - Navigation smooth
  - **Files**: src/tui/components/session-list.ts

- [ ] **TASK-036**: Session detail view component
  - **Dependencies**: TASK-035
  - **Deliverables**:
    - Create SessionDetailView component
    - Show session metadata
    - Display conversation messages
    - Show detected patterns
  - **Acceptance Criteria**:
    - Detail view renders
    - Messages formatted correctly
    - Patterns visible
  - **Files**: src/tui/components/session-detail.ts

- [ ] **TASK-037**: Pattern review component
  - **Dependencies**: TASK-036
  - **Deliverables**:
    - Create PatternReviewView component
    - List patterns with descriptions
    - Show pattern frequency and examples
    - Support approve/ignore actions
  - **Acceptance Criteria**:
    - Patterns listed clearly
    - Actions work (approve/ignore)
    - State updates correctly
  - **Files**: src/tui/components/pattern-review.ts

- [ ] **TASK-038**: Memory explorer component
  - **Dependencies**: TASK-037, TASK-031
  - **Deliverables**:
    - Create MemoryExplorerView component
    - Display memory hierarchy (tree view)
    - Show memory details on select
    - Support filtering by level
  - **Acceptance Criteria**:
    - Tree view renders
    - Hierarchy navigation works
    - Details display correctly
  - **Files**: src/tui/components/memory-explorer.ts

- [ ] **TASK-039**: TUI state management
  - **Dependencies**: TASK-034
  - **Deliverables**:
    - Create TUIState class
    - Manage current view, selected items
    - Implement state transitions
    - Add state persistence (optional)
  - **Acceptance Criteria**:
    - State updates trigger re-renders
    - Transitions smooth
    - No state leaks
  - **Files**: src/tui/state.ts

- [ ] **TASK-040**: TUI keyboard shortcuts and help
  - **Dependencies**: TASK-039
  - **Deliverables**:
    - Define keyboard shortcut map
    - Implement help overlay (?/h)
    - Add quit (q), navigation (j/k), actions (Enter, Space)
    - Display shortcuts in footer
  - **Acceptance Criteria**:
    - All shortcuts work
    - Help overlay shows shortcuts
    - No conflicts
  - **Files**: src/tui/keybindings.ts

---

## Wave 8: Review TUI - Actions (Tasks 41-46)

**Objective**: Add interactive actions to TUI

### JTBD-004: Review TUI

- [ ] **TASK-041**: Pattern approval workflow
  - **Dependencies**: TASK-037
  - **Deliverables**:
    - Implement approve pattern action
    - Convert approved pattern to memory
    - Update pattern status in storage
    - Show confirmation message
  - **Acceptance Criteria**:
    - Approval works
    - Memory created
    - UI updates
  - **Files**: src/tui/actions/approve-pattern.ts

- [ ] **TASK-042**: Pattern ignore workflow
  - **Dependencies**: TASK-037
  - **Deliverables**:
    - Implement ignore pattern action
    - Mark pattern as ignored in storage
    - Hide from future reviews
    - Add undo capability
  - **Acceptance Criteria**:
    - Ignore works
    - Pattern hidden
    - Undo functional
  - **Files**: src/tui/actions/ignore-pattern.ts

- [ ] **TASK-043**: Memory editing in TUI
  - **Dependencies**: TASK-038
  - **Deliverables**:
    - Implement edit memory action
    - Open text editor (EDITOR env var)
    - Validate and save changes
    - Update memory in storage
  - **Acceptance Criteria**:
    - Editor opens
    - Changes persist
    - Validation works
  - **Files**: src/tui/actions/edit-memory.ts

- [ ] **TASK-044**: Memory deletion workflow
  - **Dependencies**: TASK-038
  - **Deliverables**:
    - Implement delete memory action
    - Add confirmation prompt
    - Remove from storage
    - Update UI
  - **Acceptance Criteria**:
    - Confirmation required
    - Deletion works
    - UI updates
  - **Files**: src/tui/actions/delete-memory.ts

- [ ] **TASK-045**: Batch actions support
  - **Dependencies**: TASK-041, TASK-042
  - **Deliverables**:
    - Add multi-select mode (Space to toggle)
    - Implement batch approve
    - Implement batch ignore
    - Show selected count
  - **Acceptance Criteria**:
    - Multi-select works
    - Batch actions efficient
    - UI shows selection
  - **Files**: src/tui/actions/batch-actions.ts

- [ ] **TASK-046**: sanj review command integration
  - **Dependencies**: TASK-045, TASK-009
  - **Deliverables**:
    - Create ReviewCommand class
    - Launch TUI when invoked
    - Pass session filters as arguments
    - Handle TUI lifecycle
  - **Acceptance Criteria**:
    - `sanj review` launches TUI
    - Filters work (e.g., `sanj review --recent 7d`)
    - TUI exits cleanly
  - **Files**: src/commands/review.ts

---

## Wave 9: Status and Reporting (Tasks 47-51)

**Objective**: Implement status checks and reporting

### JTBD-005: Status Check

- [ ] **TASK-047**: Status summary generator
  - **Dependencies**: TASK-019, TASK-025, TASK-031
  - **Deliverables**:
    - Create StatusSummaryService
    - Aggregate stats (session count, patterns, memories)
    - Calculate growth metrics (new sessions today/week)
    - Format summary for display
  - **Acceptance Criteria**:
    - Summary includes all key metrics
    - Calculations accurate
    - Formatting clean
  - **Files**: src/services/status-summary.ts

- [ ] **TASK-048**: Recent activity reporter
  - **Dependencies**: TASK-047
  - **Deliverables**:
    - Show last N sessions
    - Display recent patterns
    - Show new memories
    - Add time-based filtering (24h, 7d, 30d)
  - **Acceptance Criteria**:
    - Recent items shown correctly
    - Time filters work
    - Output readable
  - **Files**: src/reporters/recent-activity.ts

- [ ] **TASK-049**: Memory statistics calculator
  - **Dependencies**: TASK-047
  - **Deliverables**:
    - Count memories by level
    - Calculate memory age distribution
    - Show top patterns
    - Add memory growth chart (optional)
  - **Acceptance Criteria**:
    - Counts accurate
    - Distribution correct
    - Top patterns ranked
  - **Files**: src/reporters/memory-stats.ts

- [ ] **TASK-050**: sanj status command
  - **Dependencies**: TASK-049, TASK-009
  - **Deliverables**:
    - Create StatusCommand class
    - Display status summary
    - Add --verbose flag for details
    - Format output with colors
  - **Acceptance Criteria**:
    - `sanj status` shows summary
    - --verbose adds details
    - Colors work
  - **Files**: src/commands/status.ts

- [ ] **TASK-051**: Health check diagnostics
  - **Dependencies**: TASK-050
  - **Deliverables**:
    - Check config validity
    - Verify storage directories exist
    - Check for stale sessions
    - Add `sanj doctor` command
  - **Acceptance Criteria**:
    - All checks run
    - Issues reported clearly
    - Suggestions provided
  - **Files**: src/commands/doctor.ts

---

## Wave 10: Automation (Tasks 52-54)

**Objective**: Add scheduled automation via cron

### JTBD-007: Scheduled Automation

- [ ] **TASK-052**: Background analysis runner
  - **Dependencies**: TASK-026
  - **Deliverables**:
    - Create BackgroundAnalysisService
    - Run full analysis pipeline
    - Handle errors gracefully
    - Log to file (~/.sanj/logs/analysis.log)
  - **Acceptance Criteria**:
    - Runs without user interaction
    - Errors don't crash process
    - Logs complete
  - **Files**: src/services/background-analysis.ts

- [ ] **TASK-053**: Cron job setup utilities
  - **Dependencies**: TASK-052
  - **Deliverables**:
    - Create cron job installer
    - Add `sanj automate enable` command
    - Generate crontab entry (hourly default)
    - Add `sanj automate disable` command
  - **Acceptance Criteria**:
    - Cron entry added/removed correctly
    - Works on macOS/Linux
    - User confirmation required
  - **Files**: src/commands/automate.ts, src/utils/cron.ts

- [ ] **TASK-054**: Notification system (optional)
  - **Dependencies**: TASK-053
  - **Deliverables**:
    - Add desktop notifications for new patterns
    - Support macOS notifications (osascript)
    - Support Linux notifications (libnotify)
    - Make notifications configurable
  - **Acceptance Criteria**:
    - Notifications show on schedule
    - User can disable
    - Platform-specific code works
  - **Files**: src/utils/notifier.ts

---

## Technical Notes

### Project Structure
```
sanj/
├── bin/
│   └── sanj.ts              # CLI entry point
├── src/
│   ├── analyzers/           # Pattern detection (Wave 5)
│   ├── cli/                 # CLERC integration (Wave 3)
│   ├── commands/            # CLI commands (Waves 3, 8, 9, 10)
│   ├── config/              # Configuration (Wave 2)
│   ├── domain/              # Core types and models (Waves 1, 6)
│   ├── lib/                 # Utilities and errors (Wave 1)
│   ├── parsers/             # File parsers (Wave 4)
│   ├── reporters/           # Reporting (Wave 9)
│   ├── services/            # Business logic (Waves 4, 5, 6, 9, 10)
│   ├── storage/             # Storage layer (Waves 2, 4, 5, 6)
│   ├── tui/                 # OpenTUI interface (Waves 7, 8)
│   │   ├── actions/         # TUI actions (Wave 8)
│   │   └── components/      # TUI components (Wave 7)
│   └── utils/               # Utilities (Wave 10)
├── tests/                   # Unit and integration tests
├── package.json
├── tsconfig.json
└── README.md
```

### Key Dependencies
- **CLERC**: CLI framework with command routing
- **OpenTUI**: Terminal UI framework with React-like components
- **chokidar**: File system watching
- **zod**: Schema validation
- **date-fns**: Date manipulation
- **chalk**: Terminal colors

### Development Workflow
1. Complete tasks within each wave before moving to next wave
2. Write tests alongside implementation (TDD encouraged)
3. Update this plan by checking off completed tasks
4. Document any deviations or blockers in task notes
5. Run `sanj doctor` after each wave to verify health

### Testing Strategy
- Unit tests: Individual analyzers, parsers, services
- Integration tests: Storage layer, CLI commands
- E2E tests: Full workflows (init → analyze → review → status)
- TUI tests: Component rendering and interactions

### Performance Targets
- Session ingestion: <100ms per session
- Pattern detection: <500ms per session
- TUI render: <16ms (60 FPS)
- Storage queries: <100ms for 1000 items

---

## Progress Tracking

Update this section as tasks are completed:

**Wave 1 (Foundation)**: 1/3 tasks completed
**Wave 2 (Storage)**: 0/5 tasks completed
**Wave 3 (CLI)**: 0/5 tasks completed
**Wave 4 (Discovery)**: 0/6 tasks completed
**Wave 5 (Patterns)**: 0/7 tasks completed
**Wave 6 (Memory)**: 0/7 tasks completed
**Wave 7 (TUI Foundation)**: 0/7 tasks completed
**Wave 8 (TUI Actions)**: 0/6 tasks completed
**Wave 9 (Status)**: 0/5 tasks completed
**Wave 10 (Automation)**: 0/3 tasks completed

**Total Progress**: 1/54 tasks (2%)

---

## Next Actions

**Immediate**: Start Wave 1
1. Run `pnpm init` to create package.json
2. Install TypeScript and build tools
3. Create src/ directory structure
4. Implement TASK-001 (scaffolding)

**After Wave 1**: Begin Wave 2 (Storage Foundation)
**Milestone 1**: Waves 1-3 complete (Basic CLI functional)
**Milestone 2**: Waves 4-6 complete (Core analysis working)
**Milestone 3**: Waves 7-8 complete (TUI functional)
**Milestone 4**: Waves 9-10 complete (Full feature set)

---

## Notes and Blockers

- None yet (greenfield project)
- Add blockers, questions, or deviations here as development progresses
- Track technical debt and refactoring needs

---

Last updated: 2026-01-26
