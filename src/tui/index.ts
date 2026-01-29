/**
 * TUI Entry Point
 *
 * Spawned by the `sanj review` CLI command as a subprocess.
 * Receives observations as JSON via command-line argument,
 * initializes the OpenTUI renderer, renders the App component,
 * and outputs review results as JSON to stdout on exit.
 */

import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
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
// App Rendering & Results Collection
// ---------------------------------------------------------------------------

async function renderApp(observations: Observation[]): Promise<ReviewResults> {
  return new Promise<ReviewResults>(async (resolve) => {
    const results: ReviewResults = {
      approvedObservations: [],
      deniedObservations: [],
      skippedObservations: [],
    };

    const renderer = await createCliRenderer({
      exitOnCtrlC: false, // Handle Ctrl+C ourselves
    });

    const element = React.createElement(App, {
      observations,
      onResults: (result: ReviewResults) => {
        Object.assign(results, result);
        resolve(results);
        // Note: renderer.destroy() is called by App component on exit
      },
    });

    createRoot(renderer).render(element);
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
// Exported Run Function
// ---------------------------------------------------------------------------

/**
 * Run the TUI with the given observations.
 * Can be called directly from review command without subprocess.
 */
export async function runTUI(observations: Observation[]): Promise<ReviewResults> {
  return renderApp(observations);
}

// ---------------------------------------------------------------------------
// Main (for standalone execution)
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  try {
    const observations = parseInput();
    const results = await runTUI(observations);
    outputResults(results);
    process.exit(0);
  } catch (error) {
    handleError(error);
    process.exit(1);
  }
}

// Only run main if executed directly (not imported)
if (import.meta.main) {
  main();
}
