# Spec: Create TUI Entry Point in src/tui/index.ts

**Task ID**: 004-002
**JTBD**: 004 - Review & Approve Observations (TUI)
**Depends On**: 004-001 (OpenTUI dependencies installed and React reconciler configured)
**Blocks**: 004-003, 004-004, 004-007 (component tree that builds on this entry point)

---

## Overview

This task creates the OpenTUI entry point that will be spawned by the `sanj review` CLI command. The entry point initializes the TUI runtime, sets up the React reconciler, and renders the root application component.

**Location**: `/Users/kaviisuri/code/KaviiSuri/sanj/src/tui/index.ts`

---

## Objectives

1. Create a TUI entry point that receives observations from the CLI as input
2. Initialize the OpenTUI renderer with React reconciler
3. Set up the root App component (to be implemented in 004-003)
4. Handle TUI exit and return results to the CLI process
5. Provide clear error handling for TUI startup failures

---

## Architecture & Design

### TUI Initialization Flow

The `sanj review` command will:
1. Load pending observations from `ObservationStore`
2. Spawn a subprocess running the TUI entry point
3. Pass observations as serialized JSON via stdin or command-line argument
4. Wait for TUI process to exit
5. Read results (approved/denied observations) from stdout or a temp file

### Entry Point Responsibilities

The TUI entry point (`src/tui/index.ts`) will:
1. Accept observations as input (via JSON argument or stdin)
2. Create an OpenTUI renderer instance
3. Import and render the root `App.tsx` component
4. Handle keyboard events and TUI lifecycle events
5. Output results as JSON to stdout when user exits
6. Exit cleanly with appropriate status codes

---

## Requirements

### Functional Requirements

1. **Input Handling**
   - Accept observations as a JSON string passed via command-line argument
   - Alternatively, read from stdin if no argument provided
   - Validate JSON structure before rendering
   - Return helpful error message if input is malformed

2. **OpenTUI Initialization**
   - Create renderer using `createRenderer` from `@opentui/core`
   - Configure React reconciler from `@opentui/react`
   - Set up proper event listeners for keyboard input
   - Handle render completion and component mounting

3. **Component Rendering**
   - Render root `App` component at the correct hierarchy level
   - Pass observations and callbacks to App via props
   - Ensure App is properly mounted before proceeding

4. **Lifecycle Management**
   - Handle TUI exit event (user presses Escape or Ctrl+C)
   - Collect user's decisions (approve/deny/skip) during interaction
   - Serialize decisions to JSON output format
   - Restore terminal state on exit

5. **Error Handling**
   - Catch JSON parse errors with helpful messages
   - Handle missing @opentui dependencies gracefully
   - Provide debug output for troubleshooting (via --debug flag)
   - Exit with code 1 on critical errors, 0 on success

### Non-Functional Requirements

1. **Performance**
   - Startup time should be fast (under 2 seconds)
   - No unnecessary re-renders of the TUI on input
   - Memory usage reasonable for typical observation lists (10-100 items)

2. **Compatibility**
   - Works with OpenTUI >= 1.2.0 and Bun >= 1.2.0
   - Compatible with @opentui/react reconciler
   - Handles TMPDIR environment variable quirks on different platforms

3. **Debuggability**
   - Support `--debug` flag to output detailed startup logs
   - Include error context and stack traces in error messages
   - Make it easy to test the entry point with sample data

---

## Implementation Details

### File Structure

```typescript
// src/tui/index.ts

import { createRenderer } from "@opentui/core";
import { createReactRenderer } from "@opentui/react";
import React from "react";
import { App } from "./App";
import type { Observation } from "../core/types";

// TUI process entry point
```

### Function Signatures

#### Main Entry Point

```typescript
async function main(): Promise<void> {
  try {
    // 1. Parse input observations
    const observations = parseInput();

    // 2. Create OpenTUI renderer
    const renderer = createOpenTUIRenderer();

    // 3. Render app with observations
    const results = await renderApp(renderer, observations);

    // 4. Output results as JSON
    outputResults(results);

    process.exit(0);
  } catch (error) {
    handleError(error);
    process.exit(1);
  }
}
```

#### Input Parsing

```typescript
function parseInput(): Observation[] {
  // Try command-line argument first
  const arg = process.argv[2];
  if (arg) {
    try {
      return JSON.parse(arg);
    } catch (e) {
      throw new Error(`Invalid JSON in argument: ${e.message}`);
    }
  }

  // Fall back to stdin (for piping)
  // In practice, this may require async handling
  // TBD based on actual OpenTUI behavior

  throw new Error("No observations provided as input");
}
```

#### Renderer Setup

```typescript
function createOpenTUIRenderer() {
  const renderer = createRenderer({
    // Configuration options:
    // - stdout/stderr handling
    // - Raw mode configuration
    // - Size detection
  });

  // Create React reconciler
  const reactRenderer = createReactRenderer(renderer);

  return { renderer, reactRenderer };
}
```

#### App Rendering & Results Collection

```typescript
async function renderApp(
  { renderer, reactRenderer },
  observations: Observation[]
): Promise<ReviewResults> {
  // Create a results container to be mutated by App
  const results: ReviewResults = {
    approvedObservations: [],
    deniedObservations: [],
    skippedObservations: [],
  };

  // Render App component
  const element = React.createElement(App, {
    observations,
    onResults: (result: ReviewResults) => {
      Object.assign(results, result);
    },
  });

  // Mount React tree
  reactRenderer.render(element);

  // Wait for App to signal completion
  // This will be triggered by App when user exits TUI
  return new Promise((resolve) => {
    renderer.on("exit", () => {
      resolve(results);
    });
  });
}
```

