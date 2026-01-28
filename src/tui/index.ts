/**
 * TUI Entry Point
 *
 * Spawned by the `sanj review` CLI command as a subprocess.
 * Receives observations as JSON via command-line argument,
 * initializes the OpenTUI renderer, renders the App component,
 * and outputs review results as JSON to stdout on exit.
 */

import { createRenderer } from "@opentui/core";
import { createReactRenderer } from "@opentui/react";
import React from "react";
import { App } from "./App.tsx";
import type { Observation } from "../core/types.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReviewResults {
  approvedObservations: string[];
  deniedObservations: string[];
  skippedObservations: string[];
}

// ---------------------------------------------------------------------------
// Input Parsing
// ---------------------------------------------------------------------------

function parseInput(): Observation[] {
  const arg = process.argv[2];
  if (!arg) {
    throw new Error(
      "No observations provided as input. Usage: bun src/tui/index.ts '<JSON>'"
    );
  }
  try {
    const parsed = JSON.parse(arg);
    if (!Array.isArray(parsed)) {
      throw new Error("Input must be a JSON array of observations");
    }
    // Deserialize date strings back to Date objects
    return parsed.map((obs: Record<string, unknown>) => ({
      ...obs,
      firstSeen: obs.firstSeen ? new Date(obs.firstSeen as string) : new Date(),
      lastSeen: obs.lastSeen ? new Date(obs.lastSeen as string) : new Date(),
    })) as Observation[];
  } catch (e) {
    throw new Error(
      `Invalid JSON input: ${e instanceof Error ? e.message : String(e)}`
    );
  }
}

// ---------------------------------------------------------------------------
// Renderer Setup
// ---------------------------------------------------------------------------

function createOpenTUIRenderer() {
  const renderer = createRenderer({});
  const reactRenderer = createReactRenderer(renderer);
  return { renderer, reactRenderer };
}

// ---------------------------------------------------------------------------
// App Rendering & Results Collection
// ---------------------------------------------------------------------------

async function renderApp(
  {
    renderer,
    reactRenderer,
  }: {
    renderer: ReturnType<typeof createRenderer>;
    reactRenderer: ReturnType<typeof createReactRenderer>;
  },
  observations: Observation[]
): Promise<ReviewResults> {
  const results: ReviewResults = {
    approvedObservations: [],
    deniedObservations: [],
    skippedObservations: [],
  };

  const element = React.createElement(App, {
    observations,
    onResults: (result: ReviewResults) => {
      Object.assign(results, result);
    },
  });

  reactRenderer.render(element);

  return new Promise<ReviewResults>((resolve) => {
    renderer.on("exit", () => {
      resolve(results);
    });
  });
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

function outputResults(results: ReviewResults): void {
  const json = JSON.stringify(results, null, 2);
  process.stdout.write(json + "\n");
}

// ---------------------------------------------------------------------------
// Error Handling
// ---------------------------------------------------------------------------

function handleError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[sanj tui] Error: ${message}\n`);
  if (process.argv.includes("--debug") && error instanceof Error && error.stack) {
    process.stderr.write(error.stack + "\n");
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  try {
    const observations = parseInput();
    const rendererPair = createOpenTUIRenderer();
    const results = await renderApp(rendererPair, observations);
    outputResults(results);
    process.exit(0);
  } catch (error) {
    handleError(error);
    process.exit(1);
  }
}

main();
