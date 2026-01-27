# Task Specification: 001-005

## Task Identity

- **Task ID**: 001-005
- **Task Name**: Configure package.json for global installation via bun
- **JTBD**: JTBD-001 - CLI Foundation
- **Dependency**: 001-002 (Install CLERC and create CLI entry point in src/cli/index.ts)

---

## Purpose

This task ensures that the Sanj CLI can be installed globally using `bun install -g`, making the `sanj` command available system-wide. This is the final piece of the CLI Foundation and enables users to invoke Sanj from anywhere on their system.

**What This Accomplishes**:
- Enables global installation without manual PATH setup
- Establishes Sanj as a first-class CLI tool
- Allows seamless user onboarding ("just install and run")
- Completes JTBD-001 requirements for a working CLI entry point

---

## Scope

### In Scope

1. **package.json configuration**:
   - Set `"bin"` field to map the `sanj` command to the compiled CLI entry point
   - Ensure correct path to the built TypeScript output
   - Verify executable permissions in the bin directory

2. **TypeScript compilation setup**:
   - Confirm `tsconfig.json` is configured for Bun compatibility
   - Verify output directory matches what `package.json` references
   - Check that `src/cli/index.ts` is the entry point

3. **Entry point validation**:
   - The compiled CLI should have proper shebang (`#!/usr/bin/env node` or Bun equivalent)
   - Verify the entry point exports the correct CLERC CLI instance

4. **Version management**:
   - Ensure version in `package.json` is correct and semantic
   - Documentation for version bumping process

### Out of Scope

1. **Publishing to npm/bun registry**: Version 1.0 is local-only
2. **Automated CI/CD for releases**: Manual releases for v1
3. **Windows support**: macOS/Linux only (per PRD constraints)
4. **Installation scripts beyond package.json**: No postinstall hooks needed for v1
5. **Uninstall/upgrade flows**: Beyond what `bun install -g` provides

---

## Acceptance Criteria

### Functional Requirements

1. **Global Installation Works**
   - [ ] `bun install -g .` (from repo root) completes without error
   - [ ] `which sanj` returns the installed binary path
   - [ ] `sanj --help` displays help text
   - [ ] `sanj --version` displays the correct version

2. **Entry Point Configuration**
   - [ ] `package.json` has `"bin": { "sanj": "<path-to-compiled-entry-point>" }`
   - [ ] Path in bin field is correct and relative to package.json root
   - [ ] Compiled CLI file exists and is executable after build

3. **Build Output**
   - [ ] TypeScript compiles without errors to the expected output directory
   - [ ] CLI entry point is properly built with correct imports resolved
   - [ ] No runtime errors when invoking compiled CLI

4. **Command Invocation**
   - [ ] `sanj` (no args) shows help
   - [ ] `sanj --help` shows detailed usage
   - [ ] `sanj --version` returns version from package.json
   - [ ] Unknown commands exit with code 1 and error message

### Non-Functional Requirements

1. **Performance**: Installation completes in < 10 seconds
2. **Portability**: Works from any directory without relative path issues
3. **Debugging**: Clear error messages if installation fails

---

## Implementation Notes

### Technical Guidance

#### 1. package.json Configuration

The `bin` field should point to the compiled JavaScript output of `src/cli/index.ts`:

```json
{
  "name": "sanj",
  "version": "0.1.0",
  "description": "CLI tool for managing AI coding assistant session observations",
  "bin": {
    "sanj": "dist/cli/index.js"
  },
  "main": "dist/index.js",
  "type": "module",
  "exports": {
    ".": "./dist/index.js"
  }
}
```

**Notes**:
- Path is relative to package.json root
- Use `dist/` as the output directory (adjust if tsconfig.json specifies differently)
- `"type": "module"` ensures ESM output (Bun + CLERC default)

#### 2. TypeScript/Build Configuration

Ensure `tsconfig.json` includes:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "moduleResolution": "bundler",
    "strict": true
  },
  "include": ["src/**/*"]
}
```

Verify that:
- `outDir` matches the path in package.json's `bin` field
- `rootDir` is `src/`
- TypeScript builds cleanly: `bun run build` or `tsc`

#### 3. Entry Point Shebang

The compiled `dist/cli/index.js` should have a shebang at the top:

```typescript
// src/cli/index.ts (top of file)
#!/usr/bin/env bun
// OR (if using node-compatible shebang)
#!/usr/bin/env node

