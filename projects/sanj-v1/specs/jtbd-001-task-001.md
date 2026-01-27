# Task Spec: 001-001 - Initialize Bun Project

**Task ID**: 001-001
**JTBD**: JTBD-001 - CLI Foundation
**Status**: Pending
**Dependencies**: None

---

## Purpose

This task establishes the foundational project structure for Sanj using Bun as the runtime and TypeScript as the language. It creates the essential configuration files (`package.json`, `tsconfig.json`, and `bunfig.toml`) that enable all subsequent development tasks.

This is Wave 1 work—the critical first step that unblocks four parallel development streams:
- CLI Entry Point (001-002)
- Storage/Paths Module (002-001)
- Core Types (003-001)
- TUI/OpenTUI Setup (004-001)

---

## Scope

### In Scope

- **package.json**: Project metadata, dependencies, scripts, and bin configuration
  - Set `name` to `"sanj"`
  - Set `version` to `"0.0.1"` (matches v1 pre-release)
  - Define `bin` entry pointing to future CLI entry point
  - List runtime dependencies: `clerc`, `@opentui/core`, `@opentui/react`, `react`
  - List dev dependencies: `typescript`, `@types/react`
  - Include scripts: `dev`, `build`, `test`, `start`
  - Mark as `type: "module"` (ESM-only, required for Bun + CLERC)

