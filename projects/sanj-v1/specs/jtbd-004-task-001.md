# Spec: JTBD-004-001 Install OpenTUI Dependencies and Configure React Reconciler

## Overview

This task establishes the foundation for the TUI (Terminal User Interface) layer by installing OpenTUI and its React reconciler, and configuring the build system to support TUI development. This is a critical prerequisite for all subsequent TUI tasks.

**Task ID**: 004-001
**JTBD**: 004 - Review & Approve Observations (TUI)
**Depends On**: 001-001 (Initialize Bun project)
**Blocked By**: None
**Blocks**: 004-002 (Create TUI entry point)

---

## Context

From the High-Level Design:
- **Technology**: OpenTUI with React reconciler (`@opentui/react`)
- **Runtime**: Bun (>= 1.2.0)
- **Purpose**: Enable interactive review interface for approving observations and promoting them through the memory hierarchy
- **TUI Views**: ObservationReview (pending observations) and PromotionReview (long-term to core promotion)

From the Research:
- OpenTUI is Bun-native and requires Bun >= 1.2.0
- React reconciler is available via `@opentui/react`
- Components available: box, text, input, select, scrollbox
- Framework is still in active development with some rough edges
- Known gotchas: TMPDIR env var issues, Windows compatibility problems (macOS/Linux only)

---

## Success Criteria

1. **Dependencies Installed**
   - `@opentui/core` is installed and available in node_modules
   - `@opentui/react` is installed and available in node_modules
   - `react` is installed (peer dependency for @opentui/react)

2. **Build System Configured**
   - TypeScript configuration supports .tsx files for TUI components
   - Bun runtime can execute OpenTUI-based files without errors
   - React import statements resolve correctly in .tsx files

3. **Verification Passing**
   - `bun --version` confirms Bun >= 1.2.0
   - No import errors when creating a test .tsx file with OpenTUI imports
   - package.json reflects all new dependencies with correct versions

4. **No Breaking Changes**
   - Existing CLI functionality (CLERC) remains unaffected
   - No conflicts with existing dependencies
   - TypeScript compilation passes for both .ts and .tsx files

---

## Detailed Requirements

### 1. Dependency Installation

#### 1.1 Core OpenTUI Packages

Install the following packages to the project:

```
@opentui/core - Latest stable version
@opentui/react - Latest stable version compatible with @opentui/core
```

**Rationale**: These are the core packages needed for building TUI applications with React in Bun. `@opentui/core` provides the rendering engine, and `@opentui/react` provides the React reconciler (JSX support).

#### 1.2 React Dependency

Ensure `react` is installed as a dependency (likely already installed from 001-001, but verify):

```
react - Version compatible with @opentui/react (typically 18.x or 19.x)
```

**Rationale**: @opentui/react requires React as a peer dependency. The reconciler uses React's component model and JSX compilation.

#### 1.3 Type Definitions

Ensure the following TypeScript definitions are available:

```
@types/react - Latest version compatible with installed react
```

**Rationale**: Provides TypeScript types for React components used in TUI code.

### 2. Build System Configuration

#### 2.1 TypeScript Configuration (tsconfig.json)

Update tsconfig.json to support JSX transformation:

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "react"
  }
}
```

**Rationale**:
- `jsx: "react-jsx"` enables automatic JSX transformation using React 17+ JSX runtime
- `jsxImportSource` ensures JSX elements are properly transformed
- This configuration allows .tsx files to use JSX syntax

#### 2.2 Project Structure

Create the TUI directory structure (empty directories, actual implementation in 004-002):

```
src/tui/
├── index.ts           # Will be created in 004-002
├── App.tsx            # Will be created in 004-003
└── components/        # Directory for future component files
    ├── ObservationList.tsx
    ├── ObservationItem.tsx
    ├── PromotionList.tsx
    └── ActionBar.tsx
```

**Rationale**: Establishes clear separation between CLI and TUI code. The components directory structure mirrors the expected implementation from the HLD.

#### 2.3 Package.json Entry Points

Verify package.json has appropriate structure for Bun:

```json
{
  "name": "sanj",
  "type": "module",
  "dependencies": {
    "@opentui/core": "latest",
    "@opentui/react": "latest",
    "react": "^18.0.0 or ^19.0.0"
  },
  "devDependencies": {
    "@types/react": "latest",
    "typescript": "latest"
  }
}
```

**Rationale**:
- `type: "module"` ensures ES modules are used (required for Bun native imports)
- Proper dependency declarations allow `bun install` to work correctly

### 3. Verification Steps

#### 3.1 Runtime Version Check

Verify Bun runtime meets minimum version requirement:

```bash
bun --version
# Must output 1.2.0 or later
```

#### 3.2 Dependency Availability

Verify packages are installed:

```bash
bun ls @opentui/core
bun ls @opentui/react
bun ls react
bun ls @types/react
```

All commands should return package information without errors.

#### 3.3 TypeScript Compilation

Create a test file at `src/tui/test.tsx`:

```tsx
import React from 'react';
import { render, Box, Text } from '@opentui/react';