import { Cli } from "clerc";
// ... rest of CLI setup
```

When Bun compiles to JavaScript, it preserves the shebang. Verify after build:

```bash
head -1 dist/cli/index.js
# Should output: #!/usr/bin/env bun (or node)
```

#### 4. Executable Permissions

After installation, Bun automatically sets executable permissions on files in the `bin` directory. No manual intervention needed.

#### 5. Build Script

Add a build script to package.json:

```json
{
  "scripts": {
    "build": "tsc",
    "dev": "bun run src/cli/index.ts",
    "test": "bun test"
  }
}
```

This allows:
- `bun run build` to compile TypeScript
- Local testing: `bun run src/cli/index.ts --help`
- Global testing: `bun install -g .` → `sanj --help`

#### 6. Version Management

Maintain version in one place:
- `package.json` has `"version": "0.1.0"`
- CLERC CLI reads from package.json at runtime:

```typescript
import { readFileSync } from "fs";

const pkg = JSON.parse(readFileSync("./package.json", "utf-8"));

Cli()
  .scriptName("sanj")
  .version(pkg.version)
  // ...
```

Or hardcode in one file and import it. Choose one approach and document it.

#### 7. Testing the Installation

After implementation, verify:

```bash
# Build
bun run build

# Check compiled entry point exists
ls -la dist/cli/index.js

# Check shebang
head -1 dist/cli/index.js

# Local test (before global install)
node dist/cli/index.js --help
# or
bun dist/cli/index.js --help

# Global install
bun install -g .

# Test global command
which sanj
sanj --help
sanj --version
sanj unknown-command  # Should exit with code 1
```

---

## Verification Steps (QA Checklist)

- [ ] **Build succeeds**: `bun run build` completes without errors
- [ ] **Shebang present**: `head -1 dist/cli/index.js` shows shebang
- [ ] **Entry point works locally**: `bun dist/cli/index.js --help` displays help
- [ ] **Global install succeeds**: `bun install -g .` completes without error
- [ ] **Command is in PATH**: `which sanj` returns valid path
- [ ] **Help works**: `sanj --help` displays help text
- [ ] **Version works**: `sanj --version` displays version from package.json
- [ ] **Unknown command handled**: `sanj bogus` exits with code 1 and helpful error
- [ ] **Works from any directory**: Test in multiple directories that `sanj --help` works
- [ ] **No hardcoded paths**: Binary should work regardless of install location

---

## Dependencies

### Task Dependencies

- **Blocks**: None (terminal task in Wave 3)
- **Blocked By**:
  - 001-002 (CLI entry point must exist first)

### External Dependencies

- **Bun**: For compilation and package management
- **TypeScript**: For compiling src/ → dist/
- **CLERC**: Already installed by 001-002

### File Dependencies

Files that must exist before this task:
- `/src/cli/index.ts` (created in 001-002)
- `/package.json` (created in 001-001)
- `/tsconfig.json` (created in 001-001)

Files modified by this task:
- `/package.json` (add `bin` field and build scripts)
- Potentially `/tsconfig.json` (verify/adjust `outDir`)

---

## Notes & Considerations

### Bun-Specific Details

- Bun's native support for ESM means no additional transpilation needed
- Bun's `install -g` works like npm's, respecting the `bin` field
- The shebang should be `#!/usr/bin/env bun` for Bun-based projects, but `#!/usr/bin/env node` also works for compatibility

### Common Pitfalls to Avoid

1. **Path mismatch**: If `bin` field points to wrong directory, installation fails
2. **No shebang**: Without shebang, the binary won't be executable
3. **Relative imports in CLI**: The compiled CLI should have all imports resolved relative to dist/ directory
4. **Version hardcoding**: Avoid hardcoding version; use package.json as source of truth

### Future Considerations

- When moving to npm/bun registry publishing, `package.json` metadata (author, license, repository, etc.) will need to be added
- Consider adding a `prepublish` or `build` script that runs automatically before package operations

---

## Success Definition

Task is complete when:

1. A developer clones the sanj repo
2. Runs `bun install -g .` from the project root
3. Can run `sanj`, `sanj --help`, and `sanj --version` from any directory
4. All commands work and exit with correct codes (0 for success, 1 for errors)
5. Package.json reflects the `bin` configuration clearly for maintainability

---

## References

- **JTBD-001**: CLI Foundation - https://github.com/.../03-jtbd.md (lines 3-25)
- **Task Breakdown**: Task 001-005 specification - https://github.com/.../04-tasks.md (lines 6-11)
- **HLD**: Folder structure and CLI layer - https://github.com/.../05-hld.md (lines 244-310, 65-82)
- **Research**: CLERC documentation - https://github.com/.../01-research.md (lines 57-79)

