/**
 * Review Command Handler
 *
 * Entry point for `sanj review`. Loads pending observations,
 * spawns the TUI subprocess, and handles exit/results.
 *
 * @module cli/commands/review
 */

import { ObservationStore } from "../../storage/observation-store.ts";
import { OBSERVATIONS_PATH } from "../../storage/paths.ts";

/**
 * Handler for `sanj review` command.
 * Loads pending observations and spawns the TUI for interactive review.
 */
export async function handleReview(_ctx: unknown): Promise<void> {
  try {
    // Initialize ObservationStore
    const store = new ObservationStore(OBSERVATIONS_PATH);
    await store.load();

    // Get pending observations
    const pending = await store.getPending();

    if (pending.length === 0) {
      console.log("No observations pending review.");
      console.log('Run "sanj analyze" first to extract observations from sessions.');
      process.exit(0);
    }

    console.log(`Found ${pending.length} pending observation(s).`);
    console.log("Launching review TUI...\n");

    // Serialize observations for TUI subprocess
    const observationsJson = JSON.stringify(pending, null, 0);

    // Resolve TUI entry point path
    // When running via `bun run dev` or `bun src/cli/index.ts`, __dirname points to src/cli/commands
    // When running from dist/cli.js, we need to resolve relative to the source
    const path = await import("path");
    const tuiPath = path.resolve(
      path.dirname(new URL(import.meta.url).pathname),
      "../../tui/index.ts"
    );

    // Spawn TUI as child process
    const { spawn } = await import("child_process");
    const child = spawn("bun", [tuiPath, observationsJson], {
      stdio: ["inherit", "pipe", "pipe"],
    });

    // Collect stdout for results
    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr?.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    // Wait for child process to exit
    const exitCode = await new Promise<number>((resolve) => {
      child.on("close", (code: number | null) => {
        resolve(code ?? 1);
      });
    });

    if (exitCode !== 0) {
      if (stderr) {
        process.stderr.write(stderr);
      }
      console.error("Review TUI exited with error.");
      process.exit(1);
    }

    // Parse results from TUI stdout
    if (stdout.trim()) {
      try {
        const results = JSON.parse(stdout.trim());

        // Apply results to ObservationStore
        if (results.approvedObservations?.length > 0) {
          for (const id of results.approvedObservations) {
            await store.setStatus(id, "approved");
          }
        }

        if (results.deniedObservations?.length > 0) {
          for (const id of results.deniedObservations) {
            await store.setStatus(id, "denied");
          }
        }

        // Save updated observations
        await store.save();

        // Show summary
        const approved = results.approvedObservations?.length ?? 0;
        const denied = results.deniedObservations?.length ?? 0;
        const skipped = results.skippedObservations?.length ?? 0;

        console.log("\nReview complete:");
        console.log(`  Approved: ${approved}`);
        console.log(`  Denied:   ${denied}`);
        console.log(`  Skipped:  ${skipped}`);
      } catch {
        // TUI may not have output valid JSON (e.g., user quit immediately)
        console.log("\nReview session ended.");
      }
    } else {
      console.log("\nReview session ended.");
    }

    process.exit(0);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`Error: ${msg}`);
    process.exit(1);
  }
}