export const TestComponent = () => {
  return (
    <Box>
      <Text>OpenTUI is working</Text>
    </Box>
  );
};
```

Verify it compiles:

```bash
bunx tsc --noEmit src/tui/test.tsx
# Should complete without errors
```

If successful, delete the test file. This verification can be automated in CI/CD.

#### 3.4 Runtime Execution

Verify OpenTUI can be imported and used at runtime:

```bash
bun eval "import { render, Box } from '@opentui/react'; console.log('OpenTUI loaded')"
```

Should output "OpenTUI loaded" without errors.

### 4. Environment Compatibility

#### 4.1 Supported Platforms

- **macOS**: Fully supported
- **Linux**: Fully supported
- **Windows**: Not supported by OpenTUI (skip TUI installation on Windows environments)

#### 4.2 Environment Variables

Be aware of potential issues:

- **TMPDIR**: On macOS, if TMPDIR is set to an unusual location, OpenTUI may have issues. Document this as a known gotcha but do not apply workarounds at this stage (can be handled in troubleshooting docs).

#### 4.3 Bun Version Requirement

- Minimum: Bun 1.2.0
- Document this requirement in README.md and package.json
- Installation scripts should validate this version

---

## Implementation Approach

### Step 1: Verify Prerequisites
- Confirm task 001-001 is completed (Bun project initialized)
- Check that package.json and tsconfig.json exist
- Verify current Bun version >= 1.2.0

### Step 2: Install Dependencies

```bash
bun add @opentui/core @opentui/react
# react should already be installed from 001-001, but verify
bun add --dev @types/react
```

### Step 3: Update TypeScript Configuration

Update `tsconfig.json` with JSX support as detailed in Section 2.1.

### Step 4: Create Directory Structure

```bash
mkdir -p src/tui/components
```

### Step 5: Verification

Execute all verification steps from Section 3 to confirm:
- Bun version is sufficient
- Packages are installed
- TypeScript can compile .tsx files
- Runtime can import OpenTUI

### Step 6: Documentation

Update project README.md with:
- Bun version requirement (>= 1.2.0)
- List of TUI dependencies added
- Known platform limitations (Windows not supported)
- Known gotchas (TMPDIR issue)

---

## Deliverables

1. **Updated package.json**
   - Contains @opentui/core, @opentui/react, react as dependencies
   - Contains @types/react as dev dependency
   - All versions are pinned or safely version-ranged

2. **Updated tsconfig.json**
   - `jsx: "react-jsx"` is set
   - `jsxImportSource: "react"` is set
   - All other existing configuration is preserved

3. **Directory Structure**
   - src/tui/ directory created
   - src/tui/components/ directory created (for future components)

4. **Verification Results**
   - All four verification steps from Section 3 pass
   - No TypeScript compilation errors
   - No runtime import errors
   - Bun version >= 1.2.0 confirmed

5. **Updated Documentation**
   - README.md updated with Bun version requirement
   - README.md includes note about Windows platform limitation

---

## Known Constraints

1. **Platform Support**: OpenTUI does not support Windows. This is a limitation of the framework, not a bug in Sanj.

2. **Early Development Stage**: OpenTUI is still in active development. Future versions may introduce breaking changes.

3. **Peer Dependencies**: @opentui/react requires React as a peer dependency. Version compatibility must be maintained.

4. **TypeScript/Bun Interaction**: Bun's native TypeScript support is excellent but may handle some edge cases differently than tsc. If issues arise during component development, they will be addressed in later tasks.

---

## Testing & Validation

- **Automated**: TypeScript compilation check for .tsx files
- **Manual**: Developer can import and use OpenTUI types in IDE
- **Runtime**: `bun eval` command successfully imports OpenTUI

No unit tests required for this task (it's a configuration task). Integration testing will occur in 004-002 and later tasks when actual TUI code is written.

---

## Notes & Gotchas

1. **TMPDIR on macOS**: OpenTUI may have issues if TMPDIR is set to an unusual location. This is a known framework limitation. If users encounter issues, the solution is typically to ensure TMPDIR points to /var/tmp or /tmp.

2. **React Version Compatibility**: When installing @opentui/react, use the version that is compatible with the React version in the project. The package manager should handle this automatically, but if there are peer dependency warnings, consult OpenTUI's documentation.

3. **No Need for Svelte/Vue**: Only React reconciler is installed. This is intentional based on the HLD and project requirements.

4. **Bun Compatibility**: This task assumes Bun >= 1.2.0. If the user has an older version of Bun, they must upgrade before proceeding.

---

## Dependencies & Sequencing

**This task depends on**:
- 001-001 (Bun project initialization with package.json and tsconfig.json)

**This task unblocks**:
- 004-002 (Create TUI entry point - needs OpenTUI packages to be available)
- All other TUI component tasks (004-003 through 004-014)

**Parallel work**:
- Other JTBD-001, JTBD-002, JTBD-003 tasks can proceed in parallel since they don't depend on TUI

---

## Acceptance Checklist

- [ ] @opentui/core is installed and `bun ls` shows it
- [ ] @opentui/react is installed and `bun ls` shows it
- [ ] react is installed and `bun ls` shows it
- [ ] @types/react is installed as a dev dependency
- [ ] tsconfig.json has `jsx: "react-jsx"` set
- [ ] tsconfig.json has `jsxImportSource: "react"` set
- [ ] src/tui/ directory exists
- [ ] src/tui/components/ directory exists
- [ ] TypeScript test file compiles without errors
- [ ] `bun eval` can import @opentui/react successfully
- [ ] Bun version is >= 1.2.0
- [ ] README.md documents Bun version requirement
- [ ] README.md notes Windows platform limitation
- [ ] package.json reflects all changes
- [ ] No breaking changes to existing CLI code
- [ ] All verification steps pass

---

## References

- **High-Level Design**: Section on TUI Layer, Components, Dependencies
- **Research**: OpenTUI Framework notes
- **Task Dependencies**: From 04-tasks.md
- **Project Structure**: From 05-hld.md Folder Structure section