- **tsconfig.json**: TypeScript compiler configuration optimized for Bun
  - Target: ES2020 or newer (Bun supports modern features)
  - Module: ESNext (for tree-shaking and native imports)
  - Module resolution: Bundler (Bun's standard)
  - Strict mode: enabled
  - Source maps: enabled (aids debugging during development)
  - Lib: ES2020 + DOM (for TUI components)
  - Include/exclude patterns for src/ and tests/

- **bunfig.toml**: Bun-specific configuration
  - Preload scripts if needed (none for v1)
  - HTTP client configuration if required
  - Test configuration (test.root, test.timeout)

- **Directory structure**: Create essential folders
  - `src/` - source code
  - `src/cli/` - CLI layer
  - `src/core/` - core domain logic
  - `src/adapters/` - adapter implementations
  - `src/storage/` - storage/config layer
  - `src/tui/` - TUI layer
  - `tests/` - unit and integration tests

### Out of Scope

- Installing dependencies (will be deferred to manual `bun install` or task 001-002)
- Creating source files or implementing any functionality
- Setting up git hooks or pre-commit configuration
- Documentation beyond inline comments in config files
- Build output or distribution setup (optimizations for that come later)
- Environment-specific configs (.env files or secrets management)

---

## Acceptance Criteria

1. **package.json exists and is valid**
   - File located at project root: `/Users/kaviisuri/code/KaviiSuri/sanj/package.json`
   - Valid JSON syntax (parseable by `bun install`)
   - Contains `name: "sanj"`, `version: "0.0.1"`, `type: "module"`
   - Has `clerc` in dependencies
   - Has `typescript` and `@types/react` in devDependencies
   - Includes `bin` entry for future `sanj` command

2. **tsconfig.json exists and is valid**
   - File located at project root: `/Users/kaviisuri/code/KaviiSuri/sanj/tsconfig.json`
   - Valid JSON syntax
   - Targets ES2020 or newer
   - Module set to ESNext
   - Module resolution set to bundler
   - `strict: true` is enabled
   - `sourceMap: true` for debugging

3. **bunfig.toml exists (if needed)**
   - File located at project root: `/Users/kaviisuri/code/KaviiSuri/sanj/bunfig.toml`
   - Contains reasonable defaults for Bun
   - Includes test configuration (if applicable for v1)

4. **Directory structure is created**
   - Verify with `find sanj -type d -name src, core, cli, adapters, storage, tui, tests`
   - All directories are empty and ready for source files

5. **Project is verifiable**
   - Run `bun --version` and confirm Bun is available
   - Run `bunx tsc --version` and confirm TypeScript is available (after install)
   - No syntax errors in any config file

---

## Verification Steps

Execute these commands from the project root (`/Users/kaviisuri/code/KaviiSuri/sanj/`):

1. **Verify files exist and are readable**:
   ```bash
   test -f package.json && echo "✓ package.json exists"
   test -f tsconfig.json && echo "✓ tsconfig.json exists"
   test -f bunfig.toml && echo "✓ bunfig.toml exists"
   ```

2. **Validate JSON files**:
   ```bash
   bun --eval "console.log(JSON.parse(require('fs').readFileSync('package.json', 'utf-8')).name)"
   # Should output: sanj
   ```

3. **Check directory structure**:
   ```bash
   ls -d src src/cli src/core src/adapters src/storage src/tui tests
   # All should exist
   ```

4. **Verify TypeScript configuration**:
   ```bash
   bun --eval "const config = JSON.parse(require('fs').readFileSync('tsconfig.json', 'utf-8')); console.log('Module:', config.compilerOptions.module, 'Target:', config.compilerOptions.target)"
   ```

5. **Test dependency availability** (after running `bun install`):
   ```bash
   bun install
   test -d node_modules/clerc && echo "✓ clerc installed"
   test -d node_modules/typescript && echo "✓ typescript installed"
   ```

---

## Implementation Notes

### package.json Best Practices

- **Bin entry**: Point to the compiled/bundled CLI entry point. In development, this will be `src/cli/index.ts`. Final bundled output location TBD in task 001-002.
  ```json
  "bin": {
    "sanj": "./dist/cli.js"
  }
  ```
  (Update path when build setup is finalized)

- **Module type ESM**: CLERC is ESM-only and Bun has excellent ESM support. This is non-negotiable.

- **Scripts**: Start with minimal scripts:
  ```json
  "scripts": {
    "dev": "bun src/cli/index.ts",
    "build": "bun build src/cli/index.ts --outfile dist/cli.js",
    "test": "bun test",
    "start": "bun dist/cli.js"
  }
  ```

### tsconfig.json Best Practices

- **JSX handling**: Set `jsx: "react-jsx"` to support OpenTUI React components (uses new JSX transform).
- **Declaration files**: Include `declaration: true` to generate `.d.ts` files for library code (helpful for internal modules).
- **Path aliases** (optional, can add in future): TypeScript path mapping for cleaner imports:
  ```json
  "paths": {
    "@/*": ["src/*"]
  }
  ```
  (Deferred unless tasks 001-002+ indicate this is needed)

- **Include/Exclude patterns**:
  ```json
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
  ```

### bunfig.toml

- **Minimal for v1**. Can defer to defaults unless specific configuration is needed.
- **Example structure** (if created):
  ```toml
  [test]
  root = "./tests"
  timeout = 5000
  ```

### Directory Structure Rationale

```
sanj/
├── src/
│   ├── cli/              # Command routing, handlers
│   ├── core/             # Domain logic (AnalysisEngine, ObservationStore, MemoryHierarchy)
│   ├── adapters/         # Session, LLM, CoreMemory adapters
│   ├── storage/          # Config, state, paths utilities
│   └── tui/              # OpenTUI components and entry point
├── tests/                # Unit and integration tests
├── package.json          # Bun/npm metadata
├── tsconfig.json         # TypeScript config
├── bunfig.toml           # Bun config (optional)
├── .gitignore            # Already present in repo (leave as-is)
└── dist/                 # Build output (created by build script)
```

This matches the folder structure documented in HLD section "Folder Structure" (lines 244-310 of 05-hld.md).

---

## Dependencies

**Blocking tasks**: None (Wave 1 entry point)

**Unblocked tasks** (these depend on 001-001 completion):
- 001-002 - Install CLERC and create CLI entry point
- 002-001 - Create storage/paths.ts
- 003-001 - Define core types
- 004-001 - Install OpenTUI dependencies

**External dependencies**:
- Bun runtime (must be installed on developer machine)
- Node.js compatibility layer (via Bun)

---

## Technical Context

### Why Bun?

From research.md (lines 98):
- Fast execution and build times
- Native TypeScript support (no compilation step for dev)
- Works perfectly with CLERC (ESM-only library)
- Includes built-in test runner (reduces dev dependency count)

### Why CLERC?

From research.md (lines 54-79):
- CLI framework designed for Node.js, Deno, and Bun
- Strong TypeScript support
- Chainable API for composable commands
- Plugin system for help, version, error handling
- ESM-only (aligns with Bun)

### Why TypeScript?

- Type safety for complex domain logic (adapters, memory hierarchy)
- Better IDE support and refactoring tools
- Aligns with Bun's native TS support
- Helps document adapter interfaces

---

## Related Documents

- **PRD** (02-prd.md): User stories and project goals
- **JTBD** (03-jtbd.md): JTBD-001 defines the CLI Foundation job
- **Tasks** (04-tasks.md): Full task breakdown with dependencies
- **HLD** (05-hld.md): Architecture diagrams and component specifications
- **Research** (01-research.md): Technical research on CLERC, OpenTUI, and Bun

---

## Notes

- This is foundational work. Quality and correctness here prevent rework downstream.
- The project will remain in `src/` for all development; `dist/` is only for built artifacts.
- TypeScript strict mode will catch type errors early.
- After this task, developers should be able to clone the repo, run `bun install`, and proceed with 001-002.