#### Output Results

```typescript
function outputResults(results: ReviewResults): void {
  const json = JSON.stringify(results, null, 2);
  console.log(json);
}
```

### Input/Output Types

```typescript
// Input: Array of observations
interface Observation {
  id: string;
  text: string;
  count: number;
  sources: SessionReference[];
  status: "pending" | "approved" | "denied";
}

// Output: Review results
interface ReviewResults {
  approvedObservations: Observation[];
  deniedObservations: Observation[];
  skippedObservations: Observation[];
}
```

---

## Integration Points

### From CLI (`sanj review`)
The CLI command will:
1. Load observations from `ObservationStore`
2. Serialize to JSON
3. Spawn child process: `bun src/tui/index.ts '[JSON_OBSERVATIONS]'`
4. Capture stdout containing review results
5. Update `ObservationStore` based on results

### From App.tsx (004-003)
App will:
1. Receive observations as prop
2. Render ObservationList and ActionBar components
3. Call `onResults` callback when user exits
4. Trigger renderer exit event

### From Components (004-004, 004-007, etc.)
Components will emit action events (approve/deny/skip) that bubble up to App, which collects them and passes to `onResults`.

---

## Testing Strategy

### Unit Tests (optional for this task)
- Parse valid JSON input
- Parse invalid JSON and catch error
- Handle missing input gracefully

### Manual Testing
1. Create a sample observations.json file
2. Run: `bun src/tui/index.ts '[{"id":"1","text":"test","count":5,"sources":[],"status":"pending"}]'`
3. Verify TUI renders without crashing
4. Test that Escape/Ctrl+C exits cleanly
5. Verify JSON output on stdout

### Integration Testing (depends on 004-003+)
- Full flow: CLI → TUI → results back to CLI
- Verify results are correctly written to ObservationStore
- Test with different observation counts (1, 10, 100)

---

## Dependencies & Assumptions

### External Dependencies
- `@opentui/core` (installed in 004-001)
- `@opentui/react` (installed in 004-001)
- `react` (installed in 004-001)
- `bun` runtime >= 1.2.0

### Internal Dependencies
- `src/core/types.ts` - Observation and related types
- `src/tui/App.tsx` - Root component (created in 004-003)

### Assumptions
1. **Process Model**: TUI runs in a subprocess spawned by CLI
2. **Communication**: Observations passed as JSON argument, results via stdout
3. **Platform**: macOS/Linux only (OpenTUI limitation)
4. **Terminal State**: OpenTUI handles raw mode and terminal restoration
5. **React Compatibility**: App.tsx will be a React function component

---

## Edge Cases & Error Handling

| Scenario | Handling |
|----------|----------|
| No observations provided | Error message: "No observations provided. Usage: bun src/tui/index.ts '[JSON]'" |
| Invalid JSON | Error message: "Invalid JSON input: {parse error details}" |
| OpenTUI not installed | Error message: "OpenTUI dependencies not found. Run: bun install" |
| Terminal too small | Let OpenTUI handle (typically shows error in TUI) |
| Terminal not interactive | May fail gracefully or buffer input |
| User presses Ctrl+C | Graceful exit, restore terminal state |
| App.tsx not found | Module not found error from bun |

---

## Success Criteria

- [x] Entry point file created at `/src/tui/index.ts`
- [x] Accepts observations as JSON input (command-line argument)
- [x] Initializes OpenTUI renderer and React reconciler
- [x] Renders App component without errors
- [x] Collects user decisions (approve/deny/skip)
- [x] Outputs results as JSON to stdout
- [x] Exits cleanly with proper status code (0 success, 1 error)
- [x] Handles malformed input with helpful error messages
- [x] Supports --debug flag for troubleshooting (optional enhancement)

---

## Implementation Checklist

- [ ] Create `src/tui/index.ts` file
- [ ] Import required dependencies
- [ ] Implement `parseInput()` function
- [ ] Implement `createOpenTUIRenderer()` function
- [ ] Implement `renderApp()` async function
- [ ] Implement `outputResults()` function
- [ ] Implement `handleError()` function
- [ ] Implement `main()` entry point
- [ ] Add call to `main().catch(process.exit)`
- [ ] Test with sample observations
- [ ] Verify terminal restoration on exit
- [ ] Document any platform-specific quirks in comments
- [ ] Ensure TypeScript compilation succeeds

---

## Questions & Future Considerations

1. **TMPDIR Issues**: Does OpenTUI have TMPDIR quirks on macOS that need workarounds?
2. **stdin vs argv**: Should we support reading observations from stdin for large payloads, or is command-line argument sufficient?
3. **Debug Mode**: Should `--debug` flag output detailed logs? Where should they go (stderr, temp file)?
4. **Results Persistence**: Should TUI write results to a temp file instead of stdout for safety?
5. **Component Lifecycle**: How does App signal completion to the renderer? Via callback, event, or promise?

---

## Related Tasks

- **004-001**: OpenTUI dependencies setup (must be completed first)
- **004-003**: App.tsx root component
- **004-004**: ObservationItem component
- **004-005**: ObservationList component
- **004-007**: ActionBar component

---

## Reference Documentation

- OpenTUI Docs: https://github.com/opentui/opentui
- React Reconciler Pattern: Understanding how React renders to custom targets
- Bun subprocess model: Spawning and communicating with child processes
- CLI to TUI Communication: Patterns for passing data to subprocesses
